/** Registry selectors use npm's standard SemVer grammar, never shell syntax. */
import { valid, validRange } from "semver";
export function parseNpmSelector(value) {
    const selector = value.trim();
    if (!selector || selector.length > 1024 || /[\r\n\t]/.test(selector))
        return null;
    const version = valid(selector);
    if (version)
        return { kind: "version", value: selector.replace(/^v/, "") };
    if (validRange(selector) !== null)
        return { kind: "range", value: selector };
    return /^[A-Za-z][A-Za-z0-9._-]*$/.test(selector) ? { kind: "tag", value: selector } : null;
}
