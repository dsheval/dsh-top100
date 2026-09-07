export function deltaLabel(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value > 0 ? `+${value}` : String(value);
}
export function scoreLabel(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(1);
}
