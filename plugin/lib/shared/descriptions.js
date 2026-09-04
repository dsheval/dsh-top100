import reviewed from "./reviewed-descriptions.json" with { type: "json" };
import { descriptionFor } from "./description-rules.js";
/** Keep evidence intact; only replace the presentation/search field. */
export function withReviewedDescription(entry, context = {}) {
    return { ...entry, descriptionZh: descriptionFor(entry, reviewed, context) };
}
