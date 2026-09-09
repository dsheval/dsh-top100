import { UPDATE_PREFLIGHT_GROUP_SIZE, MAX_UPDATE_BATCH_SIZE, type UpdatePreflightIssue, type UpdatePreflightItem, type UpdatePreflightResponse, type UpdateStrategy } from "../shared/types.js";

/** Keep requests small while reviewing all successful targets together. No package operation runs here. */
export async function prepareUpdateBatch(names: string[], strategy: UpdateStrategy, options: {
  signal: AbortSignal;
  onProgress?: (checked: number, total: number) => void;
}): Promise<{ items: UpdatePreflightItem[]; issues: UpdatePreflightIssue[] }> {
  const selected = [...new Set(names)];
  if (selected.length > MAX_UPDATE_BATCH_SIZE) throw new Error(`At most ${MAX_UPDATE_BATCH_SIZE} updates can be reviewed at once`);
  const items: UpdatePreflightItem[] = [];
  const issues: UpdatePreflightIssue[] = [];
  if (selected.length === 0) return { items, issues };
  let sessionToken: string | null = null;
  async function sessionAction(action: "start" | "finalize") {
    options.signal.throwIfAborted();
    const response = await fetch("/dsh-top100/update-preflight-session", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...(sessionToken ? { sessionToken } : {}) }), signal: options.signal,
    });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error || `${response.status} ${response.statusText}`), { code: body.code });
    return body;
  }
  try {
    const started = await sessionAction("start");
    if (typeof started.sessionToken !== "string" || !started.sessionToken) throw new Error("updatePreflightIncomplete");
    sessionToken = started.sessionToken;
    for (let offset = 0; offset < selected.length; offset += UPDATE_PREFLIGHT_GROUP_SIZE) {
    options.signal.throwIfAborted();
    const group = selected.slice(offset, offset + UPDATE_PREFLIGHT_GROUP_SIZE);
    const response = await fetch("/dsh-top100/update-preflight", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ names: group, strategy, partial: true, sessionToken }), signal: options.signal,
    });
    const body = await response.json() as UpdatePreflightResponse & { error?: string; code?: string };
    options.signal.throwIfAborted();
    if (!response.ok) throw Object.assign(new Error(body.error || `${response.status} ${response.statusText}`), { code: body.code });
    if (!Array.isArray(body.items) || (body.issues !== undefined && !Array.isArray(body.issues))) throw new Error("updatePreflightIncomplete");
    const byName = new Map(body.items.map((item) => [item.name, item]));
    const failures = body.issues ?? [];
    const accounted = [...body.items.map((item) => item.name), ...failures.map((issue) => issue.name)];
    if (accounted.length !== group.length || new Set(accounted).size !== group.length
      || accounted.some((name) => !group.includes(name))
      || body.items.some((item) => item.preflight?.kind !== "bundle" || !item.preflight.approvalToken || !item.preflight.provenance?.resolvedTarget)
      || failures.some((issue) => !["current", "failed"].includes(issue.status) || typeof issue.message !== "string")) {
      throw new Error("updatePreflightIncomplete");
    }
    items.push(...group.flatMap((name) => byName.has(name) ? [byName.get(name)!] : []));
    issues.push(...failures);
    options.onProgress?.(offset + group.length, selected.length);
    }
    const finalized = await sessionAction("finalize") as UpdatePreflightResponse;
    options.signal.throwIfAborted();
    const drafts = new Map(items.map((item) => [item.name, item]));
    if (!Array.isArray(finalized.items) || finalized.items.length !== items.length
      || new Set(finalized.items.map((item) => item.name)).size !== items.length
      || finalized.items.some((item) => {
        const draft = drafts.get(item.name);
        return !draft || !item.preflight?.approvalToken || !Number.isFinite(item.preflight.expiresAt) || item.preflight.expiresAt <= Date.now()
          || item.preflight.provenance?.resolvedTarget !== draft.preflight.provenance.resolvedTarget
          || item.preflight.provenance?.requestedTarget !== draft.preflight.provenance.requestedTarget;
      })) throw new Error("updatePreflightIncomplete");
    sessionToken = null;
    const ready = new Map(finalized.items.map((item) => [item.name, item]));
    return { items: items.map((item) => ready.get(item.name)!), issues };
  } finally {
    if (sessionToken) {
      // Cleanup must survive cancellation of the request being cleaned up.
      void fetch("/dsh-top100/update-preflight-session", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", sessionToken }), keepalive: true,
      }).catch(() => { /* The bounded session also expires without any package mutation. */ });
    }
  }
}
