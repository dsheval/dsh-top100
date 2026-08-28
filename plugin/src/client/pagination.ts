/** Keep paginated rows from two independently published catalog snapshots from being mixed. */
export function shouldRestartPagination(
  append: boolean,
  currentGeneratedAt: string | null,
  incomingGeneratedAt: string,
): boolean {
  return append && currentGeneratedAt !== null && currentGeneratedAt !== incomingGeneratedAt;
}
