import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { descriptionFor } from '../public/description-presentation.js';
test('placeholder Chinese falls back to source without fabricating a summary', () => {
  assert.equal(descriptionFor({descriptionZh:'demo：现有项目资料不足以生成可靠的功能简介。',description:'Browser automation for agents.'}), 'Browser automation for agents.');
  assert.equal(descriptionFor({descriptionZh:'顺手留颗 Star，作者能高兴一整天',description:''}), '暂无简介');
  assert.equal(descriptionFor({descriptionZh:'为开发者整理研究资料。',description:'Research helper.'}), '为开发者整理研究资料。');
});
test('reviewed summaries are source-bound and safe to display', () => {
  const reviews=JSON.parse(readFileSync(new URL('../public/reviewed-descriptions.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(reviews).length,279);
  for (const leaderboard of ['hot','rising','total','skills']) {
    assert.equal(Object.values(reviews).filter(review=>review.leaderboards.includes(leaderboard)).length,100,leaderboard);
  }
  for(const [fullName,review] of Object.entries(reviews)) {
    const entry={fullName,description:review.sourceDescription,readmeSummary:review.sourceReadme};
    assert.equal(descriptionFor(entry,reviews),review.descriptionZh);
    assert.ok([...review.descriptionZh].length>=30 && [...review.descriptionZh].length<=60,fullName);
    assert.match(review.descriptionZh,/[\u4e00-\u9fff]/,fullName);
    assert.equal(review.snapshotId,'2026-09-04-5de5fae7706f47b1');
    assert.match(review.sourceUrl,/^https:\/\/github\.com\//);
    assert.doesNotMatch(review.descriptionZh,/资料不足|求 Star|<|>/);
    assert.notEqual(descriptionFor({...entry,description:'New functionality.'},reviews),review.descriptionZh);
    assert.notEqual(descriptionFor({...entry,readmeSummary:'Updated behavior.'},reviews),review.descriptionZh);
  }
});
test('website data stays identical to the npm editorial source', () => {
  const read = path => JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
  assert.deepEqual(read('../public/reviewed-descriptions.json'),read('../../plugin/src/shared/reviewed-descriptions.json'));
});
test('compact search requires the reviewed snapshot and rejects changed evidence', () => {
  const reviews=JSON.parse(readFileSync(new URL('../public/reviewed-descriptions.json',import.meta.url),'utf8'));
  const fullName='nexu-io/open-design';
  const review=reviews[fullName];
  const entry={fullName,description:review.sourceDescription,descriptionZh:'资料不足'};
  const context={snapshotId:review.snapshotId};
  assert.equal(descriptionFor(entry,reviews,context),review.descriptionZh);
  assert.notEqual(descriptionFor(entry,reviews,{snapshotId:'changed'}),review.descriptionZh);
  assert.notEqual(descriptionFor({...entry,readmeSummary:'changed'},reviews,context),review.descriptionZh);
});
