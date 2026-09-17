import { describe, expect, it } from 'vitest';
import { publishDescription } from '../src/published-description.js';
import { hasPublishedChinese } from '../src/board-descriptions.js';
import { publicationReviewedDescription } from '../src/publication-description-review.js';
import { needsFunctionReview } from '../src/reviewed-evidence-state.js';
import { matchingDescriptionHold } from '../src/content-source.js';
import { reviewedDescription, reviewedCategories } from '../src/editorial.js';
import { toSnapshotSearchEntry } from '../src/search-index.js';
import { descriptionDisplayFor } from '../../plugin/src/shared/description-rules.js';
import type { RankingEntry } from '../src/rankings.js';
import fixture from './fixtures/cherry-description-review-20260917.json';
import { PENDING_DESCRIPTION_ZH } from '../src/description-rules.js';

function source(): RankingEntry { return { ...structuredClone(fixture), rank: 1,
  descriptionZh: PENDING_DESCRIPTION_ZH, categories: [], tags: [] } as unknown as RankingEntry; }

describe('an exact description review cannot release protected function changes', () => {
  it('publishes reviewed claims while original collection and category guards stay held', () => {
    const entry = source();
    expect(needsFunctionReview(entry)).toBe(true);
    expect(matchingDescriptionHold(entry)).not.toBeNull();
    expect(reviewedDescription(entry)).toBe(PENDING_DESCRIPTION_ZH);
    expect(reviewedCategories(entry)).toEqual([]);
    const text = publicationReviewedDescription(entry)!;
    expect(text).toContain('工具审批与计划确认');
    expect(hasPublishedChinese(entry)).toBe(true);
    entry.descriptionStatus = { state: 'review-required', reason: '功能仍待复核' };
    const published = publishDescription(entry);
    expect(published.descriptionStatus).toBeUndefined();
    expect(descriptionDisplayFor(toSnapshotSearchEntry(published))).toBe(text);
    expect(needsFunctionReview(published)).toBe(true);
    entry.install.discovery!.checkedAt = '2026-09-18T00:00:00Z';
    expect(publicationReviewedDescription(entry)).toBe(text);
  });
  it.each(['package', 'directory', 'type', 'revision', 'fingerprint', 'file', 'description', 'readme', 'missing-proof', 'invalid-package'])
    ('does not reuse the approval when %s changes', field => {
      const entry = source();
      if (field === 'package') entry.install.packageName = 'other';
      if (field === 'directory') entry.install.repositoryPath = 'other';
      if (field === 'type') entry.type = 'skill';
      if (field === 'revision') entry.install.discovery!.sourceRevision += 'changed';
      if (field === 'fingerprint') entry.install.discovery!.functionReview!.currentFingerprint = 'other';
      if (field === 'file') entry.install.discovery!.functionReview!.files[0].afterSha256 = 'other';
      if (field === 'description') entry.description += ' other';
      if (field === 'readme') entry.readmeSummary += ' other';
      if (field === 'missing-proof') delete entry.install.discovery;
      if (field === 'invalid-package') entry.install.discovery!.evidence.push('selected-package-invalid:other');
      expect(publicationReviewedDescription(entry)).toBeNull();
      expect(publishDescription(entry).descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
    });
});
