export const css = `
.dsh-top100 {
  --t100-ink: var(--dsw-alias-label-primary, color-mix(in srgb, currentColor 92%, transparent));
  --t100-muted: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 58%, transparent));
  --t100-line: var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 14%, transparent));
  --t100-surface: var(--dsw-alias-bg-layer-1, Canvas);
  --t100-fill: var(--dsw-alias-bg-layer-2, color-mix(in srgb, currentColor 6%, transparent));
  --t100-accent: color-mix(in srgb, #3f8b82 78%, currentColor);
  --t100-accent-soft: color-mix(in srgb, var(--t100-accent) 16%, transparent);
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  color: var(--t100-ink);
  container-type: inline-size;
}
.dsh-top100 .market-head {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 2px 0 4px;
}
.dsh-top100 .rank-mark {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 34%, var(--t100-line));
  border-radius: 14px;
  background: color-mix(in srgb, var(--t100-accent) 8%, var(--t100-surface));
  color: var(--t100-accent);
  box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--t100-surface) 72%, transparent);
}
.dsh-top100 .rank-mark svg {
  width: 40px;
  height: 40px;
}
.dsh-top100 .rank-mark-list {
  fill: var(--t100-surface);
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 2.25;
}
.dsh-top100 .rank-mark-list circle:first-child {
  fill: currentColor;
}
.dsh-top100 .rank-mark-check {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.75;
}
.dsh-top100 .head-copy {
  display: grid;
  min-width: 0;
  gap: 5px;
}
.dsh-top100 h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.2;
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
  gap: 5px 14px;
  color: var(--t100-muted);
  font-size: 11px;
  line-height: 18px;
}
.dsh-top100 .data-source {
  color: var(--t100-accent);
  font-weight: 650;
  text-decoration: none;
}
.dsh-top100 .data-source:hover { text-decoration: underline; }
.dsh-top100 .cache-warning { color: #9a6700; }
.dsh-top100 .toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.dsh-top100 .search-cluster {
  display: flex;
  flex: 1 1 auto;
  gap: 8px;
  min-width: 0;
}
.dsh-top100 .page-tabs {
  display: flex;
  gap: 2px;
  padding: 0 0 8px;
  border-bottom: 1px solid var(--t100-line);
}
.dsh-top100 .page-tabs button {
  min-width: 76px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  color: var(--t100-muted);
  font-weight: 600;
}
.dsh-top100 .page-tabs button[aria-selected="true"] {
  color: var(--t100-accent);
  border-bottom-color: var(--t100-accent);
  background: transparent;
}
.dsh-top100 .ranking-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dsh-top100 input[type="search"] {
  flex: 1 1 auto;
  min-width: 180px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--t100-line);
  border-radius: 9px;
  background: var(--t100-surface);
  color: inherit;
}
.dsh-top100 .filter-control {
  position: relative;
  flex: 0 0 auto;
}
.dsh-top100 button.filter-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 76px;
  white-space: nowrap;
}
.dsh-top100 button.filter-trigger[aria-expanded="true"],
.dsh-top100 button.filter-trigger:has(.filter-count) {
  border-color: color-mix(in srgb, var(--t100-accent) 54%, var(--t100-line));
  color: var(--t100-accent);
  background: var(--t100-accent-soft);
}
.dsh-top100 .filter-trigger svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.5;
}
.dsh-top100 .filter-count {
  display: grid;
  place-items: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 99px;
  background: var(--t100-accent);
  color: #f8fbfa;
  font-size: 10px;
  font-weight: 700;
}
.dsh-top100 .filter-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 7px);
  right: 0;
  display: grid;
  gap: 4px;
  width: min(310px, calc(100vw - 48px));
  padding: 10px;
  border: 1px solid var(--t100-line);
  border-radius: 10px;
  background: var(--t100-surface);
  box-shadow: 0 12px 30px color-mix(in srgb, #17211f 18%, transparent);
}
.dsh-top100 .filter-popover > p {
  margin: 0 4px 4px;
  color: var(--t100-muted);
  font-size: 11px;
}
.dsh-top100 .filter-popover label {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 46px;
  padding: 7px 8px;
  border-radius: 7px;
  cursor: pointer;
}
.dsh-top100 .filter-popover label:hover { background: var(--t100-fill); }
.dsh-top100 .filter-popover label > span {
  display: grid;
  flex: 1 1 auto;
  gap: 2px;
}
.dsh-top100 .filter-popover strong { font-size: 12px; }
.dsh-top100 .filter-popover small {
  color: var(--t100-muted);
  font-size: 10px;
  line-height: 1.35;
}
.dsh-top100 .filter-popover input { flex: 0 0 auto; }
.dsh-top100 button.filter-reset {
  justify-self: start;
  height: 28px;
  margin: 3px 4px 0;
  padding: 0;
  border: 0;
  color: var(--t100-accent);
  font-size: 11px;
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
  border-radius: 7px;
  height: 34px;
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
.dsh-top100 .ranking-context {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 24px;
  padding: 0 2px;
  color: var(--t100-muted);
  font-size: 11px;
  line-height: 18px;
}
.dsh-top100 .result-count {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-top100 .result-count strong {
  color: var(--t100-ink);
  font-size: 13px;
}
.dsh-top100 .filter-summary {
  flex: 0 0 auto;
  color: var(--t100-accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-top100 .ranking-basis {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  cursor: help;
}
.dsh-top100 .ranking-basis::before {
  content: "";
  flex: 0 0 auto;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--t100-accent);
}
.dsh-top100 .list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  padding: 1px 2px 10px 1px;
}
.dsh-top100 .card-skeleton {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 8px;
  min-height: 148px;
  padding: 13px;
  border: 1px solid var(--t100-line);
  border-radius: 12px;
  background: var(--t100-surface);
}
.dsh-top100 .card-skeleton > div {
  display: grid;
  align-content: start;
  gap: 9px;
}
.dsh-top100 .skeleton-rank,
.dsh-top100 .skeleton-line,
.dsh-top100 .skeleton-pills {
  display: block;
  overflow: hidden;
  background: color-mix(in srgb, currentColor 8%, transparent);
}
.dsh-top100 .skeleton-rank {
  width: 28px;
  height: 28px;
  border-radius: 8px;
}
.dsh-top100 .skeleton-line {
  position: relative;
  width: 100%;
  height: 12px;
  border-radius: 4px;
}
.dsh-top100 .skeleton-title { width: 62%; height: 15px; }
.dsh-top100 .skeleton-short { width: 74%; }
.dsh-top100 .skeleton-pills {
  width: 48%;
  height: 20px;
  margin-top: 4px;
  border-radius: 99px;
}
.dsh-top100 .skeleton-line::after,
.dsh-top100 .skeleton-rank::after,
.dsh-top100 .skeleton-pills::after {
  content: "";
  display: block;
  width: 42%;
  height: 100%;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, currentColor 8%, transparent), transparent);
  transform: translateX(-120%);
  animation: t100-skeleton 1.6s ease-in-out infinite;
}
@keyframes t100-skeleton { to { transform: translateX(340%); } }
.dsh-top100 article {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 10px 8px;
  align-items: start;
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--t100-line);
  border-radius: 12px;
  background: var(--t100-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, #17211f 6%, transparent);
  content-visibility: auto;
  contain-intrinsic-size: auto 180px;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}
.dsh-top100 article::before {
  content: "";
  position: absolute;
  inset: 12px auto 12px 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--t100-line);
}
.dsh-top100 article[data-trust="install-source"]::before { background: var(--t100-accent); }
.dsh-top100 article:hover {
  border-color: color-mix(in srgb, var(--t100-accent) 34%, var(--t100-line));
  box-shadow: 0 7px 18px color-mix(in srgb, #17211f 9%, transparent);
  transform: translateY(-1px);
}
.dsh-top100 .rank {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 25%, var(--t100-line));
  border-radius: 8px 8px 8px 3px;
  background: var(--t100-accent-soft);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--t100-accent);
}
.dsh-top100 article[data-rank="1"] .rank,
.dsh-top100 article[data-rank="2"] .rank,
.dsh-top100 article[data-rank="3"] .rank {
  border-color: var(--t100-accent);
  background: var(--t100-accent);
  color: #f8fbfa;
}
.dsh-top100 .rank input {
  margin: 0;
}
.dsh-top100 .card-copy { min-width: 0; }
.dsh-top100 h3 {
  margin: 0 0 5px;
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  text-overflow: ellipsis;
}
.dsh-top100 h3 a {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  color: inherit;
  text-decoration: none;
}
.dsh-top100 h3 a > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-top100 .title-arrow {
  flex: 0 0 auto;
  color: var(--t100-muted);
  font-size: 11px;
  font-weight: 500;
}
.dsh-top100 h3 a:hover {
  color: var(--t100-accent);
  text-decoration: underline;
}
.dsh-top100 .desc {
  display: -webkit-box;
  min-height: 36px;
  margin: 0;
  overflow: hidden;
  color: var(--t100-muted);
  font-size: 12px;
  line-height: 18px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.dsh-top100 .facts {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 10px;
  margin-top: 8px;
  color: var(--t100-muted);
  font-size: 11px;
}
.dsh-top100 .facts > span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
}
.dsh-top100 .ranking-metric strong {
  color: var(--t100-accent);
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .star-fact {
  color: var(--t100-ink);
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .evidence-badge,
.dsh-top100 .form-factor {
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
  font-weight: 650;
}
.dsh-top100 .evidence-indexed {
  background: var(--t100-fill);
  color: var(--t100-muted);
}
.dsh-top100 .form-factor {
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: var(--t100-muted);
}
.dsh-top100 details.evidence-rail {
  margin-top: 7px;
  padding: 6px 9px 6px 12px;
  border: 0;
  border-left: 3px solid var(--t100-accent);
  border-radius: 0 7px 7px 0;
  background: color-mix(in srgb, var(--t100-accent) 5%, transparent);
  color: var(--t100-muted);
  font-size: 11px;
}
.dsh-top100 .evidence-rail summary {
  color: var(--t100-accent);
  font-size: 11px;
}
.dsh-top100 .evidence-rail ul {
  margin: 7px 0 0;
  padding-left: 17px;
}
.dsh-top100 .evidence-rail p {
  margin: 7px 0 0;
  line-height: 1.45;
}
.dsh-top100 .actions {
  display: flex;
  grid-column: 1 / -1;
  gap: 8px;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid var(--t100-line);
}
.dsh-top100 .actions > button,
.dsh-top100 .actions > .project-link {
  flex: 1 1 0;
}
.dsh-top100 .project-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--t100-line);
  border-radius: 8px;
  color: var(--t100-ink);
  background: var(--t100-fill);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  text-decoration: none;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease, transform 120ms ease;
}
.dsh-top100 .project-link:hover {
  border-color: var(--t100-accent);
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
  transform: translateY(-1px);
}
.dsh-top100 .project-link:focus-visible {
  outline: 2px solid var(--t100-accent);
  outline-offset: 2px;
}
.dsh-top100 button.detail-button { color: var(--t100-muted); }
.dsh-top100 .row-actions {
  min-width: 104px;
}
.dsh-top100 button.danger {
  color: #b42318;
  border-color: color-mix(in srgb, #b42318 36%, transparent);
}
.dsh-top100 .status-cell {
  display: grid;
  place-items: center;
  min-height: 32px;
}
.dsh-top100 .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #16803c;
}
.dsh-top100 .dot.off {
  background: #9b9b9b;
}
.dsh-top100 .badge {
  display: inline-flex;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--t100-accent-soft);
}
.dsh-top100 .badge.warn {
  color: #9a6700;
  background: color-mix(in srgb, #f0b429 18%, transparent);
}
.dsh-top100 .badge.muted {
  color: var(--t100-muted);
  background: var(--t100-fill);
}
.dsh-top100 .managed-page,
.dsh-top100 .diag-page {
  display: grid;
  gap: 12px;
  min-height: 0;
}
.dsh-top100 .diag-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 10px 12px;
  border: 1px solid var(--t100-line);
  border-radius: 10px;
  background: var(--t100-fill);
  font-size: 12px;
}
.dsh-top100 .diag-summary button {
  margin-left: auto;
}
.dsh-top100 .diag-ok { color: #16803c; }
.dsh-top100 .diag-error { color: #b42318; }
.dsh-top100 .diag-warning { color: #9a6700; }
.dsh-top100 .diag-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.dsh-top100 .diag-grid section,
.dsh-top100 details {
  padding: 10px 12px;
  border: 1px solid var(--t100-line);
  border-radius: 10px;
  background: var(--t100-fill);
}
.dsh-top100 .diag-grid h3,
.dsh-top100 details summary {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.dsh-top100 .diag-grid p { margin: 6px 0 0; font-size: 12px; color: var(--t100-muted); }
.dsh-top100 .diag-list { display: grid; gap: 6px; margin-top: 8px; font-size: 12px; }
.dsh-top100 .diag-list small { display: block; color: var(--t100-muted); margin-top: 2px; }
.dsh-top100 .job {
  display: grid;
  gap: 9px;
  width: min(340px, 38vw);
  padding: 11px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 28%, var(--t100-line));
  border-radius: 10px;
  background: color-mix(in srgb, Canvas 94%, var(--t100-accent-soft));
  font-size: 12px;
}
.dsh-top100 .job-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.dsh-top100 .job-heading strong {
  font-size: 13px;
  font-weight: 700;
}
.dsh-top100 .job-heading span {
  color: var(--t100-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-top100 .job-progress {
  position: relative;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.dsh-top100 .job-progress > span {
  position: relative;
  display: block;
  height: 100%;
  min-width: 6px;
  overflow: hidden;
  border-radius: inherit;
  background: var(--t100-accent);
  transition: width 520ms cubic-bezier(.2,.75,.25,1);
}
.dsh-top100 .job:not(.job-installed):not(.job-failed):not(.job-cancelled) .job-progress > span::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0 35%, color-mix(in srgb, white 62%, transparent) 50%, transparent 65% 100%);
  transform: translateX(-100%);
  animation: t100-progress-sweep 1.8s ease-in-out infinite;
}
.dsh-top100 .job-stages {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  color: var(--t100-muted);
  font-size: 9px;
}
.dsh-top100 .job-stages > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.dsh-top100 .job-stages i {
  width: 6px;
  height: 6px;
  border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 50%;
  background: Canvas;
}
.dsh-top100 .job-stages .is-active,
.dsh-top100 .job-stages .is-complete {
  color: var(--t100-accent);
}
.dsh-top100 .job-stages .is-active i {
  border-color: var(--t100-accent);
  box-shadow: 0 0 0 3px var(--t100-accent-soft);
}
.dsh-top100 .job-stages .is-complete i {
  border-color: var(--t100-accent);
  background: var(--t100-accent);
}
.dsh-top100 .job-status {
  margin: 0;
  color: var(--t100-muted);
  line-height: 1.45;
}
.dsh-top100 .job-status span {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .activation,
.dsh-top100 .job-provenance {
  margin: 0;
  color: var(--t100-muted);
  line-height: 1.45;
}
.dsh-top100 .activation.activation-restart-required,
.dsh-top100 .activation.activation-unknown,
.dsh-top100 .activation.activation-broken {
  color: #9a6700;
  font-weight: 650;
}
.dsh-top100 .job-provenance code {
  display: block;
  margin-top: 3px;
}
.dsh-top100 .job-failed {
  border-color: color-mix(in srgb, #b42318 34%, var(--t100-line));
  background: color-mix(in srgb, Canvas 96%, #b42318 4%);
}
.dsh-top100 .job-failed .job-progress > span {
  background: #b42318;
}
.dsh-top100 .job-failed .job-stages .is-active,
.dsh-top100 .job-failed .job-stages .is-complete {
  color: #b42318;
}
.dsh-top100 .job-failed .job-stages .is-active i,
.dsh-top100 .job-failed .job-stages .is-complete i {
  border-color: #b42318;
}
.dsh-top100 .job-failed .job-stages .is-complete i {
  background: #b42318;
}
.dsh-top100 .job-installed {
  border-color: color-mix(in srgb, var(--t100-accent) 30%, var(--t100-line));
  background: color-mix(in srgb, Canvas 96%, var(--t100-accent-soft));
}
.dsh-top100 .job-installed .job-progress > span {
  background: var(--t100-accent);
}
.dsh-top100 .job-installed.activation-restart-required {
  border-color: color-mix(in srgb, #c98300 40%, var(--t100-line));
  background: color-mix(in srgb, Canvas 96%, #f0b429 7%);
}
.dsh-top100 .job-installed.activation-restart-required .job-progress > span {
  background: #c98300;
}
.dsh-top100 .job-error-message {
  display: grid;
  gap: 6px;
  padding: 9px 10px;
  border-left: 3px solid #b42318;
  border-radius: 6px;
  background: color-mix(in srgb, #b42318 7%, transparent);
  line-height: 1.45;
}
.dsh-top100 .job-error-message > strong {
  color: color-mix(in srgb, #b42318 88%, currentColor);
  font-size: 12px;
}
.dsh-top100 .job-error-message p {
  margin: 0;
  color: var(--t100-muted);
}
.dsh-top100 .job-error-packages,
.dsh-top100 .job-error-hint {
  display: grid;
  gap: 2px;
}
.dsh-top100 .job-error-packages > span,
.dsh-top100 .job-error-hint > span {
  color: var(--t100-ink);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .04em;
}
.dsh-top100 .job-error-packages code {
  color: var(--t100-ink);
}
.dsh-top100 details.job-error-details {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.dsh-top100 .job-error-details summary {
  color: var(--t100-muted);
  font-size: 11px;
  font-weight: 650;
}
.dsh-top100 .job-error-details pre {
  max-height: 140px;
  margin: 7px 0 0;
  padding: 8px;
  overflow: auto;
  border-radius: 6px;
  background: color-mix(in srgb, CanvasText 6%, Canvas);
  color: var(--t100-muted);
  font: 10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.dsh-top100 .job > button {
  width: 100%;
}
@keyframes t100-progress-sweep {
  55%, 100% { transform: translateX(100%); }
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
.dsh-top100 .detail-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, #17211f 38%, transparent);
}
.dsh-top100 .detail-drawer {
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: min(440px, calc(100vw - 24px));
  height: 100%;
  padding: 18px;
  overflow: auto;
  border-left: 1px solid var(--t100-line);
  background: var(--t100-surface);
  color: var(--t100-ink);
  box-shadow: -18px 0 48px color-mix(in srgb, #17211f 18%, transparent);
  animation: t100-drawer-in 180ms cubic-bezier(.2,.75,.25,1);
}
@keyframes t100-drawer-in {
  from { opacity: .7; transform: translateX(24px); }
}
.dsh-top100 .detail-head {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 32px;
  gap: 10px;
  align-items: start;
}
.dsh-top100 .detail-rank {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px 9px 9px 3px;
  background: var(--t100-accent);
  color: #f8fbfa;
  font-size: 13px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .detail-head h3 {
  margin: 0;
  font-size: 16px;
  line-height: 22px;
}
.dsh-top100 .detail-head p {
  margin: 2px 0 0;
  color: var(--t100-muted);
  font-size: 11px;
}
.dsh-top100 button.detail-close {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  color: var(--t100-muted);
  font-size: 22px;
  font-weight: 300;
  line-height: 1;
}
.dsh-top100 button.detail-close:hover {
  background: var(--t100-fill);
  color: var(--t100-ink);
}
.dsh-top100 .detail-description {
  margin: 0;
  color: var(--t100-muted);
  font-size: 12px;
  line-height: 1.6;
}
.dsh-top100 .detail-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
}
.dsh-top100 .detail-metrics > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 9px 8px;
  border-radius: 8px;
  background: var(--t100-fill);
}
.dsh-top100 .detail-metrics dt,
.dsh-top100 .detail-properties dt {
  color: var(--t100-muted);
  font-size: 10px;
}
.dsh-top100 .detail-metrics dd {
  margin: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
}
.dsh-top100 .detail-section {
  display: grid;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--t100-line);
}
.dsh-top100 .detail-section h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 750;
  letter-spacing: .02em;
}
.dsh-top100 .detail-section > p,
.dsh-top100 .detail-section > ul {
  margin: 0;
  color: var(--t100-muted);
  font-size: 11px;
  line-height: 1.55;
}
.dsh-top100 .detail-section > ul {
  display: grid;
  gap: 4px;
  padding-left: 17px;
}
.dsh-top100 .detail-section .detail-highlight {
  justify-self: start;
  padding: 4px 8px;
  border-radius: 99px;
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
  font-weight: 700;
}
.dsh-top100 .detail-properties {
  display: grid;
  gap: 7px;
  margin: 0;
}
.dsh-top100 .detail-properties > div {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
}
.dsh-top100 .detail-properties dd {
  margin: 0;
  font-size: 11px;
  text-align: right;
}
.dsh-top100 .detail-section .detail-caveat {
  padding: 8px 10px;
  border-left: 3px solid #c98300;
  border-radius: 0 6px 6px 0;
  background: color-mix(in srgb, #f0b429 8%, transparent);
}
.dsh-top100 .detail-source {
  display: grid;
  gap: 5px;
  padding: 9px 10px;
  border-radius: 7px;
  background: var(--t100-fill);
}
.dsh-top100 .detail-source span {
  color: var(--t100-muted);
  font-size: 10px;
  font-weight: 650;
}
.dsh-top100 .detail-source code {
  color: var(--t100-ink);
  font-size: 10px;
}
.dsh-top100 .browse-note {
  padding: 9px 10px;
  border-radius: 7px;
  background: var(--t100-fill);
}
.dsh-top100 .detail-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 8px;
  margin: auto -18px -18px;
  padding: 12px 18px 18px;
  border-top: 1px solid var(--t100-line);
  background: color-mix(in srgb, var(--t100-surface) 94%, transparent);
  backdrop-filter: blur(10px);
}
.dsh-top100 .detail-actions > * { flex: 1 1 0; }
.dsh-top100 .mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, #17211f 42%, transparent);
}
.dsh-top100 .dialog {
  width: min(620px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
  overflow: auto;
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
  max-height: 460px;
  overflow: auto;
}
.dsh-top100 .confirm-list > div {
  display: grid;
  gap: 7px;
}
.dsh-top100 .script-evidence {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 7px 9px;
  border-radius: 7px;
  background: color-mix(in srgb, #f0b429 11%, transparent);
}
.dsh-top100 .script-evidence span {
  color: #9a6700;
  font: 650 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dsh-top100 .risk-list {
  display: grid;
  gap: 6px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}
.dsh-top100 .risk-list li {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border-left: 3px solid var(--t100-accent);
  background: var(--t100-fill);
  font-size: 11px;
  line-height: 1.45;
}
.dsh-top100 .risk-list li[data-severity="warning"] { border-left-color: #c98300; }
.dsh-top100 .risk-list span { color: var(--t100-muted); white-space: pre-wrap; }
.dsh-top100 .risk-approval {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, #c98300 38%, var(--t100-line));
  border-radius: 8px;
  background: color-mix(in srgb, #f0b429 8%, transparent);
  font-size: 12px;
  line-height: 1.45;
}
.dsh-top100 button:focus-visible,
.dsh-top100 input:focus-visible,
.dsh-top100 summary:focus-visible {
  outline: 2px solid var(--t100-accent);
  outline-offset: 2px;
}
.dsh-top100 code {
  font-size: 12px;
  word-break: break-all;
}
@container (min-width: 540px) {
  .dsh-top100 .list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 420px) {
  .dsh-top100 .market-head { grid-template-columns: 40px minmax(0, 1fr); gap: 10px; }
  .dsh-top100 .rank-mark { width: 40px; height: 40px; border-radius: 12px; }
  .dsh-top100 .rank-mark svg { width: 34px; height: 34px; }
  .dsh-top100 .meta { gap: 3px 10px; }
  .dsh-top100 .toolbar { flex-wrap: wrap; }
  .dsh-top100 .search-cluster { flex-basis: 100%; }
  .dsh-top100 .search-cluster > button.primary { flex: 0 0 auto; }
  .dsh-top100 .filter-control { margin-left: auto; }
  .dsh-top100 .actions { flex-wrap: wrap; }
  .dsh-top100 .actions > button,
  .dsh-top100 .actions > .project-link { flex-basis: calc(50% - 4px); }
  .dsh-top100 .detail-drawer { width: 100%; padding: 15px; }
  .dsh-top100 .detail-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dsh-top100 .detail-actions { margin: auto -15px -15px; padding: 11px 15px 15px; }
}
@media (max-width: 720px) {
  .dsh-top100 .diag-grid { grid-template-columns: 1fr; }
  .dsh-top100 .actions .job { flex: 1 1 100%; width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-top100 article { transition: none; }
  .dsh-top100 article:hover { transform: none; }
  .dsh-top100 .detail-drawer { animation: none; }
  .dsh-top100 .skeleton-line::after,
  .dsh-top100 .skeleton-rank::after,
  .dsh-top100 .skeleton-pills::after { display: none; animation: none; }
  .dsh-top100 .job-progress > span { transition: none; }
  .dsh-top100 .job-progress > span::after { display: none; animation: none; }
}
`;
