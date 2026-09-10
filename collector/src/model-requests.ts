/** Shared gate for every paid model transport. No budget accounting is claimed here. */
const BUDGET_PROTECTION_READY = false;

export const MODEL_REQUESTS_PAUSED = "Model requests are paused: budget protection has not been accepted; use --dry-run or --limit 0";

export interface ModelRequestControl {
  /** Only honored in tests, with an explicitly injected offline transport. Not a CLI option. */
  requestMode?: "offline-test";
  offlineTransport?: typeof fetch;
}

export function modelRequestsEnabled(): boolean {
  return process.env.DSH_MODEL_REQUESTS_ENABLED === "1" && BUDGET_PROTECTION_READY;
}

function offlineTransport(control: ModelRequestControl): typeof fetch | undefined {
  return process.env.NODE_ENV === "test" && control.requestMode === "offline-test"
    ? control.offlineTransport : undefined;
}

export function canRequestModel(control: ModelRequestControl = {}): boolean {
  return !!offlineTransport(control) || modelRequestsEnabled();
}

/** Recheck at each dispatch, including retries. A residual API key grants no permission. */
export async function requestModel(control: ModelRequestControl, url: string, init: RequestInit): Promise<Response> {
  const transport = offlineTransport(control);
  if (transport) return transport(url, init);
  if (!modelRequestsEnabled()) throw new Error(MODEL_REQUESTS_PAUSED);
  return fetch(url, init);
}
