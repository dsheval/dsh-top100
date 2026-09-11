import reviews from "../../plugin/src/shared/reviewed-descriptions.json";
import { summarizeReadme, summarizeReviewedReadme } from "./summary.js";

type Identity = { packageName?: string | null; repositoryPath?: string | null };
export function reviewedReadmeSource(fullName: string, identity: Identity): { sourceReadme: string } | null {
  const review = (reviews as Record<string, { sourceReadme: string; sourceReadmeNormalization?: string;
    sourceInstall?: Identity }>)[fullName.toLowerCase()];
  return review?.sourceReadmeNormalization === "language-navigation-v1"
    && (review.sourceInstall?.packageName ?? null) === (identity.packageName ?? null)
    && (review.sourceInstall?.repositoryPath ?? null) === (identity.repositoryPath ?? null) ? review : null;
}
export function summarizeSelectedReadme(fullName: string, identity: Identity, text: string): string {
  return reviewedReadmeSource(fullName, identity) ? summarizeReviewedReadme(text) : summarizeReadme(text);
}
