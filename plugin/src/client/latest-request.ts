/** Own one read-only request; a cancelled or superseded result must never reach the UI. */
export class LatestRequest {
  private controller: AbortController | null = null;
  start(): { signal: AbortSignal; isCurrent: () => boolean } {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    return { signal: controller.signal, isCurrent: () => this.controller === controller && !controller.signal.aborted };
  }
  cancel(): void {
    this.controller?.abort();
    this.controller = null;
  }
}
