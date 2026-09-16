import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { descriptionFor, descriptionDisplayFor } from '../public/description-presentation.js';
const pending = '中文简介待生成。';
const entry = { descriptionPolicy: 'server-v1', descriptionZh: '读取网页内容并整理研究资料。' };
test('renders the final server text without editorial or semantic overrides', () => {
  assert.equal(descriptionFor(entry), entry.descriptionZh);
  assert.equal(descriptionFor({...entry, descriptionZh:'感谢用户帮助我们测试新的功能。'}),'感谢用户帮助我们测试新的功能。');
  assert.equal(descriptionFor({...entry, descriptionZh:'**读取网页** <script>secret()</script>并整理资料。'}),'读取网页 并整理资料。');
});
test('status, empty content, unknown contract and legacy data cannot borrow stale author prose', () => {
  for (const state of ['pending','review-required','missing-source','retry']) {
    const value = {...entry, descriptionStatus:{state,reason:'服务端待复核'}};
    assert.equal(descriptionFor(value),pending);
    assert.match(descriptionDisplayFor(value), /服务端待复核/);
  }
  for (const value of [{...entry,descriptionZh:''}, {...entry,descriptionZh:null},
    {...entry,descriptionPolicy:undefined},{...entry,descriptionPolicy:'future'}]) {
    assert.equal(descriptionFor({...value,description:'旧的中文说明用于自动管理项目。',readmeSummary:'旧功能介绍。'}),pending);
  }
});
test('website does not fetch or distribute an editorial table', () => {
  assert.equal(existsSync(new URL('../public/reviewed-descriptions.json',import.meta.url)),false);
  for (const file of ['index.html','skills.html','description-presentation.js','description-rules.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8'),/reviewedDescriptions|loadReviewedDescriptions|matchesReviewedDescriptionSource|descriptionQualityIssue/);
  }
});
