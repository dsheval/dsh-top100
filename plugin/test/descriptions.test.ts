import { describe, expect, it } from 'vitest';
import { descriptionFor, descriptionDisplayFor, PENDING_DESCRIPTION_ZH } from '../src/shared/description-rules.js';
import { withPublishedDescription } from '../src/shared/descriptions.js';
import { parseRankingSearchDocument, parseRankingsDocument, filterCatalog } from '../src/host/catalog.js';
import type { RankingEntry } from '../src/shared/types.js';
const current = { fullName:'nexu-io/open-design', name:'open-design', rank:1,
  descriptionPolicy:'server-v1', descriptionZh:'服务端新修订的简介：读取网页并整理研究资料。',
  description:'过期的中文描述包含已撤回的功能。', tags:[],topics:[],categories:[] } as RankingEntry;
const options = {view:'total' as const, category:null,query:'',offset:0,limit:10,installed:{}};

describe('server-owned published descriptions', () => {
  it('uses arbitrary server revisions for previously reviewed identities', () => {
    expect(withPublishedDescription(current).descriptionZh).toBe(current.descriptionZh);
    expect(descriptionFor({...current,descriptionZh:'感谢使用此工具，它可以读取网页并保存资料。'})).toContain('感谢使用');
    expect(current.description).toContain('过期');
  });
  it.each(['pending','review-required','missing-source','retry'] as const)('never restores withheld %s prose', state => {
    const entry={...current,descriptionStatus:{state,reason:'正在确认所选插件的功能资料。'}};
    expect(descriptionFor(entry)).toBe(PENDING_DESCRIPTION_ZH);
    expect(descriptionDisplayFor(entry)).toContain(entry.descriptionStatus.reason);
  });
  it('treats missing, empty, unknown-contract and legacy text conservatively in full and compact catalogs', () => {
    for(const row of [{...current,descriptionZh:''},{...current,descriptionZh:undefined},
      {...current,descriptionPolicy:undefined},{...current,descriptionPolicy:'future'},
      {...current,descriptionStatus:null},{...current,descriptionStatus:{state:'unexpected',reason:'bad'}}]) {
      const payload={schemaVersion:2,generatedAt:'2026-09-16T00:00:00Z',snapshotDate:'2026-09-16'};
      for(const doc of [parseRankingSearchDocument(JSON.stringify({...payload,rankings:[row]})),
        parseRankingsDocument(JSON.stringify({...payload,rankings:{total:[row]}}))]) {
        expect(filterCatalog(doc,options).items[0].descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
      }
    }
  });
});
