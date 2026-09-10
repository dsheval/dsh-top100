import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeSearchText } from '../public/search-engine.js';

// Execute the actual inline filter, including its production keyword table.
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const keywords = html.match(/const categoryKeywords = (\{[\s\S]*?\n      \});/)[1];
const source = html.match(/function entryMatchesCategory\(entry, category\) \{[\s\S]*?\n      \}/)[0];
const matches = new Function('normalizeSearchText', `const categoryKeywords = ${keywords}; ${source}; return entryMatchesCategory;`)(normalizeSearchText);
const reviews = JSON.parse(readFileSync(new URL('../../plugin/src/shared/reviewed-descriptions.json', import.meta.url), 'utf8'));
function row(description, categories) {
  const searchText = normalizeSearchText(description);
  return { plugin: categories === undefined ? {} : { categories }, searchText, searchWords: searchText.split(/\s+/) };
}

test('an explicitly empty category list never recovers root-product categories', () => {
  const original = reviews['fufankeji/deepseek-harness-studio'].sourceDescription;
  const withdrawn = row(original, []);
  assert.equal(matches(withdrawn, 'appearance'), false);
  assert.equal(matches(withdrawn, 'coding'), false);
  assert.equal(matches(withdrawn, null), true);
  // A genuinely legacy row that omitted categories retains the old fallback.
  assert.equal(matches(row(original), 'appearance'), true);
  assert.equal(matches(row(original), 'coding'), true);
});

test('published category assignments take precedence over unrelated keywords', () => {
  assert.equal(matches(row('桌面代码工具', ['tools']), 'tools'), true);
  assert.equal(matches(row('桌面代码工具', ['tools']), 'appearance'), false);
  assert.equal(matches(row('桌面代码工具', [{ id: 'tools' }]), 'tools'), true);
  assert.equal(matches(row('桌面代码工具', [null, {}]), 'appearance'), false);
});
