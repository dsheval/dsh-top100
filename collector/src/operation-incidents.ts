/** Durable, deduplicated events for a future GEO adapter. This module never sends messages. */
import { createHash } from 'node:crypto';
import type { OperationIssue } from './operation-audit.js';

export interface Incident extends OperationIssue { firstSeenAt: string; lastChangedAt: string; resolvedAt?: string;
  observedDays?: string[]; boardImpactSince?: string; }
export interface IncidentEvent {
  id: string; at: string; kind: 'opened' | 'changed' | 'resolved';
  incident: Incident; actionable: boolean;
}
export interface IncidentState { schemaVersion: 1; incidents: Record<string, Incident>; }
export function reconcileIncidents(previous: IncidentState | undefined, issues: OperationIssue[], now: number,
  options: { unobservedKeys?: ReadonlySet<string> } = {}) {
  if (previous && (previous.schemaVersion !== 1 || !previous.incidents || typeof previous.incidents !== 'object')) throw new Error('invalid-incident-state');
  const state: IncidentState = structuredClone(previous ?? { schemaVersion: 1, incidents: {} });
  const events: IncidentEvent[] = [], at = new Date(now).toISOString();
  const current = new Map(issues.map(issue => [issue.key, issue]));
  const emit = (kind: IncidentEvent['kind'], incident: Incident, actionable = incident.severity !== 'info') => {
    const before = previous?.incidents[incident.key];
    const id = createHash('sha256').update(JSON.stringify([incident.key, kind, before?.lastChangedAt ?? 'initial', before?.resolvedAt,
      incident.code, incident.severity, incident.subject])).digest('hex');
    events.push({ id, at, kind, incident: structuredClone(incident), actionable });
  };
  for (const observation of current.values()) {
    const issue = { ...observation };
    const old = state.incidents[issue.key];
    // An outage preserves an incident but cannot manufacture a fresh finding.
    if (options.unobservedKeys?.has(issue.key)) continue;
    const boardImpactSince = issue.affectsBoard === true
      ? old && !old.resolvedAt && old.affectsBoard === true && Number.isFinite(Date.parse(old.boardImpactSince ?? ''))
        ? old.boardImpactSince : at
      : undefined;
    // Three daily observations OR 48 hours of board impact. Repeated polls do
    // not count as new failed days; a fresh observation confirms persistence.
    const observedDays = [...new Set([...(old && !old.resolvedAt ? old.observedDays ?? [] : []),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(issue.observationId ?? '') ? [issue.observationId!] : [])])].sort().slice(-3);
    if (issue.key.startsWith('description:') && issue.severity === 'info' && (observedDays.length >= 3
      || boardImpactSince && now - Date.parse(boardImpactSince) >= 48 * 3_600_000)) issue.severity = 'warning';
    if (!old || old.resolvedAt) {
      const incident = { ...issue, observedDays, boardImpactSince, firstSeenAt: at, lastChangedAt: at };
      state.incidents[issue.key] = incident; emit('opened', incident);
    } else if (old.code !== issue.code || old.severity !== issue.severity || old.subject !== issue.subject) {
      const incident = { ...old, ...issue, observedDays, boardImpactSince, lastChangedAt: at };
      state.incidents[issue.key] = incident; emit('changed', incident, old.severity !== 'info' || incident.severity !== 'info');
    } else state.incidents[issue.key] = { ...old, ...issue, observedDays, boardImpactSince };
  }
  for (const [key, incident] of Object.entries(state.incidents)) if (!current.has(key) && !incident.resolvedAt) {
    incident.resolvedAt = at; incident.lastChangedAt = at; emit('resolved', incident);
  }
  return { state, events };
}
