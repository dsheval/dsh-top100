window.__ModuleLoader__.load({ id: "@dsheval/dsh-top100-plugin", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/client/DiagnosticsPage.tsx
function FindingList({ items }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "diag-list",
		children: items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: `diag-${item.severity}`,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.subject }),
				" — ",
				item.message,
				item.detail ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: item.detail }) : null
			]
		}, `${item.code}-${item.subject}-${item.message}`))
	});
}
function DiagnosticsPage({ t }) {
	const [report, setReport] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const [loading, setLoading] = (0, react.useState)(true);
	const load = (0, react.useCallback)(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch("/dsh-top100/diagnose", { cache: "no-store" });
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
			setReport(body);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setLoading(false);
		}
	}, []);
	(0, react.useEffect)(() => {
		load();
	}, [load]);
	if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "error",
		children: [
			t("diagLoadFail"),
			": ",
			error,
			" ",
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => void load(),
				children: t("retry")
			})
		]
	});
	if (!report) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: "lede",
		children: loading ? t("diagLoading") : t("diagLoadFail")
	});
	const errors = report.findings.filter((item) => item.severity === "error");
	const warnings = report.findings.filter((item) => item.severity === "warning");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "diag-page",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "diag-summary",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						className: report.summary.ok ? "diag-ok" : "diag-error",
						children: report.summary.ok ? t("diagOk") : t("diagIssues")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						t("diagErrors"),
						": ",
						report.summary.errors
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						t("diagWarnings"),
						": ",
						report.summary.warnings
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						t("diagConflicts"),
						": ",
						report.summary.conflicts
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						t("diagDeps"),
						": ",
						report.summary.dependencies
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: loading,
						onClick: () => void load(),
						children: t("diagRefresh")
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "diag-grid",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("diagCatalogTitle") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: report.catalog.dataUrl }) }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						t("updated"),
						": ",
						report.catalog.snapshotDate ?? "—",
						" · ",
						report.catalog.counts.total,
						" plugins"
					] })
				] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("diagInventory") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						t("diagOfficial"),
						": ",
						report.inventory.official,
						" · ",
						t("diagCommunity"),
						": ",
						report.inventory.community,
						" · Skills: ",
						report.inventory.skills
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						t("enabled"),
						": ",
						report.inventory.enabled,
						" · ",
						t("disabled"),
						": ",
						report.inventory.disabled
					] })
				] })]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				open: errors.length > 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
					t("diagErrors"),
					" (",
					errors.length,
					")"
				] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FindingList, { items: errors })]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				open: warnings.length > 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
					t("diagWarnings"),
					" (",
					warnings.length,
					")"
				] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FindingList, { items: warnings })]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
				t("diagBundles"),
				" (",
				report.bundles.length,
				")"
			] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "diag-list",
				children: report.bundles.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.name }),
					" · ",
					item.version ?? "—",
					" · ",
					item.enabled ? t("enabled") : t("disabled"),
					item.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
						className: "diag-error",
						children: item.error
					}) : null
				] }, item.name))
			})] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
				t("diagSkills"),
				" (",
				report.skills.length,
				")"
			] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "diag-list",
				children: report.skills.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.name }),
					" · ",
					item.hasManifest ? "SKILL.md ✓" : "SKILL.md ✕"
				] }, item.name))
			})] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("diagPatch") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "diag-list",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: report.patch.path }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						t("disabled"),
						": ",
						report.patch.disables.join(", ") || "—"
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						t("diagOrphans"),
						": ",
						report.patch.orphans.join(", ") || "—"
					] })
				]
			})] })
		]
	});
}

