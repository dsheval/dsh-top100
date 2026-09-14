import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { cacheMatches, decide, extractFunctionParagraphs, matchingHistory, readmeCacheName, run } from '../audit-description-evidence.mjs';
import { summarizeSelectedReadme } from '../../collector/src/reviewed-summary.ts';
const doc = '# Example\n\n为 DSH 提供项目文件搜索和结果预览，支持按文件名定位工作区文件并显示匹配内容。\n\n## 安装\n\nnpm install example\n';
function fixture() {
 const row = { fullName: 'example/project', type: 'cordis-plugin', pushedAt: '2026-09-09T00:00:00Z', description: 'Project tools', readmeSummary: summarizeSelectedReadme('example/project', { packageName: 'example-plugin', repositoryPath: 'packages/plugin' }, doc), install: { packageName: 'example-plugin', repositoryPath: 'packages/plugin', discovery: { status: 'review-required', sourceRevision: '2026-09-09T00:00:00Z' } } };
 const cache = { schemaVersion: 6, sourceDocumentVersion: 2, installParserVersion: 3, checkedAt: '2026-09-10T00:00:00Z', pushedAt: row.pushedAt, subdir: 'packages/plugin', readmeSummary: row.readmeSummary, detection: { isPlugin: true, type: row.type, packageName: 'example-plugin', pluginPath: 'packages/plugin', evidence: ['subdir packages/plugin/ validated bundle declaration and entry'] } };
 return { row, cache, audit: { offlineGroup: 'subpackage-source' }, document: { text: doc, conflict: false } };
}
const generic = { reason: '当前摘要未标明所选子包或路径，需取得子包自身 README 后再生成内容。' };
const call = (f, histories = [], hold = generic) => decide(f.row, f.audit, f.cache, f.document, histories, hold);
test('same version, exact package README satisfies only generic source-name hold', () => { const d=call(fixture());assert.equal(d.queue,'writing');assert.equal(d.evidence.cacheReused,true);assert.equal(d.requiresReviewBeforeApply,true);assert.equal(d.evidence.runtimeInstallVerified,false); });
for (const [label, mutate] of [
 ['stale pushedAt',f=>f.row.pushedAt='2026-09-12T00:00:00Z'],
 ['different package',f=>f.cache.detection.packageName='sibling'],
 ['different subdirectory',f=>f.cache.detection.pluginPath='packages/sibling'],
 ['different README selection',f=>f.cache.subdir=null],
 ['old discovery policy',f=>f.cache.schemaVersion=5],
 ['old source document policy',f=>f.cache.sourceDocumentVersion=1],
 ['unverified declaration',f=>f.cache.detection.evidence=['has package.json']],
 ['missing checked time',f=>delete f.cache.checkedAt],
 ['different plugin type',f=>f.cache.detection.type='skill'],
 ['not plugin',f=>f.cache.detection.isPlugin=false],
]) test(`reject cache: ${label}`,()=>{const f=fixture();mutate(f);assert.equal(cacheMatches(f.row,f.cache),false);assert.equal(call(f).queue,'exceptions');});
test('root document cannot supply sibling package evidence',()=>{const f=fixture();f.document.text='# Parent\nAn entire desktop product that provides many other services.';assert.equal(call(f).queue,'exceptions');});
test('conflicting branch docs cannot be promoted',()=>{const f=fixture();f.document.conflict=true;assert.equal(call(f).queue,'exceptions');});
test('fixed editorial suspension survives valid structure and README',()=>assert.equal(call(fixture(),[],{reason:'当前来源的内容已被复核撤回，须确认具体插件能力后再恢复。'}).queue,'exceptions'));
test('root runtime cannot become writing/reuse candidate',()=>{const f=fixture();f.row.install.packageName='@deepseek-ai/dsh-root';assert.equal(call(f).queue,'identity');});
test('dependency finding preserves correction route despite legacy detection success',()=>{const f=fixture();f.audit.offlineGroup='dependency-library';assert.equal(call(f).queue,'identity');});
test('manual and changed-identity constraints are not bypassed',()=>{for(const offlineGroup of ['manual-evidence','identity-change','fixed-evidence-hold','scoped-function','notice-replacement']){const f=fixture();f.audit.offlineGroup=offlineGroup;assert.equal(call(f).queue,'exceptions');}});
test('same-source historical Chinese yields independent reuse candidate',()=>{const f=fixture();const h={file:'old.json',row:{...f.row,descriptionZh:'提供项目文件搜索和结果预览。'}};assert.equal(call(f,[h]).queue,'reuse');});
test('old Chinese from sibling path is never reused',()=>{const f=fixture();const h={file:'old.json',row:{...f.row,install:{...f.row.install,repositoryPath:'packages/sibling'},descriptionZh:'其他包的中文说明。'}};assert.equal(matchingHistory(f.row,[h]).matches.length,0);});
test('conflicting historical Chinese requires selection',()=>{const f=fixture();const h=['为智能体提供项目文件搜索和结果预览。','为智能体提供会话管理以及不同工具功能。'].map(text=>({file:'old.json',row:{...f.row,descriptionZh:text}}));assert.equal(call(f,h).queue,'exceptions');});
test('only explicitly labeled release/tested versions may match',()=>{const f=fixture();f.row.readmeSummary='Current plugin release: 0.2.0 Tested with DSH 0.3.0 supports preview';const h={file:'old',row:{...f.row,readmeSummary:'Current plugin release: 0.1.0 Tested with DSH 0.2.0 supports preview',descriptionZh:'为智能体提供项目文件搜索与结果预览。'}};assert.equal(matchingHistory(f.row,[h]).matches[0].match,'release-labels-only');h.row.readmeSummary='Requires version 0.1.0 supports preview';assert.equal(matchingHistory(f.row,[h]).matches.length,0);});
test('repository description change is not automatic reuse',()=>{const f=fixture();assert.equal(matchingHistory(f.row,[{file:'old',row:{...f.row,description:'Old capabilities',descriptionZh:'旧能力说明。'}}]).text,null);});
test('README cache key binds owner, path, revision, branch',()=>{const k=readmeCacheName('Owner/Repo','packages/plugin','rev','main');const hash=createHash('sha256').update(JSON.stringify(['owner/repo','packages/plugin/README.md','rev','main'])).digest('hex');assert.equal(k,`v2_${hash}.json`);assert.notEqual(k,readmeCacheName('Owner/Repo',null,'rev','main'));assert.notEqual(k,readmeCacheName('Owner/Repo','packages/plugin','rev','master'));});
test('functional extraction skips installation and fenced code',()=>{const lines=extractFunctionParagraphs(doc+'\n```\n自动执行所有安装命令与相关配置并提供更多工具功能。\n```');assert.equal(lines.length,1);assert.ok(!lines[0].includes('npm'));});
test('CLI runner consumes cache offline and validates scope; source inputs untouched',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-offline-evidence-'));
 try{
 const f=fixture();const put=(p,d)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(d));};
 const inventory=path.join(temp,'inventory.json'),snapshot=path.join(temp,'snapshot.json'),cacheRoot=path.join(temp,'cache'),output=path.join(temp,'out');
 put(inventory,{rows:[{...f.audit,fullName:f.row.fullName,rank:1,description:f.row.description,readmeSummary:f.row.readmeSummary,packageName:f.row.install.packageName,repositoryPath:f.row.install.repositoryPath}]});put(snapshot,{rankings:{total:[f.row]}});
 put(path.join(cacheRoot,'detect','example_project.json'),f.cache);
 put(path.join(cacheRoot,'roots','example_project_2026-09-09T00_00_00Z.json'),[{url:'https://api.github.com/repos/example/project/contents/package.json?ref=main'}]);
 put(path.join(cacheRoot,'readmes',readmeCacheName(f.row.fullName,'packages/plugin',f.row.pushedAt,'main')),doc);
 const before=fs.readFileSync(snapshot);const s=run({inventory,snapshot,cacheRoot,output});assert.equal(s.counts.writing,1);assert.equal(s.actualApiRequests,0);assert.deepEqual(fs.readFileSync(snapshot),before);
 assert.throws(()=>run({inventory,snapshot,cacheRoot,output:cacheRoot}),/separate/);
 const x=JSON.parse(fs.readFileSync(inventory));x.rows[0].packageName='new';put(inventory,x);assert.throws(()=>run({inventory,snapshot,cacheRoot,output}),/Stale identity/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('same-source raw repository blurb is not accepted as reviewed Chinese',()=>{const f=fixture();f.row.description='神秘小玩意大集合，包含多种不同的小工具。';const h={file:'old',row:{...f.row,descriptionZh:f.row.description}};const d=matchingHistory(f.row,[h]);assert.equal(d.text,null);assert.equal(d.rejected.length,1);});
test('old translated field that is merely a fragment of parent description is rejected',()=>{const f=fixture();f.row.description='Catnap Studio 的 Windows 桌面版，基于 DeepSeek Harness 构建。非官方产品。';const h={file:'old',row:{...f.row,descriptionZh:'Catnap Studio 的 Windows 桌面版，基于 DeepSeek Harness 构建。'}};assert.equal(matchingHistory(f.row,[h]).text,null);});
test('README paragraphs join wrapped lines and skip release validation',()=>{assert.deepEqual(extractFunctionParagraphs('# Tool\n\nThis plugin provides file search\nand preview inside DSH conversations.\n\n## Release validation\n\n触发方式：推送 tag 或在 GitHub 创建 Release。'),['This plugin provides file search and preview inside DSH conversations.']);});

test('explicit discontinued plugin remains an exception even with complete docs',()=>{const f=fixture();f.document.text='# DISCONTINUED\n\nThis plugin is no longer maintained.\n\n'+doc;f.row.readmeSummary=summarizeSelectedReadme(f.row.fullName,{packageName:f.row.install.packageName,repositoryPath:f.row.install.repositoryPath},f.document.text);f.cache.readmeSummary=f.row.readmeSummary;assert.equal(call(f).queue,'exceptions');});
