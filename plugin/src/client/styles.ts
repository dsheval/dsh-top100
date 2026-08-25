export const css = `
.dsh-top100 {
  --t100-ink: color-mix(in srgb, currentColor 92%, transparent);
  --t100-muted: color-mix(in srgb, currentColor 58%, transparent);
  --t100-line: color-mix(in srgb, currentColor 14%, transparent);
  --t100-fill: color-mix(in srgb, currentColor 6%, transparent);
  --t100-accent: #2f6f68;
  --t100-accent-soft: color-mix(in srgb, #2f6f68 16%, transparent);
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  color: var(--t100-ink);
}
.dsh-top100 header {
  display: grid;
  gap: 6px;
}
.dsh-top100 h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.dsh-top100 .lede {
  margin: 0;
  color: var(--t100-muted);
  font-size: 13px;
  line-height: 1.45;
}
.dsh-top100 .meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  color: var(--t100-muted);
  font-size: 12px;
}
.dsh-top100 .toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.dsh-top100 input[type="search"] {
  flex: 1 1 220px;
  min-width: 180px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--t100-line);
  border-radius: 8px;
  background: var(--t100-fill);
  color: inherit;
}
.dsh-top100 .tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dsh-top100 .tab,
.dsh-top100 button {
  border: 1px solid var(--t100-line);
  background: transparent;
  color: inherit;
  border-radius: 8px;
  height: 32px;
  padding: 0 10px;
  font: inherit;
  cursor: pointer;
}
.dsh-top100 .tab[aria-selected="true"],
.dsh-top100 button.primary {
  background: var(--t100-accent);
  border-color: var(--t100-accent);
  color: #f7f3e7;
}
.dsh-top100 button:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-top100 .category-panel {
  display: grid;
  gap: 8px;
}
.dsh-top100 .category-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dsh-top100 .category-options button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.dsh-top100 .category-options button[aria-pressed="true"] {
  border-color: var(--t100-accent);
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
}
.dsh-top100 .category-options small {
  color: var(--t100-muted);
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .category-description {
  margin: 0;
  color: var(--t100-muted);
  font-size: 12px;
  line-height: 1.45;
}
.dsh-top100 .list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: auto;
}
.dsh-top100 article {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 10px 12px;
  border: 1px solid var(--t100-line);
  border-radius: 10px;
  background: var(--t100-fill);
}
.dsh-top100 .rank {
  display: flex;
  align-items: center;
  gap: 8px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--t100-accent);
}
.dsh-top100 .rank input {
  margin: 0;
}
.dsh-top100 h3 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 650;
}
.dsh-top100 h3 a {
  color: inherit;
  text-decoration: none;
}
.dsh-top100 h3 a:hover {
  text-decoration: underline;
}
.dsh-top100 .desc {
  margin: 0;
  color: var(--t100-muted);
  font-size: 12px;
  line-height: 1.45;
}
.dsh-top100 .facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  color: var(--t100-muted);
  font-size: 11px;
}
.dsh-top100 .actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}
.dsh-top100 .job {
  display: grid;
  gap: 4px;
  width: min(240px, 28vw);
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--t100-accent-soft);
  font-size: 12px;
}
.dsh-top100 .job small {
  color: var(--t100-muted);
  overflow-wrap: anywhere;
}
.dsh-top100 .job-failed {
  background: color-mix(in srgb, #b42318 12%, transparent);
}
.dsh-top100 .job-installed {
  background: color-mix(in srgb, #16803c 12%, transparent);
}
.dsh-top100 .banner,
.dsh-top100 .error {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--t100-accent-soft);
  font-size: 13px;
}
.dsh-top100 .error {
  background: color-mix(in srgb, #b42318 12%, transparent);
}
.dsh-top100 .mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, #17211f 42%, transparent);
}
.dsh-top100 .dialog {
  width: min(440px, calc(100vw - 32px));
  padding: 16px;
  border-radius: 12px;
  background: Canvas;
  color: CanvasText;
  display: grid;
  gap: 10px;
}
.dsh-top100 .dialog h3 {
  font-size: 16px;
}
.dsh-top100 .confirm-list {
  display: grid;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
}
.dsh-top100 code {
  font-size: 12px;
  word-break: break-all;
}
`;
