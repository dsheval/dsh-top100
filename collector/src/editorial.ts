import descriptions from "../../plugin/src/shared/reviewed-descriptions.json";
import categories from "../config/reviewed-categories.json";
import { bindCategoryAssignments, normalizeCategoryAssignments, type CategoryInput } from "./categories.js";
import { hasChineseDescription } from "./description-jobs.js";
import { matchesReviewedIdentity, PENDING_DESCRIPTION_ZH, type ReviewedInstallIdentity } from "../../plugin/src/shared/description-rules.js";

interface ReviewedEntry {
  sourceDescription: string;
  sourceReadme: string;
  sourceInstall?: ReviewedInstallIdentity;
  sourceType?: string | null;
  descriptionZh?: string;
  suspended?: boolean;
  categories?: unknown;
}
function matchingReview(input: CategoryInput, reviews: Record<string, ReviewedEntry>): ReviewedEntry | null {
  const review = reviews[(input.fullName || input.name).toLowerCase()];
  return review && matchesReviewedIdentity(input, review.sourceInstall, review.sourceType)
    && review.sourceDescription === (input.description || "") && review.sourceReadme === (input.readmeSummary || "") ? review : null;
}
export function reviewedDescription(input: CategoryInput): string | null {
  const review = matchingReview(input, descriptions);
  if (review?.suspended) return PENDING_DESCRIPTION_ZH;
  return review && hasChineseDescription(review.descriptionZh) ? review.descriptionZh! : null;
}
export function reviewedCategories(input: CategoryInput) {
  const review = matchingReview(input, categories);
  if (!review) return null;
  return bindCategoryAssignments(input, normalizeCategoryAssignments(review.categories));
}
