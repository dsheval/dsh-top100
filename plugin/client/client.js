window.__ModuleLoader__.load({ id: "dsh-top100-plugin", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/client/RankingsPage.tsx
const VIEWS = [
	"hot",
	"rising",
	"total",
	"category"
];
const BATCH_LIMIT = 20;
async function readJson(url, init) {
	const response = await fetch(url, init);
	const body = await response.json();
	if (!response.ok) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
	return body;
}
function RankingsPage({ t }) {
	const [view, setView] = (0, react.useState)("hot");
	const [category, setCategory] = (0, react.useState)("ai");
	const [query, setQuery] = (0, react.useState)("");
	const [draft, setDraft] = (0, react.useState)("");
	const [data, setData] = (0, react.useState)(null);
	const [items, setItems] = (0, react.useState)([]);
	const [error, setError] = (0, react.useState)(null);
	const [errorAction, setErrorAction] = (0, react.useState)("load");
	const [loading, setLoading] = (0, react.useState)(true);
	const [busy, setBusy] = (0, react.useState)(null);
	const [confirming, setConfirming] = (0, react.useState)(null);
	const [selected, setSelected] = (0, react.useState)([]);
	const [batch, setBatch] = (0, react.useState)(null);
	const [notice, setNotice] = (0, react.useState)(null);
	const load = (0, react.useCallback)(async (nextView, nextQuery, nextCategory, offset = 0, append = false) => {
		setLoading(true);
		setErrorAction("load");
		setError(null);
		try {
			const payload = await readJson(`/dsh-top100/rankings?${new URLSearchParams({
				view: nextView,
				category: nextCategory,
				q: nextQuery,
				offset: String(offset),
				limit: "40"
			})}`);
			setData(payload);
			setItems((current) => append ? [...current, ...payload.items] : payload.items);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
			if (!append) setItems([]);
		} finally {
			setLoading(false);
		}
	}, []);
	(0, react.useEffect)(() => {
		setSelected([]);
		load(view, query, category, 0, false);
	}, [
		category,
		load,
		query,
		view
	]);
	(0, react.useEffect)(() => {
		if (!busy) return void 0;
		const refresh = () => {
			readJson(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(busy)}`).then(async (snapshot) => {
				setBatch(snapshot);
				if (snapshot.completed === snapshot.total) {
					setBusy(null);
					setSelected([]);
					setNotice(snapshot.requiresRestart ? t("restart") : t("batchComplete"));
					await load(view, query, category, 0, false);
				}
			}).catch((cause) => {
				setErrorAction("install");
				setError(cause instanceof Error ? cause.message : String(cause));
			});
		};
		refresh();
		const timer = window.setInterval(refresh, 800);
		return () => window.clearInterval(timer);
	}, [
		busy,
		category,
		load,
		query,
		t,
		view
	]);
	const remaining = (0, react.useMemo)(() => {
		if (!data) return 0;
		return Math.max(0, data.total - items.length);
	}, [data, items.length]);
	const jobsByName = (0, react.useMemo)(() => new Map((batch?.jobs ?? []).map((job) => [job.fullName, job])), [batch]);
	const activeCategory = data?.categories.find((definition) => definition.id === category);
	function toggleSelected(fullName) {
		setSelected((current) => current.includes(fullName) ? current.filter((value) => value !== fullName) : [...current, fullName]);
	}
	async function install(selectedItems) {
		setConfirming(null);
		setNotice(null);
		setError(null);
		try {
			const result = await readJson("/dsh-top100/install-batch", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ fullNames: selectedItems.map((item) => item.fullName) })
			});
			setBatch(result);
			setBusy(result.batchId);
		} catch (cause) {
			setErrorAction("install");
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}
	async function cancelJob(jobId) {
		await readJson("/dsh-top100/cancel", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jobId })
		});
	}
	async function retryJob(jobId) {
		const result = await readJson("/dsh-top100/retry", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jobId })
		});
		setBatch(result);
		setBusy(result.batchId);
	}
	function jobPanel(job) {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: `job job-${job.phase}`,
			children: [
				t(`phase_${job.phase}`),
				job.lastLine ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: job.lastLine }) : null,
				job.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: job.error }) : null,
				![
					"installed",
					"failed",
					"cancelled"
				].includes(job.phase) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => void cancelJob(job.id),
					children: t("cancel")
				}) : ["failed", "cancelled"].includes(job.phase) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: busy !== null,
					onClick: () => void retryJob(job.id),
					children: t("retry")
				}) : null
			]
		});
	}
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-top100",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "lede",
					children: t("subtitle")
				}),
				data ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "meta",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							t("updated"),
							" ",
							data.snapshotDate
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							t("source"),
							" ",
							data.dataUrl
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [data.total, " plugins"] })
					]
				}) : null
			] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "toolbar",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "search",
						value: draft,
						placeholder: t("search"),
						onChange: (event) => setDraft(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Enter") setQuery(draft.trim());
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "primary",
						onClick: () => setQuery(draft.trim()),
						children: t("search")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "primary",
						disabled: selected.length === 0 || busy !== null,
						onClick: () => setConfirming(items.filter((item) => selected.includes(item.fullName))),
						children: [
							t("batchInstall"),
							" (",
							selected.length,
							")"
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "tabs",
						role: "tablist",
						children: VIEWS.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "tab",
							role: "tab",
							"aria-selected": view === id,
							onClick: () => {
								setView(id);
								setQuery("");
								setDraft("");
							},
							children: t(id)
						}, id))
					})
				]
			}),
			view === "category" && data ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "category-panel",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "category-options",
					role: "group",
					"aria-label": t("categoryFilter"),
					children: data.categories.map((definition) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						"aria-pressed": category === definition.id,
						title: definition.description,
						onClick: () => {
							setCategory(definition.id);
							setQuery("");
							setDraft("");
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: definition.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: definition.count })]
					}, definition.id))
				}), activeCategory ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "category-description",
					children: activeCategory.description
				}) : null]
			}) : null,
			notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "banner",
				children: notice
			}) : null,
			error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "error",
				children: [
					t(errorAction === "install" ? "installError" : "loadError"),
					": ",
					error,
					" ",
					errorAction === "load" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void load(view, query, category, 0, false),
						children: t("retry")
					}) : null
				]
			}) : null,
			busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "banner",
				children: batch ? `${t("batchProgress")} ${batch.completed}/${batch.total}` : t("installing")
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "list",
				children: [items.map((item) => {
					const job = jobsByName.get(item.fullName);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "rank",
							children: [item.installable && !item.installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: selected.includes(item.fullName),
								disabled: busy !== null || selected.length >= BATCH_LIMIT && !selected.includes(item.fullName),
								title: selected.length >= BATCH_LIMIT && !selected.includes(item.fullName) ? t("batchLimit") : void 0,
								"aria-label": `${t("select")} ${item.fullName}`,
								onChange: () => toggleSelected(item.fullName)
							}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.rank })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: item.url || `https://github.com/${item.fullName}`,
								target: "_blank",
								rel: "noreferrer",
								children: item.fullName
							}) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "desc",
								children: item.descriptionZh || item.description
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "facts",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("stars"),
										" ",
										item.stars
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("weekly"),
										" ",
										item.weeklyStars
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("daily"),
										" ",
										item.dailyStars
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.type }),
									(item.tags ?? []).slice(0, 3).map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tag }, tag))
								]
							})
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "actions",
							children: [job ? jobPanel(job) : item.installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: true,
								children: t("installed")
							}) : item.installable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "primary",
								disabled: busy !== null,
								onClick: () => setConfirming([item]),
								children: t("install")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: true,
								title: t("skillHint"),
								children: t("browseOnly")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: item.url || `https://github.com/${item.fullName}`,
								target: "_blank",
								rel: "noreferrer",
								children: t("github")
							})]
						})
					] }, `${item.fullName}-${item.rank}`);
				}), !loading && items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "lede",
					children: t("empty")
				}) : null]
			}),
			remaining > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				disabled: loading,
				onClick: () => void load(view, query, category, items.length, true),
				children: [
					t("more"),
					" (",
					remaining,
					")"
				]
			}) : null,
			confirming ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "mask",
				role: "dialog",
				"aria-modal": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dialog",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("confirmTitle") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "lede",
							children: t("confirmBody")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "confirm-list",
							children: confirming.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.fullName }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								t("confirmSpec"),
								": ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: item.installSpec?.spec ?? item.type })
							] })] }, item.fullName))
						}),
						confirming.some((item) => item.install?.needsConfig) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "lede",
							children: t("confirmNeedConfig")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "toolbar",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "primary",
								onClick: () => void install(confirming),
								children: t("confirm")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setConfirming(null),
								children: t("cancel")
							})]
						})
					]
				})
			}) : null
		]
	});
}

