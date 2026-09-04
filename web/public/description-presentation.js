// Rules are generated from plugin/src/shared/description-rules.ts.
export { cleanDescription, isPlaceholder, descriptionFor } from './description-rules.js';
export async function loadReviewedDescriptions() {
  try {
    const response = await fetch(new URL('./reviewed-descriptions.json', import.meta.url), { signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.json() : {};
  } catch { return {}; }
}
