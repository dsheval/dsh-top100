import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { filterDiscoveryEntries, requiresSearchIndex } from '../public/discovery-filter.js';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=html.match(/function updateCategoryCounts\(\) \{[\s\S]*?\n      \}/)[0];
const row=(name,category,installable=false)=>({rank:1,plugin:{name,fullName:`acme/${name}`,type:'cordis-plugin',categories:category?[{id:category}]:[],...(installable?{install:{commands:[`dsh plugin add github:acme/${name}`]}}:{})}});
function counts(currentView,{query='',installableOnly=false}={}){
 const buttons=['','ai','tools'].map(category=>({dataset:{category},count:{textContent:''},querySelector(){return this.count;},setAttribute(){}}));
 const hotEntries=[row('browser','tools',true),row('memory','ai'),row('uncategorized',null)];
 const risingEntries=[row('browser','tools',true),row('files','tools')];
 const searchEntries=[...hotEntries,row('browser-memory','ai',true)];
 const context={currentView,viewState:{[currentView]:{query}},installableOnly,filterDiscoveryEntries,requiresSearchIndex,searchEntries,hotEntries,risingEntries,rankedEntries:[hotEntries[0]],categoryButtons:buttons,manifest:{categories:[{id:'ai',count:200,skillCount:10},{id:'tools',count:500}],datasets:{total:{count:1000,skillCount:20}}},legacyCategoryDefinitions:[],entryMatchesCategory:(e,c)=>!c||e.plugin.categories.some(x=>x.id===c),formatStars:String,categoryLabels:{},categoryDescription:{hidden:true}};
 new Function(...Object.keys(context),source+'; updateCategoryCounts();')(...Object.values(context));
 return buttons.map(b=>Number(b.count.textContent));
}
test('hot and rising category badges count their full own cohort, including uncategorized entries in all',()=>{
 assert.deepEqual(counts('top100'),[3,1,1]);
 assert.deepEqual(counts('rising'),[2,0,2]);
});
test('total badges use the full published catalog instead of the first loaded page',()=>{
 assert.deepEqual(counts('all'),[980,190,500]);
});
test('category badges follow installation filters and global text search on each tab',()=>{
 assert.deepEqual(counts('top100',{installableOnly:true}),[1,0,1]);
 for(const view of ['top100','rising','all'])assert.deepEqual(counts(view,{query:'browser'}),[2,1,1]);
 assert.deepEqual(counts('all',{installableOnly:true}),[2,1,1]);
});