//#endregion
//#region src/client/SettingsCard.tsx
function SettingsCard({ t }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-top100",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("cardTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "lede",
			children: t("cardHint")
		})]
	});
}

//#endregion
//#region src/client/styles.ts
const css = `
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

//#endregion
//#region src/client/locales.ts
const zh = {
	nav: "插件排行",
	title: "DSH-Top100",
	subtitle: "从线上榜单浏览、搜索并安装已验证的 DSH 插件",
	search: "搜索名称、简介或标签",
	hot: "Top 100",
	rising: "新锐",
	total: "总榜",
	category: "分类榜",
	categoryFilter: "插件分类",
	updated: "数据日期",
	source: "数据源",
	empty: "没有匹配的插件",
	loadError: "无法读取线上榜单",
	installError: "插件安装失败",
	retry: "重试",
	install: "安装",
	batchInstall: "安装已选择",
	batchProgress: "批量安装进度",
	batchComplete: "批量安装完成。",
	batchLimit: "每批最多安装 20 个项目",
	select: "选择",
	installed: "已安装",
	browseOnly: "仅浏览",
	installing: "安装中",
	confirmTitle: "确认安装",
	confirmBody: "将写入当前 DSH profile 或 skills 目录，不执行 README 命令。Git 源插件如声明 prepare，确认后会仅为该包放行构建脚本；这会在本机执行第三方代码。",
	confirmSpec: "安装源",
	confirmNeedConfig: "这个插件可能还需要额外配置。",
	confirm: "确认安装",
	cancel: "取消",
	github: "GitHub",
	more: "加载更多",
	stars: "Stars",
	weekly: "近7日",
	daily: "今日",
	restart: "安装完成。若新功能没有出现，请重启 dsh web。",
	phase_queued: "排队中",
	phase_validating: "验证中",
	phase_downloading: "下载中",
	"phase_waiting-profile-lock": "等待写入 profile",
	phase_installing: "安装中",
	phase_installed: "安装完成",
	phase_failed: "安装失败",
	phase_cancelled: "已取消",
	skillHint: "这是 Skill，不能通过 dsh plugin 一键装进 Web profile。",
	cardTitle: "榜单数据源",
	cardHint: "Host 端从该地址读取 rankings.json。"
};
const en = {
	nav: "Rankings",
	title: "DSH-Top100",
	subtitle: "Browse, search, and install verified DSH plugins from the hosted rankings",
	search: "Search name, summary, or tags",
	hot: "Top 100",
	rising: "Rising",
	total: "All",
	category: "Categories",
	categoryFilter: "Plugin category",
	updated: "Snapshot",
	source: "Source",
	empty: "No matching plugins",
	loadError: "Could not load the hosted rankings",
	installError: "Plugin installation failed",
	retry: "Retry",
	install: "Install",
	batchInstall: "Install selected",
	batchProgress: "Batch progress",
	batchComplete: "Batch installation complete.",
	batchLimit: "A batch can contain at most 20 items",
	select: "Select",
	installed: "Installed",
	browseOnly: "Browse only",
	installing: "Installing",
	confirmTitle: "Confirm install",
	confirmBody: "This writes to the current DSH profile or skills directory without running README commands. If a Git plugin declares prepare, confirming allows build scripts for that exact package, which executes third-party code locally.",
	confirmSpec: "Install spec",
	confirmNeedConfig: "This plugin may require extra configuration.",
	confirm: "Install",
	cancel: "Cancel",
	github: "GitHub",
	more: "Load more",
	stars: "Stars",
	weekly: "7-day",
	daily: "Today",
	restart: "Installed. Restart dsh web if the new plugin does not appear.",
	phase_queued: "Queued",
	phase_validating: "Validating",
	phase_downloading: "Downloading",
	"phase_waiting-profile-lock": "Waiting for profile",
	phase_installing: "Installing",
	phase_installed: "Installed",
	phase_failed: "Failed",
	phase_cancelled: "Cancelled",
	skillHint: "This is a Skill and cannot be installed into the Web profile with dsh plugin.",
	cardTitle: "Rankings source",
	cardHint: "The host reads rankings.json from this URL."
};

//#endregion
//#region src/client/index.ts
/**
* Browser half: register a Settings section. Official dual-face client entry.
*/
const NS = "dsh-top100";
const STYLE_ID = "dsh-top100-plugin-css";
const name = "dsh-top100";
const inject = ["slots", "locale"];
function ensureCss() {
	if (typeof document === "undefined") return () => void 0;
	if (document.getElementById(STYLE_ID) === null) {
		const tag = document.createElement("style");
		tag.id = STYLE_ID;
		tag.dataset.plugin = "dsh-top100-plugin";
		tag.textContent = css;
		document.head.appendChild(tag);
	}
	return () => document.getElementById(STYLE_ID)?.remove();
}
function apply(ctx) {
	ctx.effect(() => {
		ctx.locale.register(NS, {
			zh,
			en
		});
	}, "dsh-top100: dictionaries");
	ctx.effect(() => ensureCss(), "dsh-top100: css");
	const t = ctx.locale.bind(NS);
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "dsh-top100",
		order: 45,
		label: () => t("nav"),
		locale: NS,
		inject: () => ({ t })
	}, () => (0, react.createElement)(RankingsPage, { t })));
	ctx.inject?.(["settingsScope"], (scoped) => {
		scoped.slots.inject("settings.plugin.item", () => scoped.slots.register({
			name: "settings.plugin.item",
			key: "dsh-top100",
			locale: NS,
			inject: () => ({ t })
		}, () => (0, react.createElement)(SettingsCard, { t })));
	});
}

//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
return module.exports; } });