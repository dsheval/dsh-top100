import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DshPlugin } from '@dsh-top100/schema';
import type { RankingsDocument } from '../src/rankings.js';
import { refreshBoardSource, refreshBoardSources } from '../src/board-source-refresh.js';
import { fetchRawFile, fetchFileViaApi, fetchRepoRoot, githubFetch } from '../src/github.js';
import { descriptionFor, PENDING_DESCRIPTION_ZH } from '../../plugin/src/shared/description-rules.js';
import { reviewedDescription } from '../src/editorial.js';
import { hasSelectedReadmeEvidence } from '../src/readme-evidence.js';
import { matchingEditorialHold } from '../src/content-source.js';
vi.mock('../src/github.js',()=>({githubFetch:vi.fn(),fetchRawFile:vi.fn(),fetchFileViaApi:vi.fn(),fetchRepoRoot:vi.fn()}));
const commit='a'.repeat(40),now=Date.parse('2026-09-15T00:00:00Z');
const pkg={name:'@fixture/selected',dsh:{bundle:{patch:'./cordis.patch.yml'}}};
function source(id='a/project'):DshPlugin{return {id,fullName:id,name:id.split('/')[1],type:'cordis-plugin',description:'Root project',descriptionZh:null,
 readmeSummary:'Search files in the current project.',topics:[],tags:[],stars:1,lastCheckedAt:'old',
 install:{method:'pnpm-profile',needsConfig:false,packageName:pkg.name,repositoryPath:'packages/selected',
 discovery:{status:'review-required',kind:'bundle',evidence:['historical'],checkedAt:'old',policyVersion:6,sourceRevision:'old'}}} as DshPlugin;}
function ranking(rows:DshPlugin[]):RankingsDocument{return {rankings:{hot:rows.map((p,i)=>({...p,rank:i+1})),rising:[],total:rows},directories:{skills:[]}} as unknown as RankingsDocument;}
beforeEach(()=>{
 vi.resetAllMocks();
 vi.mocked(githubFetch).mockImplementation(async path=>path.includes('/commits/')?{sha:commit}:{full_name:'a/project',default_branch:'main'});
 vi.mocked(fetchRepoRoot).mockResolvedValue(['package.json','cordis.patch.yml'].map(name=>({name,path:name,type:'file'})) as never);
 vi.mocked(fetchFileViaApi).mockResolvedValue({content:JSON.stringify(pkg),sha:'file'});
 vi.mocked(fetchRawFile).mockResolvedValue('# Selected\n\nSearch files in the current project.');
});
describe('board source refresh',()=>{
 it('pins all source reads, rechecks a retained package and records selected README evidence',async()=>{
  const result=await refreshBoardSource(source(),now);expect(result.status).toBe('verified');
  expect(result.source!.install.discovery!.checkedAt).toBe(new Date(now).toISOString());
  expect(hasSelectedReadmeEvidence(result.source!)).toBe(true);
  for(const call of vi.mocked(fetchRepoRoot).mock.calls)expect(call[1]).toBe(commit);
  for(const call of vi.mocked(fetchFileViaApi).mock.calls)expect(call[2]).toBe(commit);
  expect(fetchRawFile).toHaveBeenCalledWith('a/project','packages/selected/README.md',commit);
 });
 it('does not substitute root README for missing package documentation',async()=>{
  vi.mocked(fetchRawFile).mockResolvedValue(null);
  const result=await refreshBoardSource(source(),now);
  expect(result.source!.readmeSummary).toBeNull(); expect(hasSelectedReadmeEvidence(result.source!)).toBe(false);
  expect(fetchRawFile).toHaveBeenCalledTimes(1);expect(matchingEditorialHold(result.source!)).not.toBeNull();
 });
 it('holds the SDK wrapper instead of generating Chinese or retaining install claims',async()=>{
  vi.mocked(fetchFileViaApi).mockResolvedValue({sha:'sdk',content:JSON.stringify({name:pkg.name,main:'dist/index.js',dependencies:{'@deepseek-ai/dsh-sdk-client':'*','@deepseek-ai/dsh-attachment':'*'}})});
  vi.mocked(fetchRepoRoot).mockResolvedValue([{name:'package.json',path:'package.json',type:'file'}] as never);
  const old=source();old.descriptionZh='旧的插件简介应该在错误收录时撤回。';old.install.commands=['dsh plugin add @fixture/selected'];
  const result=await refreshBoardSource(old,now);expect(result.status).toBe('review-required');
  expect(result.source!.install.commands).toBeUndefined();expect(fetchRawFile).not.toHaveBeenCalled();
  expect(reviewedDescription(result.source!)).toBe(PENDING_DESCRIPTION_ZH);
  expect(descriptionFor(result.source! as never)).toBe(PENDING_DESCRIPTION_ZH);
 });
 it('retains old evidence and Chinese after an inconclusive read without inventing a fresh check',async()=>{
  vi.mocked(fetchFileViaApi).mockResolvedValue(null);const old=source();old.descriptionZh='搜索文件并整理项目资料。';
  const result=await refreshBoardSource(old,now);expect(result.status).toBe('review-required');
  expect(result.source!.descriptionZh).toBe(old.descriptionZh);expect(result.source!.install.discovery!.checkedAt).toBe('old');
 });
 it('excludes newly private repositories without fetching content',async()=>{
  vi.mocked(githubFetch).mockResolvedValue({private:true});expect((await refreshBoardSource(source(),now)).status).toBe('excluded');
  expect(fetchRawFile).not.toHaveBeenCalled();expect(fetchFileViaApi).not.toHaveBeenCalled();
 });
 it('has zero reads at startup and only checks current top100 once with a hard bound',async()=>{
  const rows=Array.from({length:103},(_,i)=>source(`a/${i}`));const refresh=vi.fn(async(s:DshPlugin)=>({status:'verified' as const,source:s,reason:'ok'}));
  expect(await refreshBoardSources(rows,()=>ranking(rows),{enabled:false,now,refresh})).toEqual([]);expect(refresh).not.toHaveBeenCalled();
  const report=await refreshBoardSources(rows,()=>ranking(rows),{enabled:true,now,refresh});expect(report).toHaveLength(100);
  expect(refresh.mock.calls.map(([s])=>s.id)).not.toContain('a/100');
 });
 it('checks entrants after exclusions and respects the total request cap',async()=>{
  const rows=[source('a/1'),source('a/2'),source('a/3')];
  const refresh=vi.fn(async(s:DshPlugin)=>s.id==='a/1'?{status:'excluded' as const,reason:'private'}:{status:'verified' as const,source:s,reason:'ok'});
  const report=await refreshBoardSources(rows,()=>ranking(rows.slice(0,1)),{enabled:true,now,refresh,limit:2});
  expect(report).toHaveLength(2);expect(rows.map(s=>s.id)).toEqual(['a/2','a/3']);expect(report[0].fullName).toBe('[excluded repository]');
 });
});
