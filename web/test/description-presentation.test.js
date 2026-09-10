import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { descriptionFor } from '../public/description-presentation.js';
test('missing translations stay in Chinese without fabricating capabilities', () => {
  assert.equal(descriptionFor({descriptionZh:'demo：现有项目资料不足以生成可靠的功能简介。',description:'Browser automation for agents.'}), '中文简介待生成。');
  assert.equal(descriptionFor({descriptionZh:'顺手留颗 Star，作者能高兴一整天',description:''}), '中文简介待生成。');
  assert.equal(descriptionFor({descriptionZh:'为开发者整理研究资料。',description:'Research helper.'}), '为开发者整理研究资料。');
  assert.equal(descriptionFor({descriptionZh:'版本更新提示：本次版本变化较大，老用户请更新至最新版本。',description:'Generate images from prompts.'}), '中文简介待生成。');
  assert.equal(descriptionFor({descriptionZh:'',description:'--- 🚨 【国内用户核心前置：必须开启系统代理 / TUN 模式！'}), '中文简介待生成。');
  assert.equal(descriptionFor({descriptionZh:'中文简介：Browser automation for agents with persistent browser sessions.',description:'Browser tools'}), '中文简介待生成。');
  assert.equal(descriptionFor({descriptionZh:'English description',description:'**搜索网页**并整理资料。'}), '搜索网页 并整理资料。');
  assert.equal(descriptionFor({descriptionZh:'让 DeepSeek Harness 调用 Browser Skill 操作网页。'}), '让 DeepSeek Harness 调用 Browser Skill 操作网页。');
});
test('reviewed summaries are source-bound and safe to display', () => {
  const reviews=JSON.parse(readFileSync(new URL('../public/reviewed-descriptions.json',import.meta.url),'utf8'));
  assert.ok(Object.keys(reviews).length > 0);
  for(const [fullName,review] of Object.entries(reviews)) {
    const entry={fullName,description:review.sourceDescription,readmeSummary:review.sourceReadme,
      ...(review.sourceInstall ? {install:review.sourceInstall} : {}),
      ...(review.sourceType !== undefined ? {type:review.sourceType} : {})};
    assert.equal(descriptionFor(entry,reviews),review.descriptionZh);
    if (review.suspended) assert.equal(review.descriptionZh,'中文简介待生成。',fullName);
    else assert.ok([...review.descriptionZh].length>=30,fullName);
    assert.match(review.descriptionZh,/[\u4e00-\u9fff]/,fullName);
    if (review.leaderboards) {
      assert.equal(new Set(review.leaderboards).size,review.leaderboards.length,fullName);
      assert.ok(review.leaderboards.every(value=>['hot','rising','total','skills'].includes(value)),fullName);
    }
    if (review.snapshotId) assert.ok(review.snapshotId.startsWith(`${review.reviewedAt}-`),fullName);
    assert.match(review.sourceUrl,/^https:\/\/github\.com\//);
    assert.doesNotMatch(review.descriptionZh,/资料不足|求 Star|<|>/);
    for (const changed of [{...entry,description:'New functionality.'},{...entry,readmeSummary:'Updated behavior.'},
      {...entry,install:{...entry.install,packageName:'fixture-changed-package'}},
      {...entry,install:{...entry.install,repositoryPath:'packages/changed'}}]) {
      // An invalidated review must use ordinary fallback; the author's Chinese
      // description can legitimately be identical to the previously reviewed text.
      assert.equal(descriptionFor(changed,reviews),descriptionFor(changed,{}));
    }
  }
});
test('compact descriptions enforce reviewed package, subdirectory and type', () => {
  const review={sourceDescription:'History panel',sourceReadme:'Read project history.',
    sourceInstall:{packageName:'@fixture/panel',repositoryPath:'packages/panel'},sourceType:'cordis-plugin',
    descriptionZh:'在面板中查看项目历史与变更记录。',snapshotId:'fixture-snapshot'};
  const entry={fullName:'fixture/panel',description:review.sourceDescription,type:review.sourceType,
    installPackageName:review.sourceInstall.packageName,installRepositoryPath:review.sourceInstall.repositoryPath};
  const reviews={[entry.fullName]:review},context={snapshotId:review.snapshotId};
  assert.equal(descriptionFor(entry,reviews,context),review.descriptionZh);
  for (const changed of [{...entry,installPackageName:'other-package'},
    {...entry,installRepositoryPath:'packages/other'},{...entry,type:'skill'}]) {
    assert.equal(descriptionFor(changed,reviews,context),descriptionFor(changed,{},context));
  }
});
test('website data stays identical to the npm editorial source', () => {
  const read = path => JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
  assert.deepEqual(read('../public/reviewed-descriptions.json'),read('../../plugin/src/shared/reviewed-descriptions.json'));
});
test('compact search requires the reviewed snapshot and rejects changed evidence', () => {
  const fullName='fixture/browser';
  const review={sourceDescription:'Browser automation',sourceReadme:'Browse pages and fill forms.',
    descriptionZh:'连接浏览器读取页面和填写表单，辅助完成网页操作任务。',snapshotId:'fixture-reviewed-snapshot'};
  const reviews={[fullName]:review};
  const entry={fullName,description:review.sourceDescription,descriptionZh:'资料不足'};
  const context={snapshotId:review.snapshotId};
  assert.equal(descriptionFor(entry,reviews,context),review.descriptionZh);
  assert.notEqual(descriptionFor(entry,reviews),review.descriptionZh);
  assert.notEqual(descriptionFor(entry,reviews,{snapshotId:'changed'}),review.descriptionZh);
  assert.notEqual(descriptionFor({...entry,readmeSummary:'changed'},reviews,context),review.descriptionZh);
  assert.notEqual(descriptionFor({...entry,description:'changed'},reviews,context),review.descriptionZh);
});
test('current editorial evidence cannot reuse an older compact snapshot', () => {
  const reviews=JSON.parse(readFileSync(new URL('../public/reviewed-descriptions.json',import.meta.url),'utf8'));
  const fullName='nexu-io/open-design';
  const review=reviews[fullName];
  assert.equal(review.snapshotId,undefined);
  const entry={fullName,description:review.sourceDescription,descriptionZh:'资料不足'};
  assert.notEqual(descriptionFor(entry,reviews,{snapshotId:'2026-09-04-5de5fae7706f47b1'}),review.descriptionZh);
});

test('explicit publisher withholding survives compact data without the review evidence', () => {
  const reviews=JSON.parse(readFileSync(new URL('../../plugin/src/shared/reviewed-descriptions.json',import.meta.url),'utf8'));
  const withdrawn=Object.entries(reviews).filter(([,review])=>review.suspended);
  for (const fullName of ['whitelonng/dshcode','fufankeji/deepseek-harness-studio','op7418/pilot-harness','see-sol-lab/deepseekgui']) {
    assert.ok(withdrawn.some(([id])=>id===fullName),fullName);
  }
  for (const [fullName,review] of withdrawn) {
    const full={fullName,description:review.sourceDescription,readmeSummary:review.sourceReadme,
      install:review.sourceInstall,type:review.sourceType,descriptionZh:'提供桌面界面和插件管理，方便使用智能助手。'};
    assert.equal(descriptionFor(full,reviews),'中文简介待生成。',fullName);
    const compact={fullName,description:full.description,type:full.type,descriptionZh:'中文简介待生成。'};
    assert.equal(descriptionFor(compact,reviews,{snapshotId:'new-data-snapshot'}),'中文简介待生成。',fullName);
    assert.equal(descriptionFor(compact),'中文简介待生成。',fullName);
    assert.equal(descriptionFor({...compact,descriptionZh:full.descriptionZh},reviews,{snapshotId:'old-cache'}),full.descriptionZh,fullName);
  }
  assert.equal(descriptionFor({description:'自动生成研究报告并管理企业知识库。'}),'自动生成研究报告并管理企业知识库。');
  assert.equal(descriptionFor({description:'自动生成研究报告并管理企业知识库。',descriptionZh:' **中文简介待生成。** '}),'中文简介待生成。');
});
