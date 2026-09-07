import { describe, expect, it } from "vitest";
import { LatestRequest } from "../src/client/latest-request.js";
import { diagnosticSummary } from "../src/client/diagnostic-export.js";
import { deltaLabel, scoreLabel } from "../src/client/metric-presentation.js";
import type { DiagnosticReport } from "../src/shared/types.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("preflight request ownership", () => {
  it("suppresses a late cancelled response even when transport ignores abort", async () => {
    const requests = new LatestRequest();
    const first = requests.start();
    const response = deferred<string>();
    const accepted: string[] = [];
    const work = response.promise.then((value) => { if (first.isCurrent()) accepted.push(value); });
    requests.cancel();
    response.resolve("old approval token");
    await work;
    expect(first.signal.aborted).toBe(true);
    expect(accepted).toEqual([]);
  });
  it("lets retry succeed while the old request finally cannot clear its state", async () => {
    const requests = new LatestRequest();
    const first = requests.start();
    const response = deferred<string>();
    let busy = true;
    const old = response.promise.finally(() => { if (first.isCurrent()) busy = false; });
    const retry = requests.start();
    response.resolve("old result");
    await old;
    expect(busy).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(retry.isCurrent()).toBe(true);
    requests.cancel();
    expect(retry.signal.aborted).toBe(true);
  });
});

describe("unknown ranking metrics", () => {
  it("preserves missing values separately from zero and signed deltas", () => {
    expect(deltaLabel(null)).toBe("—");
    expect(deltaLabel(0)).toBe("0");
    expect(deltaLabel(-3)).toBe("-3");
    expect(deltaLabel(3)).toBe("+3");
    expect(scoreLabel(null)).toBe("—");
    expect(scoreLabel(0)).toBe("0.0");
    expect(scoreLabel(Number.NaN)).toBe("—");
  });
});

describe("diagnostic export privacy", () => {
  it("exports known counters and codes, never arbitrary report fields or nested data", () => {
    const secret = "credential-secret";
    const report = {
      pluginVersion: "1.3.2", profile: secret, profileDir: `/Users/${secret}`, secret,
      summary: { ok: false, errors: 2, warnings: 0, conflicts: 0, dependencies: 1, detail: secret },
      catalog: { ok: false, latencyMs: 20, staleDays: null, counts: { total: 40, secret }, dataUrl: `https://u:${secret}@example.com/private?token=${secret}`, error: secret },
      inventory: { official: 1, community: 2, skills: 3, enabled: 4, disabled: 0, extraDependencies: [secret] },
      findings: [
        { code: "catalog-unreachable", subject: secret, message: secret, detail: secret },
        { code: secret, subject: secret },
      ],
      bundles: [{ directory: secret, spec: secret }], patch: { path: secret }, peers: [{ range: secret }],
    } as unknown as DiagnosticReport;
    const exported = diagnosticSummary(report);
    expect(exported.findings).toEqual({ "catalog-unreachable": 1, other: 1 });
    expect(exported.pluginVersion).toBe("1.3.2");
    expect(exported.catalog.total).toBe(40);
    expect(JSON.stringify(exported)).not.toContain(secret);
    report.pluginVersion = secret;
    expect(diagnosticSummary(report).pluginVersion).toBeNull();
  });
});
