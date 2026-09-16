import { descriptionFor } from "./description-rules.js";
/** Preserve evidence and expose only the server's final summary to search/display. */
export function withPublishedDescription(entry) {
    return { ...entry, descriptionZh: descriptionFor(entry) };
}
