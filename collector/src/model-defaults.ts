/** Conservative request defaults; these do not enable paid requests or implement a budget. */
// Verified against the provider's 2026-09-10 V4.1 Flash release and pricing documentation.
// A future alias/model change still requires a separate provider/model review.
export const DEFAULT_MODEL = "deepseek-flash";
export const DEFAULT_MODEL_THINKING = "disabled" as const;
export const DEFAULT_MODEL_MAX_TOKENS = 256;
export const DEFAULT_MODEL_CONCURRENCY = 3;
export const DEFAULT_MODEL_TIMEOUT_MS = 45_000;
export const DEFAULT_MODEL_ATTEMPTS = 2;
