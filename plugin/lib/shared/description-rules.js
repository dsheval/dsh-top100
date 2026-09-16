/** Presentation contract only. Editorial decisions belong to the publisher. */
export const DESCRIPTION_POLICY = 'server-v1';
export const PENDING_DESCRIPTION_ZH = '中文简介待生成。';
/** Shared display rules; raw repository text is always rendered via textContent. */
export function cleanDescription(value) {
    return String(value ?? '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/[`*_~>#]/g, ' ')
        .replace(/\s+/g, ' ').trim()
        // Strip only an isolated leading language switch, keeping the useful body
        // and optional package heading. This is presentation, never source rebinding.
        .replace(/^((?:[\w@/.-]+\s+)?)(?:简体中文|中文)\s*[|·]\s*English\s*/i, '$1')
        .replace(/^((?:[\w@/.-]+\s+)?)English\s*[|·]\s*(?:简体中文|中文)\s*/i, '$1').trim();
}
/** Never infer a summary from author metadata, a README or an older local review. */
export function descriptionFor(entry) {
    if (entry.descriptionPolicy !== DESCRIPTION_POLICY || entry.descriptionStatus !== undefined)
        return PENDING_DESCRIPTION_ZH;
    if (typeof entry.descriptionZh !== 'string')
        return PENDING_DESCRIPTION_ZH;
    return cleanDescription(entry.descriptionZh) || PENDING_DESCRIPTION_ZH;
}
export function descriptionDisplayFor(entry) {
    const description = descriptionFor(entry);
    if (description !== PENDING_DESCRIPTION_ZH || !entry.descriptionStatus)
        return description;
    const labels = { 'pending': '中文简介待生成', 'review-required': '中文简介待复核',
        'missing-source': '中文简介资料不足', 'retry': '中文简介生成未完成' };
    const label = labels[entry.descriptionStatus.state];
    return label ? `${label}：${cleanDescription(entry.descriptionStatus.reason).slice(0, 200)}` : description;
}
