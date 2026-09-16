import { hasSelectedReadmeEvidence } from "./readme-evidence.js";
import { needsFunctionReview } from "./reviewed-evidence-state.js";
import descriptions from "../../plugin/src/shared/reviewed-descriptions.json";
import categories from "../config/reviewed-categories.json";
import { bindCategoryAssignments, normalizeCategoryAssignments, type CategoryInput } from "./categories.js";
import { hasChineseDescription } from "./description-jobs.js";
import { hasInvalidSelectedPackage, matchesReviewedIdentity, matchesReviewedReadme, matchesReviewedDescriptionSource, PENDING_DESCRIPTION_ZH, type ReviewedDescription, type ReviewedInstallIdentity } from "../../plugin/src/shared/description-rules.js";

interface ReviewedEntry {
  sourceScope?: string;
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
    && (review.sourceDescription === (input.description || "")
      || review.sourceScope === "selected-package" && !!input.install?.repositoryPath
        && (hasSelectedReadmeEvidence(input) || !!review.sourceInstall?.functionEvidence)) && matchesReviewedReadme(input.readmeSummary || "", review.sourceReadme) ? review : null;
}
export function reviewedDescription(input: CategoryInput): string | null {
  if (hasInvalidSelectedPackage(input) || needsFunctionReview(input)) return PENDING_DESCRIPTION_ZH;
  const review = (descriptions as Record<string, ReviewedDescription>)[(input.fullName || input.name).toLowerCase()];
  if (review?.reviewRequiredReason) return PENDING_DESCRIPTION_ZH;
  if (review && matchesReviewedDescriptionSource({ ...input, descriptionZh: input.descriptionZh ?? undefined,
    readmeSummary: input.readmeSummary ?? '', description: input.description ?? '' }, review, {}, hasSelectedReadmeEvidence(input))) {
    return review.suspended ? PENDING_DESCRIPTION_ZH : hasChineseDescription(review.descriptionZh) ? review.descriptionZh : null;
  }
  return review?.enforceSourceMatch ? PENDING_DESCRIPTION_ZH : null;
}
export function reviewedCategories(input: CategoryInput) {
  if (hasInvalidSelectedPackage(input) || needsFunctionReview(input)) return [];
  const review = matchingReview(input, categories);
  if (!review) return null;
  return bindCategoryAssignments(input, normalizeCategoryAssignments(review.categories));
}
