/** Conservative request defaults; these do not enable paid requests or implement a budget. */
// Keep this explicit identifier until a separately approved provider/model review.
// On 2026-09-11 the provider documents this legacy ID as routed to V4.1 Flash.
// Do not silently migrate to another alias; real requests remain hard-paused.
export const DEFAULT_MODEL = "deepseek-v4-flash";
export const DEFAULT_MODEL_THINKING = "disabled" as const;
export const DEFAULT_MODEL_MAX_TOKENS = 256;
export const DEFAULT_MODEL_CONCURRENCY = 3;
export const DEFAULT_MODEL_TIMEOUT_MS = 45_000;
export const DEFAULT_MODEL_ATTEMPTS = 2;
