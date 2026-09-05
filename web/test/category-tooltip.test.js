import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real count-update functions after a user has opened a tooltip
// while the asynchronous catalog is still loading.
for (const [file, update] of [['index.html', 'updateCategoryCounts'], ['skills.html', 'updateCategoryControls']]) {
  test(`${file} refreshes an open category tooltip when catalog counts arrive`, () => {
    const html = readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
    const source = html.slice(html.indexOf(`function ${update}()`), html.indexOf('function showCategoryDescription(button)'));
    const countNode = { textContent: '—' };
    const button = { dataset: { category: 'security' }, querySelector: () => countNode, setAttribute() {} };
    const tooltip = { hidden: false, dataset: { category: 'security' }, title: '—' };
    const context = vm.createContext({
      categoryButtons: [button], categoryDescription: tooltip,
      categoryLabels: { security: '安全' }, activeCategory: 'security',
      entries: [{ categories: ['security'] }, { categories: ['security'] }],
      categoriesOf: entry => entry.categories,
      manifest: { categories: [{ id: 'security', count: 2, skillCount: 0 }] },
      formatNumber: String, formatStars: String,
      showCategoryDescription: target => { tooltip.title = target.querySelector().textContent; },
    });
    vm.runInContext(`${source}\n${update}();`, context);
    assert.equal(countNode.textContent, '2');
    assert.equal(tooltip.title, '2');
    tooltip.hidden = true;
    tooltip.title = 'closed';
    vm.runInContext(`${update}();`, context);
    assert.equal(tooltip.title, 'closed', 'data refresh must not open a dismissed tooltip');
  });
}