//#endregion
//#region src/client/install-presentation.ts
const ACTIVE_RANGES = {
	queued: [
		6,
		10,
		8e3
	],
	validating: [
		16,
		30,
		12e3
	],
	downloading: [
		36,
		56,
		18e3
	],
	"waiting-profile-lock": [
		60,
		66,
		2e4
	],
	installing: [
		70,
		92,
		3e4
	]
};
function easedProgress(start, end, elapsed, duration) {
	const ratio = 1 - Math.exp(-Math.max(0, elapsed) / duration);
	return Math.round(start + (end - start) * ratio);
}
function terminalProgress(job) {
	const output = `${job.lastLine}\n${job.error ?? ""}`;
	if (/安装源|catalog|trusted source/i.test(output)) return 26;
	if (/下载|fetch|network|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(output)) return 50;
	if (/等待.*profile|lockfile|锁/i.test(output)) return 64;
	if (/Progress:|ERR_PNPM_|写入|配置验证|profile/i.test(output)) return 88;
	return 76;
}
/** A phase-based estimate. Active work deliberately stops below 100%. */
function installProgress(job, now = Date.now()) {
	if (job.phase === "installed") return 100;
	if (job.phase === "failed" || job.phase === "cancelled") return terminalProgress(job);
	const [start, end, duration] = ACTIVE_RANGES[job.phase];
	return easedProgress(start, end, now - (job.startedAt ?? job.createdAt), duration);
}
function progressAddedCount(line) {
	if (!/\bProgress:/i.test(line)) return null;
	const added = /\badded\s+(\d+)/i.exec(line)?.[1];
	if (added !== void 0) return Number(added);
	const resolved = /\bresolved\s+(\d+)/i.exec(line)?.[1];
	return resolved === void 0 ? null : Number(resolved);
}
/** Replace package-manager chatter with one short, stable status sentence. */
function installStatus(job) {
	const dependencyCount = progressAddedCount(job.lastLine);
	if (dependencyCount !== null) return {
		key: "installStatusDependencies",
		count: dependencyCount
	};
	if (/检查当前.*profile/i.test(job.lastLine)) return { key: "installStatusProfileCheck" };
	if (/验证安装后|验证更新后/i.test(job.lastLine)) return { key: "installStatusFinalCheck" };
	if (/写入.*profile/i.test(job.lastLine)) return { key: "installStatusWriting" };
	return { key: {
		queued: "installStatusQueued",
		validating: "installStatusValidating",
		downloading: "installStatusDownloading",
		"waiting-profile-lock": "installStatusWaiting",
		installing: "installStatusWriting",
		installed: "installStatusInstalled",
		failed: "installStatusFailed",
		cancelled: "installStatusCancelled"
	}[job.phase] };
}
function ignoredBuildPackages(raw) {
	return [...(/Ignored build scripts:\s*([\s\S]*?)(?:\s+Run\s+["']?pnpm approve-builds|$)/i.exec(raw)?.[1] ?? "").matchAll(/(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+@[a-z0-9._~+-]+/gi)].map((match) => match[0]);
}
/** Turn raw pnpm/DSH output into an error category while preserving details. */
function presentInstallError(raw) {
	const detail = raw.trim() || "install failed";
	if (/ERR_PNPM_IGNORED_BUILDS|Ignored build scripts/i.test(detail)) return {
		kind: "ignored-builds",
		packages: ignoredBuildPackages(detail),
		detail
	};
	if (/ERR_PNPM_FETCH_5\d\d|ERR_PNPM_META_FETCH_FAIL|ECONNRESET|EAI_AGAIN|ENETUNREACH|socket hang up/i.test(detail)) return {
		kind: "network",
		packages: [],
		detail
	};
	if (/TimeoutError|ETIMEDOUT|timed?\s*out|超时/i.test(detail)) return {
		kind: "timeout",
		packages: [],
		detail
	};
	if (/\bEACCES\b|\bEPERM\b|permission denied|权限/i.test(detail)) return {
		kind: "permission",
		packages: [],
		detail
	};
	if (/ERR_PNPM_(?:OUTDATED_)?LOCKFILE|frozen[- ]lockfile|lockfile.*(?:mismatch|broken|冲突)/i.test(detail)) return {
		kind: "lockfile",
		packages: [],
		detail
	};
	if (/配置验证|dsh\.profile|cordis\.patch|profile.*(?:invalid|problem|问题)/i.test(detail)) return {
		kind: "profile",
		packages: [],
		detail
	};
	if (/published catalog|trusted DSH install source|安装源|source verification/i.test(detail)) return {
		kind: "source",
		packages: [],
		detail
	};
	return {
		kind: "generic",
		packages: [],
		detail
	};
}

//#endregion
//#region src/client/ManagedPage.tsx
async function readJson$1(url, init) {
	const response = await fetch(url, init);
	const body = await response.json();
	if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
	return body;
}
function ManagedPage({ t, initialQuery = "" }) {
	const [draft, setDraft] = (0, react.useState)(initialQuery);
	const [query, setQuery] = (0, react.useState)(initialQuery);
	const [data, setData] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const [loading, setLoading] = (0, react.useState)(true);
	const [batch, setBatch] = (0, react.useState)(null);
	const [busy, setBusy] = (0, react.useState)(null);
	const [notice, setNotice] = (0, react.useState)(null);
	const loadSequence = (0, react.useRef)(0);
	const load = (0, react.useCallback)(async () => {
		const requestId = ++loadSequence.current;
		setLoading(true);
		setError(null);
		try {
			const payload = await readJson$1(`/dsh-top100/managed?q=${encodeURIComponent(query)}`);
			if (requestId === loadSequence.current) setData(payload);
		} catch (cause) {
			if (requestId === loadSequence.current) setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			if (requestId === loadSequence.current) setLoading(false);
		}
	}, [query]);
	(0, react.useEffect)(() => {
		load();
	}, [load]);
	(0, react.useEffect)(() => {
		if (!busy) return void 0;
		const refresh = () => {
			readJson$1(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(busy)}`).then((snapshot) => {
				setBatch(snapshot);
				if (snapshot.completed === snapshot.total) {
					setBusy(null);
					setNotice(snapshot.requiresRestart ? t("restart") : t("manageComplete"));
					load();
				}
			}).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
		};
		refresh();
		const timer = window.setInterval(refresh, 800);
		return () => window.clearInterval(timer);
	}, [
		busy,
		load,
		t
	]);
	const jobByName = (0, react.useMemo)(() => new Map((batch?.jobs ?? []).map((job) => [job.fullName, job])), [batch]);
	async function manage(action, names, kind) {
		if (action === "uninstall" && !window.confirm(t(kind === "skill" ? "confirmRemoveSkill" : "confirmRemovePlugin"))) return;
		setError(null);
		setNotice(null);
		try {
			const snapshot = await readJson$1("/dsh-top100/manage", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action,
					names,
					kind
				})
			});
			setBatch(snapshot);
			setBusy(snapshot.batchId);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}
	async function toggle(item) {
		try {
			await readJson$1("/dsh-top100/toggle", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: item.name,
					enabled: !item.enabled
				})
			});
			setNotice(t("restart"));
			await load();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}
	const updates = data?.items.filter((item) => item.kind === "bundle" && item.updateAvailable && !item.protected && !item.local) ?? [];
	function descriptionFor(item) {
		const supplied = item.descriptionZh.trim();
		if (supplied) return supplied;
		return item.kind === "skill" ? `${t("installedSkillFallback")}：${item.name}。${t("noChineseDescription")}。` : `${t("installedPluginFallback")}：${item.name}。${t("noChineseDescription")}。`;
	}
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "managed-page",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("installedManagerTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "lede",
				children: t("installedManagerHint")
			})] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "toolbar",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "search",
						value: draft,
						placeholder: t("searchInstalled"),
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
						disabled: updates.length === 0 || busy !== null,
						onClick: () => void manage("update", updates.map((item) => item.name), "bundle"),
						children: [
							t("updateAll"),
							" (",
							updates.length,
							")"
						]
					})
				]
			}),
			data ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "lede",
				children: [
					t("profile"),
					": ",
					data.profile,
					" · ",
					data.total,
					" ",
					t("managedItems")
				]
			}) : null,
			notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "banner",
				children: notice
			}) : null,
			error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "error",
				children: [
					error,
					" ",
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void load(),
						children: t("retry")
					})
				]
			}) : null,
			busy && batch ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "banner",
				children: [
					t("batchProgress"),
					" ",
					batch.completed,
					"/",
					batch.total
				]
			}) : null,
			loading && !data && !error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "banner",
				role: "status",
				children: t("loadingInstalled")
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "list managed-list",
				children: [(data?.items ?? []).map((item) => {
					const job = jobByName.get(item.name);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "status-cell",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `dot${item.enabled ? "" : " off"}`,
								"aria-hidden": "true"
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: item.url ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: item.url,
								target: "_blank",
								rel: "noreferrer",
								children: item.name
							}) : item.name }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "desc",
								children: descriptionFor(item)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "facts",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "badge",
										children: t(item.kind === "skill" ? "skillKind" : "bundleKind")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `badge${item.enabled ? "" : " muted"}`,
										children: t(item.enabled ? "enabled" : "disabled")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("version"),
										": ",
										item.version ?? "—"
									] }),
									item.latest ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("latest"),
										": ",
										item.latest
									] }) : null,
									item.fullName && item.fullName !== item.name ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("project"),
										": ",
										item.fullName
									] }) : null,
									item.local ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "badge",
										children: t("localLink")
									}) : null,
									item.protected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "badge",
										children: t("protected")
									}) : null,
									item.updateAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "badge warn",
										children: t("updateAvailable")
									}) : null
								]
							})
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "actions row-actions",
							children: [
								job ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "job",
									children: [t(`phase_${job.phase}`), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: job.lastLine })]
								}) : null,
								item.kind === "bundle" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: item.protected || busy !== null,
									onClick: () => void toggle(item),
									children: item.enabled ? t("disable") : t("enable")
								}) : null,
								item.kind === "bundle" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: item.protected || item.local || busy !== null,
									onClick: () => void manage("update", [item.name], item.kind),
									children: t("update")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "danger",
									disabled: item.protected || busy !== null,
									onClick: () => void manage("uninstall", [item.name], item.kind),
									children: t("uninstall")
								})
							]
						})
					] }, `${item.kind}-${item.name}`);
				}), !loading && data?.items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "lede",
					children: t("emptyInstalled")
				}) : null]
			})
		]
	});
}

//#endregion
//#region src/client/pagination.ts
/** Keep paginated rows from two independently published catalog snapshots from being mixed. */
function shouldRestartPagination(append, currentGeneratedAt, incomingGeneratedAt) {
	return append && currentGeneratedAt !== null && currentGeneratedAt !== incomingGeneratedAt;
}

//#endregion
//#region src/client/RankingsPage.tsx
const VIEWS = [
	"hot",
	"rising",
	"total",
	"category"
];
const HIDE_SKILLS_KEY = "dsh-top100:hide-skills";
const DSHEVAL_SITE = "https://www.dsheval.ai";
const ERROR_LOCALE_KEYS = {
	"ignored-builds": "ignoredBuilds",
	network: "network",
	timeout: "timeout",
	permission: "permission",
	lockfile: "lockfile",
	profile: "profile",
	source: "source",
	generic: "generic"
};
async function readJson(url, init) {
	const response = await fetch(url, init);
	const body = await response.json();
	if (!response.ok) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
	return body;
}
function RankingsPage({ t }) {
	const [section, setSection] = (0, react.useState)("rankings");
	const [view, setView] = (0, react.useState)("hot");
	const [category, setCategory] = (0, react.useState)("ai");
	const [query, setQuery] = (0, react.useState)("");
	const [draft, setDraft] = (0, react.useState)("");
	const [hideSkills, setHideSkills] = (0, react.useState)(() => {
		try {
			return window.localStorage.getItem(HIDE_SKILLS_KEY) === "1";
		} catch {
			return false;
		}
	});
	const [data, setData] = (0, react.useState)(null);
	const [items, setItems] = (0, react.useState)([]);
	const [error, setError] = (0, react.useState)(null);
	const [errorAction, setErrorAction] = (0, react.useState)("load");
	const [loading, setLoading] = (0, react.useState)(true);
	const [busy, setBusy] = (0, react.useState)(null);
	const [confirming, setConfirming] = (0, react.useState)(null);
	const [batch, setBatch] = (0, react.useState)(null);
	const [notice, setNotice] = (0, react.useState)(null);
	const loadSequence = (0, react.useRef)(0);
	const loadedSnapshot = (0, react.useRef)(null);
	const load = (0, react.useCallback)(async (nextView, nextQuery, nextCategory, nextHideSkills, offset = 0, append = false) => {
		const requestId = ++loadSequence.current;
		const requestSnapshot = loadedSnapshot.current;
		setLoading(true);
		setErrorAction("load");
		setError(null);
		if (!append) {
			loadedSnapshot.current = null;
			setData(null);
			setItems([]);
		}
		try {
			const fetchPage = (pageOffset) => readJson(`/dsh-top100/rankings?${new URLSearchParams({
				view: nextView,
				category: nextCategory,
				skills: nextHideSkills ? "0" : "1",
				q: nextQuery,
				offset: String(pageOffset),
				limit: "40"
			})}`);
			let payload = await fetchPage(offset);
			if (requestId !== loadSequence.current) return;
			let shouldAppend = append;
			if (shouldRestartPagination(append, requestSnapshot, payload.generatedAt)) {
				payload = await fetchPage(0);
				if (requestId !== loadSequence.current) return;
				shouldAppend = false;
			}
			loadedSnapshot.current = payload.generatedAt;
			setData(payload);
			setItems((current) => shouldAppend ? [...current, ...payload.items] : payload.items);
		} catch (cause) {
			if (requestId !== loadSequence.current) return;
			setError(cause instanceof Error ? cause.message : String(cause));
			if (!append) setItems([]);
		} finally {
			if (requestId === loadSequence.current) setLoading(false);
		}
	}, []);
	(0, react.useEffect)(() => {
		if (section !== "rankings") return;
		load(view, query, category, hideSkills, 0, false);
	}, [
		category,
		hideSkills,
		load,
		query,
		section,
		view
	]);
	(0, react.useEffect)(() => {
		if (!busy) return void 0;
		const refresh = () => {
			readJson(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(busy)}`).then(async (snapshot) => {
				setBatch(snapshot);
				if (snapshot.completed === snapshot.total) {
					setBusy(null);
					setNotice(snapshot.requiresRestart ? t("restart") : t("batchComplete"));
					await load(view, query, category, hideSkills, 0, false);
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
		hideSkills,
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
		const progress = installProgress(job);
		const status = installStatus(job);
		const error$1 = job.phase === "failed" ? presentInstallError(job.error ?? job.lastLine) : null;
		const errorKey = error$1 ? ERROR_LOCALE_KEYS[error$1.kind] : null;
		const activeStage = progress >= 100 ? 3 : progress >= 70 ? 2 : progress >= 36 ? 1 : 0;
		const stages = [
			"installStageCheck",
			"installStageDownload",
			"installStageApply",
			"installStageReady"
		];
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: `job job-${job.phase}`,
			"aria-live": "polite",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "job-heading",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(`phase_${job.phase}`) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						t("installProgressEstimate"),
						" ",
						progress,
						"%"
					] })]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "job-progress",
					role: "progressbar",
					"aria-label": t("installProgressLabel"),
					"aria-valuemin": 0,
					"aria-valuemax": 100,
					"aria-valuenow": progress,
					"aria-valuetext": `${t("installProgressEstimate")} ${progress}%`,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { width: `${progress}%` } })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "job-stages",
					"aria-hidden": "true",
					children: stages.map((key, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: index < activeStage || job.phase === "installed" ? "is-complete" : index === activeStage ? "is-active" : void 0,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}), t(key)]
					}, key))
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: "job-status",
					children: [t(status.key), status.count === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [" · ", status.count] })]
				}),
				error$1 && errorKey ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "job-error-message",
					role: "alert",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(`installError_${errorKey}_title`) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(`installError_${errorKey}_summary`) }),
						error$1.packages.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "job-error-packages",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installErrorPackages") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: error$1.packages.join(", ") })]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "job-error-hint",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installErrorNext") }), t(`installError_${errorKey}_hint`)]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "job-error-details",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("installErrorDetails") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: error$1.detail })]
						})
					]
				}) : null,
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
				}) : job.phase === "installed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setSection("installed"),
					children: t("manage")
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								className: "data-source",
								href: DSHEVAL_SITE,
								target: "_blank",
								rel: "noreferrer",
								title: data.dataUrl,
								children: "DSHEval"
							})
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [data.total, " plugins"] })
					]
				}) : null
			] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
				className: "page-tabs",
				"aria-label": t("nav"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-selected": section === "rankings",
						onClick: () => setSection("rankings"),
						children: t("rankings")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-selected": section === "installed",
						onClick: () => setSection("installed"),
						children: t("installedPage")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-selected": section === "diagnostics",
						onClick: () => setSection("diagnostics"),
						children: t("diagnostics")
					})
				]
			}),
			section === "rankings" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "toolbar",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "search",
							value: draft,
							placeholder: t("searchPlaceholder"),
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
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "skill-filter",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: hideSkills,
								onChange: (event) => {
									const checked = event.target.checked;
									setHideSkills(checked);
									try {
										window.localStorage.setItem(HIDE_SKILLS_KEY, checked ? "1" : "0");
									} catch {}
								}
							}), t("hideSkills")]
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "tabs ranking-tabs",
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
							onClick: () => void load(view, query, category, hideSkills, 0, false),
							children: t("retry")
						}) : null
					]
				}) : null,
				busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "banner",
					children: batch ? `${t("batchProgress")} ${batch.completed}/${batch.total}` : t("installing")
				}) : null,
				loading && items.length === 0 && !error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "banner",
					role: "status",
					children: t("loadingRankings")
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "list",
					children: [items.map((item) => {
						const job = jobsByName.get(item.fullName);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "rank",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.rank })
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
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "star-fact",
										children: ["★ ", item.stars]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("weekly"),
										" ",
										item.weeklyStars
									] })]
								})
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "actions",
								children: [job ? jobPanel(job) : item.installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setSection("installed"),
									children: t("manage")
								}) : item.installable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "primary",
									disabled: busy !== null,
									onClick: () => setConfirming([item]),
									children: t("install")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: true,
									title: t("browseOnlyHint"),
									children: t("browseOnly")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
									className: "github-link",
									href: item.url || `https://github.com/${item.fullName}`,
									target: "_blank",
									rel: "noreferrer",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("github") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "external-arrow",
										"aria-hidden": "true",
										children: "↗"
									})]
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
					onClick: () => void load(view, query, category, hideSkills, items.length, true),
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
			] }) : section === "installed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ManagedPage, { t }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiagnosticsPage, { t })
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
.dsh-top100 .data-source {
  color: var(--t100-accent);
  font-weight: 650;
  text-decoration: none;
}
.dsh-top100 .data-source:hover { text-decoration: underline; }
.dsh-top100 .toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.dsh-top100 .page-tabs {
  display: flex;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--t100-line);
}
.dsh-top100 .page-tabs button {
  min-width: 82px;
  font-weight: 650;
}
.dsh-top100 .page-tabs button[aria-selected="true"] {
  color: var(--t100-accent);
  border-color: var(--t100-accent);
  background: var(--t100-accent-soft);
}
.dsh-top100 .ranking-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
.dsh-top100 .skill-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--t100-muted);
  font-size: 12px;
  white-space: nowrap;
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
  grid-template-columns: 32px minmax(0, 1fr) auto;
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
  gap: 7px 10px;
  margin-top: 6px;
  color: var(--t100-muted);
  font-size: 11px;
}
.dsh-top100 .facts > span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
}
.dsh-top100 .star-fact {
  color: var(--t100-ink);
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}
.dsh-top100 .github-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--t100-line);
  border-radius: 8px;
  color: var(--t100-ink);
  background: color-mix(in srgb, Canvas 72%, transparent);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  text-decoration: none;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease, transform 120ms ease;
}
.dsh-top100 .github-link:hover {
  border-color: var(--t100-accent);
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
  transform: translateY(-1px);
}
.dsh-top100 .github-link:focus-visible {
  outline: 2px solid var(--t100-accent);
  outline-offset: 2px;
}
.dsh-top100 .external-arrow {
  font-size: 13px;
  font-weight: 500;
  transform: translateY(-1px);
}
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
  border-color: color-mix(in srgb, #16803c 30%, var(--t100-line));
  background: color-mix(in srgb, Canvas 96%, #16803c 4%);
}
.dsh-top100 .job-installed .job-progress > span {
  background: #16803c;
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
@media (max-width: 720px) {
  .dsh-top100 .diag-grid { grid-template-columns: 1fr; }
  .dsh-top100 article { grid-template-columns: 34px minmax(0, 1fr); }
  .dsh-top100 .actions { grid-column: 2; flex-direction: row; flex-wrap: wrap; }
  .dsh-top100 .actions .job { flex: 1 1 100%; width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-top100 .job-progress > span { transition: none; }
  .dsh-top100 .job-progress > span::after { display: none; animation: none; }
}
`;

//#endregion
//#region src/client/locales.ts
const zh = {
	nav: "插件排行",
	title: "DSH-Top100",
	subtitle: "从线上榜单浏览和搜索 DSH 插件；仅对作者明确提供的安装源开放一键安装",
	rankings: "插件市场",
	installedPage: "已安装",
	diagnostics: "诊断",
	search: "搜索",
	searchPlaceholder: "搜索名称、简介或标签",
	hot: "Top 100",
	rising: "新锐",
	total: "总榜",
	category: "分类榜",
	categoryFilter: "插件分类",
	hideSkills: "隐藏 Skill",
	updated: "数据日期",
	source: "数据源",
	empty: "没有匹配的插件",
	loadingRankings: "正在加载榜单…",
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
	manage: "管理",
	searchInstalled: "搜索已安装插件或技能（Skill）",
	loadingInstalled: "正在读取已安装项目…",
	installedManagerTitle: "已安装插件管理",
	installedManagerHint: "查看当前配置中的插件与技能，并进行启停、更新或卸载。",
	profile: "当前配置（Profile）",
	managedItems: "个已安装项目",
	bundleKind: "插件（Bundle）",
	skillKind: "技能（Skill）",
	project: "项目",
	installedPluginFallback: "已安装的 DSH 插件",
	installedSkillFallback: "已安装的本地技能（Skill）",
	noChineseDescription: "暂无中文简介",
	update: "更新",
	updateAll: "全部更新",
	updateAvailable: "有可用更新",
	uninstall: "卸载",
	enable: "启用",
	disable: "停用",
	enabled: "已启用",
	disabled: "已停用",
	version: "版本",
	latest: "最新",
	localLink: "本地源码",
	protected: "受保护",
	emptyInstalled: "没有匹配的已安装项目",
	manageComplete: "操作完成。",
	confirmRemoveSkill: "确定卸载这个 Skill？",
	confirmRemovePlugin: "确定卸载这个插件？",
	browseOnly: "仅浏览",
	browseOnlyHint: "未找到作者明确提供且可验证的 dsh plugin add 安装源，请前往 GitHub 查看说明。",
	installing: "安装中",
	confirmTitle: "确认安装",
	confirmBody: "将写入当前 DSH profile 或 skills 目录，不执行 README 命令。安装源如声明生命周期构建脚本，确认后会仅为该包放行；这会在本机执行第三方代码。",
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
	installProgressLabel: "安装进度",
	installProgressEstimate: "模拟进度",
	installStageCheck: "检查",
	installStageDownload: "下载",
	installStageApply: "安装",
	installStageReady: "完成",
	installStatusQueued: "正在准备安装",
	installStatusValidating: "正在核对安装源和安全信息",
	installStatusDownloading: "正在下载插件文件",
	installStatusWaiting: "正在等待其他插件操作完成",
	installStatusWriting: "正在写入当前 DSH Profile",
	installStatusProfileCheck: "正在检查当前 DSH Profile",
	installStatusDependencies: "正在安装依赖",
	installStatusFinalCheck: "正在确认插件可以正常加载",
	installStatusInstalled: "插件已安装并通过检查",
	installStatusFailed: "安装没有完成",
	installStatusCancelled: "安装已取消",
	installErrorNext: "建议操作",
	installErrorDetails: "查看技术详情",
	installErrorPackages: "涉及依赖",
	installError_ignoredBuilds_title: "依赖构建被安全策略拦截",
	installError_ignoredBuilds_summary: "pnpm 阻止了部分依赖运行安装脚本，因此插件没有安装完成。",
	installError_ignoredBuilds_hint: "确认依赖来源可信后，在当前 Profile 目录运行 pnpm approve-builds，批准列出的依赖，再点击重试。",
	installError_network_title: "下载连接中断",
	installError_network_summary: "插件或依赖没有完整下载，当前 Profile 未完成这次安装。",
	installError_network_hint: "检查网络、代理或 DNS，连接恢复后点击重试。",
	installError_timeout_title: "下载等待时间过长",
	installError_timeout_summary: "安装在限定时间内没有完成，操作已停止。",
	installError_timeout_hint: "确认网络稳定后重试；大型依赖可能需要更长时间。",
	installError_permission_title: "当前 Profile 无法写入",
	installError_permission_summary: "DSH 没有足够权限修改插件目录或相关文件。",
	installError_permission_hint: "检查 Profile 目录的所有者和写入权限后重试。",
	installError_lockfile_title: "依赖记录不一致",
	installError_lockfile_summary: "当前 Profile 的依赖记录与已安装文件不匹配。",
	installError_lockfile_hint: "先在 DSH 插件诊断中修复 Profile 依赖，再重试安装。",
	installError_profile_title: "安装后的配置无法加载",
	installError_profile_summary: "插件文件已处理，但 DSH 配置检查没有通过。系统会尽量保留或恢复原配置。",
	installError_profile_hint: "打开诊断页查看 Profile 问题；修复冲突后再重试。",
	installError_source_title: "安装源未通过验证",
	installError_source_summary: "榜单没有找到可验证的插件安装源，因此没有修改当前 Profile。",
	installError_source_hint: "前往项目 GitHub 核对作者提供的安装方式，或等待榜单数据更新。",
	installError_generic_title: "安装没有完成",
	installError_generic_summary: "DSH 没能完成这次插件安装。",
	installError_generic_hint: "展开技术详情确认具体原因，处理后再点击重试。",
	skillHint: "这是 Skill，不能通过 dsh plugin 一键装进 Web profile。",
	cardTitle: "榜单数据源",
	cardHint: "Host 端从该地址读取 rankings.json。",
	diagLoading: "正在扫描当前 DSH Profile…",
	diagLoadFail: "诊断加载失败",
	diagOk: "未发现严重问题",
	diagIssues: "发现需要处理的问题",
	diagErrors: "错误",
	diagWarnings: "警告",
	diagConflicts: "加载冲突",
	diagDeps: "依赖问题",
	diagRefresh: "重新扫描",
	diagCatalogTitle: "榜单数据源",
	diagInventory: "安装概览",
	diagOfficial: "官方 Bundle",
	diagCommunity: "社区 Bundle",
	diagBundles: "Bundle 详情",
	diagSkills: "本地 Skills",
	diagPatch: "用户补丁层",
	diagOrphans: "孤立停用项"
};
const en = {
	nav: "Rankings",
	title: "DSH-Top100",
	subtitle: "Browse and search hosted DSH rankings; one-click install is limited to author-provided sources",
	rankings: "Marketplace",
	installedPage: "Installed",
	diagnostics: "Diagnostics",
	search: "Search",
	searchPlaceholder: "Search name, summary, or tags",
	hot: "Top 100",
	rising: "Rising",
	total: "All",
	category: "Categories",
	categoryFilter: "Plugin category",
	hideSkills: "Hide Skills",
	updated: "Snapshot",
	source: "Source",
	empty: "No matching plugins",
	loadingRankings: "Loading rankings…",
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
	manage: "Manage",
	searchInstalled: "Search installed plugins or Skills",
	loadingInstalled: "Loading installed items…",
	installedManagerTitle: "Installed plugin management",
	installedManagerHint: "Review plugins and Skills in this profile, then enable, disable, update, or uninstall them.",
	profile: "Profile",
	managedItems: "items",
	bundleKind: "Plugin (Bundle)",
	skillKind: "Skill",
	project: "Project",
	installedPluginFallback: "Installed DSH plugin",
	installedSkillFallback: "Installed local Skill",
	noChineseDescription: "No Chinese summary available",
	update: "Update",
	updateAll: "Update all",
	updateAvailable: "Update available",
	uninstall: "Uninstall",
	enable: "Enable",
	disable: "Disable",
	enabled: "Enabled",
	disabled: "Disabled",
	version: "Version",
	latest: "Latest",
	localLink: "Local source",
	protected: "Protected",
	emptyInstalled: "No matching installed items",
	manageComplete: "Operation complete.",
	confirmRemoveSkill: "Uninstall this Skill?",
	confirmRemovePlugin: "Uninstall this plugin?",
	browseOnly: "Browse only",
	browseOnlyHint: "No author-provided, verifiable dsh plugin add target was found. Open GitHub for installation details.",
	installing: "Installing",
	confirmTitle: "Confirm install",
	confirmBody: "This writes to the current DSH profile or skills directory without running README commands. If the source declares lifecycle build scripts, confirming allows them only for that exact package, which executes third-party code locally.",
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
	installProgressLabel: "Installation progress",
	installProgressEstimate: "Estimated",
	installStageCheck: "Check",
	installStageDownload: "Download",
	installStageApply: "Install",
	installStageReady: "Ready",
	installStatusQueued: "Preparing the installation",
	installStatusValidating: "Checking the source and safety information",
	installStatusDownloading: "Downloading plugin files",
	installStatusWaiting: "Waiting for another plugin operation",
	installStatusWriting: "Writing to the current DSH profile",
	installStatusProfileCheck: "Checking the current DSH profile",
	installStatusDependencies: "Installing dependencies",
	installStatusFinalCheck: "Confirming the plugin can load",
	installStatusInstalled: "Plugin installed and verified",
	installStatusFailed: "Installation did not finish",
	installStatusCancelled: "Installation cancelled",
	installErrorNext: "What to do",
	installErrorDetails: "View technical details",
	installErrorPackages: "Affected dependencies",
	installError_ignoredBuilds_title: "Dependency build blocked by safety policy",
	installError_ignoredBuilds_summary: "pnpm prevented some dependencies from running install scripts, so installation could not finish.",
	installError_ignoredBuilds_hint: "After confirming the dependencies are trusted, run pnpm approve-builds in the current profile directory, approve the listed packages, and retry.",
	installError_network_title: "Download connection interrupted",
	installError_network_summary: "The plugin or its dependencies were not fully downloaded, so the profile was not updated.",
	installError_network_hint: "Check the network, proxy, or DNS, then retry when the connection is stable.",
	installError_timeout_title: "Download took too long",
	installError_timeout_summary: "The installation did not finish within the allowed time and was stopped.",
	installError_timeout_hint: "Retry on a stable connection; large dependencies may need more time.",
	installError_permission_title: "Profile is not writable",
	installError_permission_summary: "DSH does not have permission to change the plugin directory or related files.",
	installError_permission_hint: "Check the profile directory owner and write permissions, then retry.",
	installError_lockfile_title: "Dependency records do not match",
	installError_lockfile_summary: "The profile lockfile does not match the files currently installed.",
	installError_lockfile_hint: "Repair the profile dependencies from Diagnostics before retrying.",
	installError_profile_title: "The updated profile could not load",
	installError_profile_summary: "Plugin files were processed, but the DSH configuration check failed. The original profile is preserved or restored when possible.",
	installError_profile_hint: "Open Diagnostics, resolve the profile conflict, and retry.",
	installError_source_title: "Install source could not be verified",
	installError_source_summary: "The catalog does not contain a verifiable install source, so the profile was not changed.",
	installError_source_hint: "Check the author's instructions on GitHub or wait for the catalog to refresh.",
	installError_generic_title: "Installation did not finish",
	installError_generic_summary: "DSH could not complete this plugin installation.",
	installError_generic_hint: "Expand the technical details, resolve the reported issue, and retry.",
	skillHint: "This is a Skill and cannot be installed into the Web profile with dsh plugin.",
	cardTitle: "Rankings source",
	cardHint: "The host reads rankings.json from this URL.",
	diagLoading: "Scanning the current DSH profile…",
	diagLoadFail: "Could not load diagnostics",
	diagOk: "No critical issues",
	diagIssues: "Issues need attention",
	diagErrors: "Errors",
	diagWarnings: "Warnings",
	diagConflicts: "Load conflicts",
	diagDeps: "Dependency issues",
	diagRefresh: "Scan again",
	diagCatalogTitle: "Catalog source",
	diagInventory: "Inventory",
	diagOfficial: "Official bundles",
	diagCommunity: "Community bundles",
	diagBundles: "Bundle details",
	diagSkills: "Local Skills",
	diagPatch: "User patch layer",
	diagOrphans: "Orphan disables"
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