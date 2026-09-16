/** Offline acceptance against one already-built npm archive. No models or remote services. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { publishRankings } from '../collector/src/publish-rankings.ts';
import reviews from '../collector/config/reviewed-descriptions.json';
import { descriptionDisplayFor as websiteDescription } from '../web/public/description-presentation.js';

const archive = resolve(process.argv[2] ?? '');
assert(archive.endsWith('.tgz'), 'Pass an existing candidate tarball');
const hash = () => createHash('sha256').update(readFileSync(archive)).digest('hex');
const beforeHash = hash();
const temporary = mkdtempSync(join(tmpdir(), 'description-decoupling-'));
const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync('tar', ['-xzf', archive, '-C', temporary]);
symlinkSync(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
process.env.DSH_TOP100_CACHE_DIR = join(temporary, 'cache');
const installed = join(temporary, 'package');
const manifest = JSON.parse(readFileSync(join(installed, 'package.json'),'utf8'));
const catalog = await import(pathToFileURL(join(installed,'lib/host/catalog.js')));
const { descriptionDisplayFor } = await import(pathToFileURL(join(installed,'lib/shared/description-rules.js')));
const directory = join(temporary, 'data'); mkdirSync(directory);
let offline = false;
const requests = [];
const server = createServer((req,res) => {
  requests.push(req.url);
  if (offline) { res.writeHead(503); res.end('offline fixture'); return; }
  try {
    assert(req.url.startsWith('/data/') && !req.url.includes('..'));
    const body = readFileSync(join(temporary,req.url));
    res.writeHead(200, {'content-type':'application/json'}); res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}/data`;
const id='nexu-io/open-design';
const review=reviews[id], original=review.descriptionZh;
const entry={rank:1,totalRank:1,fullName:id,name:'open-design',owner:'nexu-io',
  description:review.sourceDescription,descriptionZh:original,readmeSummary:review.sourceReadme,
  type:review.sourceType ?? 'cordis-plugin',stars:10,dailyStars:1,weeklyStars:2,hotScore:20,
  forks:0,openIssues:0,language:null,homepage:null,license:null,topics:[],tags:[],
  categories:[{id:'tools',source:'manual',confidence:1,evidence:'fixture'}],sources:[],
  url:`https://github.com/${id}`,pushedAt:'',createdAt:'',updatedAt:'',
  install:{method:'pnpm-profile',packageName:review.sourceInstall?.packageName ?? undefined,
    repositoryPath:review.sourceInstall?.repositoryPath ?? undefined,
    discovery:{status:'verified',kind:'bundle',policyVersion:6,checkedAt:'2026-09-16',
      evidence:review.sourceInstall?.functionEvidence ? [`reviewed-function-sha256:${review.sourceInstall.functionEvidence}`]:[]}}};
const document={schemaVersion:2,generatedAt:'2026-09-16T00:00:00Z',snapshotDate:'2026-09-16',
  definitions:{hot:'hot',rising:'rising',total:'total'},categories:[],
  rankings:{total:[entry],hot:[entry],rising:[entry]},directories:{skills:[]}};
const options={view:'total',query:'',category:null,offset:0,limit:100,installed:{}};
const revisions=[];
async function verifyPublished(label, expected) {
  const publication=publishRankings(document,directory);
  revisions.push({label,snapshotId:publication.snapshotId,expected});
  const documents=await Promise.all([catalog.loadRankingView(base,'hot',true),catalog.loadRankingView(base,'rising'),
    catalog.loadSearchRankings(base),catalog.loadRankings(base,true)]);
  const webHot=await (await fetch(base.replace('/data','')+publication.datasets.hot.url)).json();
  const webText=websiteDescription(webHot.rankings[0]);
  for(const doc of documents) {
    const item=catalog.filterCatalog(doc,options).items[0];
    assert.equal(item.descriptionZh,expected,`${label} ${doc.snapshotId ?? 'legacy'} expected snapshot ${publication.snapshotId} web ${webText}`);
    assert.equal(descriptionDisplayFor(item),webText,label);
  }
  const compact=JSON.parse(readFileSync(join(temporary,publication.datasets.search.url),'utf8')).rankings[0];
  assert.equal(websiteDescription(compact),webText,'compact website parity');
  assert.equal(hash(),beforeHash,'same archive throughout');
  assert.equal(JSON.parse(readFileSync(join(installed,'package.json'),'utf8')).version,manifest.version);
  return webText;
}
try {
  await verifyPublished('initial', original);
  review.descriptionZh='通过协议连接设计工具，读取项目文件并同步当前画布。';
  await verifyPublished('server editorial revision with unchanged input ranking',review.descriptionZh);
  assert.notEqual(revisions[0].snapshotId,revisions[1].snapshotId,'final editorial content must affect snapshot identity');
  review.suspended=true;
  await verifyPublished('withdrawal','中文简介待生成。');
  delete review.suspended;
  entry.descriptionStatus={state:'review-required',reason:'所选插件功能变化，待复核。'};
  await verifyPublished('pending review with stale Chinese present','中文简介待生成。');
  offline=true; catalog.invalidateCatalog();
  for (const doc of [await catalog.loadRankingView(base,'hot',true),await catalog.loadSearchRankings(base,true),await catalog.loadCachedRankings(base)]) {
    assert.equal(catalog.filterCatalog(doc,options).items[0].descriptionZh,'中文简介待生成。','restart/offline must not restore prior prose');
  }
  offline=false;
  delete entry.descriptionStatus;
  entry.fullName='fixture/unreviewed'; entry.descriptionZh='';
  await verifyPublished('empty text with old author metadata','中文简介待生成。');
  entry.description='Read project files and organize searchable work records.';
  entry.readmeSummary=entry.description;
  entry.install={method:'pnpm-profile',packageName:'fixture-records',
    discovery:{status:'verified',kind:'bundle',policyVersion:6,checkedAt:'2026-09-16',evidence:[]}};
  entry.descriptionZh='读取当前项目文件并整理可检索的工作记录。';
  await verifyPublished('ordinary server text without a fixed review',entry.descriptionZh);
  entry.descriptionZh='读取当前项目文件并导出已整理的工作记录。';
  await verifyPublished('second ordinary server revision',entry.descriptionZh);
  const addedReviewId=entry.fullName;
  assert(!reviews[addedReviewId], 'fixture must not overwrite a real review');
  reviews[addedReviewId]={sourceDescription:entry.description,sourceReadme:entry.readmeSummary,
    sourceType:entry.type,sourceInstall:{packageName:entry.install.packageName ?? null,
      repositoryPath:entry.install.repositoryPath ?? null},
    descriptionZh:'新增复核说明：在项目面板浏览文件并检索工作记录。'};
  try {
    await verifyPublished('new server review absent from the installed plugin',reviews[addedReviewId].descriptionZh);
    entry.readmeSummary += ' Unreviewed functionality change.';
    await verifyPublished('changed source cannot republish a legacy reviewed claim','中文简介待生成。');
  } finally {delete reviews[addedReviewId];}
  for (const state of ['pending','missing-source','retry']) {
    entry.descriptionStatus={state,reason:'仅服务端更新的状态原因。'};
    await verifyPublished(`server status ${state}`,'中文简介待生成。');
  }
  delete entry.descriptionStatus;
  const legacy={...entry,descriptionPolicy:undefined,descriptionZh:original};
  assert.equal(catalog.filterCatalog({...document,rankings:{total:[legacy],hot:[],rising:[]}},options).items[0].descriptionZh,'中文简介待生成。');
  console.log(JSON.stringify({version:manifest.version,archive,sha256:beforeHash,archiveUnchanged:hash()===beforeHash,
    revisions,verified:['actual packed host code','website display code','hot/rising/full/search','same input editorial revision changes snapshot',
      'withdrawal','pending review','empty Chinese','legacy Chinese suppressed','offline cache after restart','new review without npm update',
      'ordinary revisions without a fixed review','source change blocked on server','all server status reasons' ],
    localHttpRequests:requests.length,modelRequests:0},null,2));
} finally {
  review.descriptionZh=original; delete review.suspended;
  await new Promise(resolve=>server.close(resolve)); rmSync(temporary,{recursive:true,force:true});
}
