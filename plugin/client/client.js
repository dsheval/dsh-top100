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
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `badge activation-${item.activationState}`,
										children: t(`activation_${item.activationState}`)
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
//#region src/client/trust-presentation.ts
const SIGNAL_KEYS = {
	indexed: "evidenceSignalIndexed",
	"dsh-skill": "evidenceSignalDshSkill",
	"agent-skill": "evidenceSignalAgentSkill",
	"theme-bundle": "evidenceSignalThemeBundle",
	"dsh-bundle": "evidenceSignalDshBundle",
	"install-source": "evidenceSignalInstallSource"
};
function presentCatalogEvidence(evidence, installKind, t) {
	return {
		signals: evidence.signalCodes.map((code) => {
			const label = t(SIGNAL_KEYS[code]);
			return code === "install-source" && installKind ? `${label} (${installKind})` : label;
		}),
		caveat: evidence.caveatCode === "not-security-review" ? t("evidenceCaveatNotSecurityReview") : evidence.caveat
	};
}
function presentInstallRisk(risk, t) {
	return {
		summary: t(`risk_${risk.code}_summary`),
		detail: risk.code === "lifecycle-scripts" ? risk.detail : t(`risk_${risk.code}_detail`)
	};
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
const SHOW_CANDIDATES_KEY = "dsh-top100:show-candidates";
const DSHEVAL_SITE = "https://www.dsheval.ai";
function RankTrustMark() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 48 48",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
			className: "rank-mark-list",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "11",
					cy: "14",
					r: "2"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M17 14h17" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "11",
					cy: "23",
					r: "2"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M17 23h12" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "11",
					cy: "32",
					r: "2"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M17 32h7" })
			]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			className: "rank-mark-check",
			d: "m28.5 30.5 3.5 3.5 7-9"
		})]
	});
}
function rankingBasisKey(view, query) {
	return query ? "basis_search" : `basis_${view}`;
}
function rankingBasisShortKey(view, query) {
	return query ? "basisShort_search" : `basisShort_${view}`;
}
function dateLabel(value) {
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : "-";
}
function FilterGlyph() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		viewBox: "0 0 16 16",
		"aria-hidden": "true",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.5 4h11M4.5 8h7M6.5 12h3" })
	});
}
const SKELETON_CARDS = Array.from({ length: 6 }, (_, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
	className: "card-skeleton",
	"aria-hidden": "true",
	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skeleton-rank" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skeleton-line skeleton-title" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skeleton-line" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skeleton-line skeleton-short" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skeleton-pills" })
	] })]
}, index));
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
function cacheAgeLabel(ageMs, t) {
	if (ageMs === null) return t("cacheAgeUnknown");
	const minutes = Math.max(0, Math.round(ageMs / 6e4));
	if (minutes < 60) return `${minutes} ${t("minutesAgo")}`;
	return `${Math.round(minutes / 60)} ${t("hoursAgo")}`;
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
	const [showCandidates, setShowCandidates] = (0, react.useState)(() => {
		try {
			return window.localStorage.getItem(SHOW_CANDIDATES_KEY) === "1";
		} catch {
			return false;
		}
	});
	const [filtersOpen, setFiltersOpen] = (0, react.useState)(false);
	const [selectedItem, setSelectedItem] = (0, react.useState)(null);
	const [data, setData] = (0, react.useState)(null);
	const [items, setItems] = (0, react.useState)([]);
	const [error, setError] = (0, react.useState)(null);
	const [errorAction, setErrorAction] = (0, react.useState)("load");
	const [loading, setLoading] = (0, react.useState)(true);
	const [busy, setBusy] = (0, react.useState)(null);
	const [preparing, setPreparing] = (0, react.useState)(null);
	const [confirming, setConfirming] = (0, react.useState)(null);
	const [preflights, setPreflights] = (0, react.useState)([]);
	const [riskAccepted, setRiskAccepted] = (0, react.useState)(false);
	const [batch, setBatch] = (0, react.useState)(null);
	const [notice, setNotice] = (0, react.useState)(null);
	const loadSequence = (0, react.useRef)(0);
	const loadedSnapshot = (0, react.useRef)(null);
	const filterRef = (0, react.useRef)(null);
	const load = (0, react.useCallback)(async (nextView, nextQuery, nextCategory, nextHideSkills, nextShowCandidates, offset = 0, append = false) => {
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
				scope: nextShowCandidates ? "all" : "compatible",
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
		load(view, query, category, hideSkills, showCandidates, 0, false);
	}, [
		category,
		hideSkills,
		load,
		query,
		section,
		showCandidates,
		view
	]);
	(0, react.useEffect)(() => {
		if (!filtersOpen) return void 0;
		const closeOnOutsideClick = (event) => {
			if (filterRef.current && !filterRef.current.contains(event.target)) setFiltersOpen(false);
		};
		document.addEventListener("pointerdown", closeOnOutsideClick);
		return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
	}, [filtersOpen]);
	(0, react.useEffect)(() => {
		if (!filtersOpen && !selectedItem) return void 0;
		const closeOnEscape = (event) => {
			if (event.key !== "Escape") return;
			setFiltersOpen(false);
			setSelectedItem(null);
		};
		document.addEventListener("keydown", closeOnEscape);
		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [filtersOpen, selectedItem]);
	(0, react.useEffect)(() => {
		if (!busy) return void 0;
		const refresh = () => {
			readJson(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(busy)}`).then(async (snapshot) => {
				setBatch(snapshot);
				if (snapshot.completed === snapshot.total) {
					setBusy(null);
					setNotice(snapshot.requiresRestart ? t("restart") : t("batchComplete"));
					await load(view, query, category, hideSkills, showCandidates, 0, false);
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
		showCandidates,
		t,
		view
	]);
	const remaining = (0, react.useMemo)(() => {
		if (!data) return 0;
		return Math.max(0, data.total - items.length);
	}, [data, items.length]);
	const jobsByName = (0, react.useMemo)(() => new Map((batch?.jobs ?? []).map((job) => [job.fullName, job])), [batch]);
	const preflightsByName = (0, react.useMemo)(() => new Map(preflights.map((preflight) => [preflight.fullName, preflight])), [preflights]);
	const activeCategory = data?.categories.find((definition) => definition.id === category);
	const activeFilterCount = Number(hideSkills) + Number(showCandidates);
	const excludedSkillCount = data?.excludedSkillCount ?? 0;
	const selectedEvidence = selectedItem ? presentCatalogEvidence(selectedItem.evidence, selectedItem.installSpec?.kind ?? null, t) : null;
	function resetCatalogFilters() {
		setHideSkills(false);
		setShowCandidates(false);
		try {
			window.localStorage.removeItem(HIDE_SKILLS_KEY);
			window.localStorage.removeItem(SHOW_CANDIDATES_KEY);
		} catch {}
	}
	async function prepareInstall(item) {
		setPreparing(item.fullName);
		setError(null);
		setNotice(null);
		try {
			const preflight = await readJson("/dsh-top100/install-preflight", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ fullName: item.fullName })
			});
			setPreflights([preflight]);
			setRiskAccepted(!preflight.requiresExplicitApproval);
			setConfirming([item]);
		} catch (cause) {
			setErrorAction("install");
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setPreparing(null);
		}
	}
	async function install(selectedItems) {
		setConfirming(null);
		setNotice(null);
		setError(null);
		try {
			const result = await readJson("/dsh-top100/install-batch", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ approvals: selectedItems.map((item) => {
					const preflight = preflightsByName.get(item.fullName);
					return {
						fullName: item.fullName,
						approvalToken: preflight?.approvalToken ?? "",
						risksAccepted: preflight?.requiresExplicitApproval ? riskAccepted : true
					};
				}) })
			});
			setBatch(result);
			setBusy(result.batchId);
		} catch (cause) {
			setErrorAction("install");
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setPreflights([]);
			setRiskAccepted(false);
		}
	}
	async function cancelJob(jobId) {
		await readJson("/dsh-top100/cancel", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jobId })
		});
	}
	async function retryJob(job) {
		if (!job.action || job.action === "install") {
			const item = items.find((candidate) => candidate.fullName === job.fullName);
			if (item) await prepareInstall(item);
			else {
				setErrorAction("install");
				setError(t("retryReloadRequired"));
			}
			return;
		}
		try {
			const result = await readJson("/dsh-top100/retry", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ jobId: job.id })
			});
			setBatch(result);
			setBusy(result.batchId);
		} catch (cause) {
			setErrorAction("install");
			setError(cause instanceof Error ? cause.message : String(cause));
		}
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
			className: `job job-${job.phase} activation-${job.activationState}`,
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
				job.phase === "installed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: `activation activation-${job.activationState}`,
					children: t(`activation_${job.activationState}`)
				}) : null,
				job.provenance ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: "job-provenance",
					children: [
						t("resolvedSource"),
						" ",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: job.provenance.resolvedTarget })
					]
				}) : null,
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
					onClick: () => void retryJob(job),
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
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				className: "market-head",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "rank-mark",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RankTrustMark, {})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "head-copy",
					children: [
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
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									data.total,
									" ",
									t("entries")
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									title: data.cache.fetchedAt ? new Date(data.cache.fetchedAt).toLocaleString() : void 0,
									children: [
										data.cache.stale ? t("cachedStale") : t("cachedFresh"),
										" · ",
										cacheAgeLabel(data.cache.ageMs, t)
									]
								}),
								data.cache.reason ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "cache-warning",
									children: [
										t("cacheFallback"),
										": ",
										data.cache.reason
									]
								}) : null
							]
						}) : null
					]
				})]
			}),
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
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "search-cluster",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "search",
							value: draft,
							placeholder: t("searchPlaceholder"),
							onChange: (event) => setDraft(event.target.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") setQuery(draft.trim());
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "primary",
							onClick: () => setQuery(draft.trim()),
							children: t("search")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "filter-control",
						ref: filterRef,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "filter-trigger",
							"aria-expanded": filtersOpen,
							"aria-controls": "dsh-top100-filters",
							onClick: () => setFiltersOpen((open) => !open),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FilterGlyph, {}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("filter") }),
								activeFilterCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "filter-count",
									children: activeFilterCount
								}) : null
							]
						}), filtersOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "filter-popover",
							id: "dsh-top100-filters",
							role: "group",
							"aria-label": t("filter"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("filterHint") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("hideSkills") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("hideSkillsHint") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: hideSkills,
									onChange: (event) => {
										const checked = event.target.checked;
										setHideSkills(checked);
										try {
											window.localStorage.setItem(HIDE_SKILLS_KEY, checked ? "1" : "0");
										} catch {}
									}
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("showCandidates") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("showCandidatesHint") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: showCandidates,
									onChange: (event) => {
										const checked = event.target.checked;
										setShowCandidates(checked);
										try {
											window.localStorage.setItem(SHOW_CANDIDATES_KEY, checked ? "1" : "0");
										} catch {}
									}
								})] }),
								activeFilterCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "filter-reset",
									onClick: resetCatalogFilters,
									children: t("clearFilters")
								}) : null
							]
						}) : null]
					})]
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
				data ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "ranking-context",
					"aria-live": "polite",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "result-count",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: items.length }),
								" / ",
								data.total,
								" ",
								t("entries")
							]
						}),
						hideSkills && excludedSkillCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "filter-summary",
							children: [
								t("hiddenSkillsPrefix"),
								" ",
								excludedSkillCount,
								" ",
								t("skillRepositories")
							]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "ranking-basis",
							title: t(rankingBasisKey(view, query)),
							"aria-label": `${t(rankingBasisShortKey(view, query))}: ${t(rankingBasisKey(view, query))}`,
							children: t(rankingBasisShortKey(view, query))
						})
					]
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
							onClick: () => void load(view, query, category, hideSkills, showCandidates, 0, false),
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
					"aria-busy": loading,
					"aria-label": loading && items.length === 0 ? t("loadingRankings") : void 0,
					children: [loading && items.length === 0 && !error ? SKELETON_CARDS : items.map((item) => {
						const job = jobsByName.get(item.fullName);
						const rankingMetric = !query && view === "hot" ? {
							label: t("hotScore"),
							value: item.hotScore.toFixed(1)
						} : !query && view === "rising" ? {
							label: t("daily"),
							value: `+${item.dailyStars}`
						} : null;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							"data-rank": item.rank,
							"data-trust": item.evidence.trustLevel,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "rank",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-label": `${t("rank")} ${item.rank}`,
										children: item.rank
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "card-copy",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
											href: item.url || `https://github.com/${item.fullName}`,
											target: "_blank",
											rel: "noreferrer",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.fullName }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "title-arrow",
												"aria-hidden": "true",
												children: "↗"
											})]
										}) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "desc",
											children: item.descriptionZh || item.description
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "facts",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "star-fact",
													children: ["★ ", item.stars]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													t("weekly"),
													" ",
													item.weeklyStars
												] }),
												rankingMetric ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "ranking-metric",
													title: t(rankingBasisKey(view, query)),
													children: [
														rankingMetric.label,
														" ",
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: rankingMetric.value })
													]
												}) : null,
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: `evidence-badge evidence-${item.evidence.trustLevel}`,
													children: t(`trust_${item.evidence.trustLevel}`)
												})
											]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "actions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "detail-button",
										onClick: () => setSelectedItem(item),
										children: t("viewDetails")
									}), job ? jobPanel(job) : item.installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setSection("installed"),
										children: t("manage")
									}) : item.installable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "primary",
										disabled: busy !== null || preparing !== null,
										onClick: () => void prepareInstall(item),
										children: preparing === item.fullName ? t("preflighting") : t("install")
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
										className: "project-link",
										href: item.url || `https://github.com/${item.fullName}`,
										target: "_blank",
										rel: "noreferrer",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("viewProject") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"aria-hidden": "true",
											children: "↗"
										})]
									})]
								})
							]
						}, `${item.fullName}-${item.rank}`);
					}), !loading && items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "lede",
						children: t("empty")
					}) : null]
				}),
				remaining > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					disabled: loading,
					onClick: () => void load(view, query, category, hideSkills, showCandidates, items.length, true),
					children: [
						t("more"),
						" (",
						remaining,
						")"
					]
				}) : null,
				selectedItem && selectedEvidence ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "detail-mask",
					onMouseDown: (event) => {
						if (event.target === event.currentTarget) setSelectedItem(null);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
						className: "detail-drawer",
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": "dsh-top100-detail-title",
						onKeyDownCapture: (event) => {
							if (event.key !== "Escape") return;
							event.stopPropagation();
							event.nativeEvent.stopImmediatePropagation();
							setSelectedItem(null);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "detail-head",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "detail-rank",
										"aria-label": `${t("rank")} ${selectedItem.rank}`,
										children: selectedItem.rank
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										id: "dsh-top100-detail-title",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
											href: selectedItem.url || `https://github.com/${selectedItem.fullName}`,
											target: "_blank",
											rel: "noreferrer",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: selectedItem.fullName }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "title-arrow",
												"aria-hidden": "true",
												children: "↗"
											})]
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(`form_${selectedItem.evidence.formFactor}`) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "detail-close",
										autoFocus: true,
										"aria-label": t("closeDetails"),
										onClick: () => setSelectedItem(null),
										children: "×"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "detail-description",
								children: selectedItem.descriptionZh || selectedItem.description
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
								className: "detail-metrics",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("rank") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: ["#", selectedItem.rank] })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("stars") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selectedItem.stars })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("weekly") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: ["+", selectedItem.weeklyStars] })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("daily") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: ["+", selectedItem.dailyStars] })] })
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "detail-section",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("rankingDetails") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(rankingBasisKey(view, query)) }),
									!query && view === "hot" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "detail-highlight",
										children: [
											t("hotScore"),
											" ",
											selectedItem.hotScore.toFixed(1)
										]
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "detail-section",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("projectDetails") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
									className: "detail-properties",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("projectType") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t(`form_${selectedItem.evidence.formFactor}`) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("license") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selectedItem.license || t("notAvailable") })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("lastMaintained") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: dateLabel(selectedItem.pushedAt) })] })
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "detail-section",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("trustDetails") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `evidence-badge evidence-${selectedItem.evidence.trustLevel}`,
										children: t(`trust_${selectedItem.evidence.trustLevel}`)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: selectedEvidence.signals.map((signal) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: signal }, signal)) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "detail-caveat",
										children: selectedEvidence.caveat
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "detail-section",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("installDetails") }), selectedItem.installable && selectedItem.installSpec ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "detail-source",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("catalogInstallSource") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: selectedItem.installSpec.spec })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("preflightNote") })] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "browse-note",
									children: t("browseOnlyHint")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "detail-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
									className: "project-link",
									href: selectedItem.url || `https://github.com/${selectedItem.fullName}`,
									target: "_blank",
									rel: "noreferrer",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("viewProject") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										children: "↗"
									})]
								}), selectedItem.installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										setSelectedItem(null);
										setSection("installed");
									},
									children: t("manage")
								}) : selectedItem.installable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "primary",
									disabled: busy !== null || preparing !== null,
									onClick: () => {
										const item = selectedItem;
										setSelectedItem(null);
										prepareInstall(item);
									},
									children: t("install")
								}) : null]
							})
						]
					})
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
								children: confirming.map((item) => {
									const preflight = preflightsByName.get(item.fullName);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.fullName }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
											t("requestedSource"),
											": ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight?.provenance.requestedTarget ?? item.installSpec?.spec ?? item.type })
										] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
											t("resolvedSource"),
											": ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight?.provenance.resolvedTarget ?? "-" })
										] }),
										preflight?.provenance.integrity ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
											t("integrity"),
											": ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight.provenance.integrity })
										] }) : null,
										preflight?.lifecycleScripts.map((script) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "script-evidence",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: script.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: script.command })]
										}, script.name)),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
											className: "risk-list",
											children: preflight?.risks.map((risk) => {
												const presented = presentInstallRisk(risk, t);
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
													"data-severity": risk.severity,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: presented.summary }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: presented.detail })]
												}, risk.code);
											})
										})
									] }, item.fullName);
								})
							}),
							confirming.some((item) => item.install?.needsConfig) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "lede",
								children: t("confirmNeedConfig")
							}) : null,
							preflights.some((value) => value.requiresExplicitApproval) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "risk-approval",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: riskAccepted,
									onChange: (event) => setRiskAccepted(event.target.checked)
								}), t("riskApproval")]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "toolbar",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "primary",
									disabled: !riskAccepted,
									onClick: () => void install(confirming),
									children: t("confirm")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										setConfirming(null);
										setPreflights([]);
										setRiskAccepted(false);
									},
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
	filter: "筛选",
	filterHint: "调整榜单的收录范围。",
	hot: "Top 100",
	rising: "新锐",
	total: "总榜",
	category: "分类榜",
	categoryFilter: "插件分类",
	hideSkills: "隐藏 Skill",
	hideSkillsHint: "只看 Bundle 和其他生态项目",
	hiddenSkillsPrefix: "已隐藏",
	skillRepositories: "个 Skill 仓库",
	showCandidates: "探索候选与生态项目",
	showCandidatesHint: "同时显示当前不能直接安装的候选项目",
	clearFilters: "清除筛选",
	entries: "项",
	cachedFresh: "本地快照可用",
	cachedStale: "正在显示较旧快照",
	cacheAgeUnknown: "缓存时间未知",
	minutesAgo: "分钟前获取",
	hoursAgo: "小时前获取",
	cacheFallback: "使用快照原因",
	updated: "数据日期",
	source: "数据源",
	empty: "没有匹配的插件",
	loadingRankings: "正在加载榜单…",
	loadError: "无法读取线上榜单",
	installError: "插件安装失败",
	retry: "重试",
	rank: "排名",
	retryReloadRequired: "榜单已变化，请刷新当前结果后重新执行安装预检。",
	install: "安装",
	preflighting: "正在核对来源",
	batchInstall: "安装已选择",
	batchProgress: "批量安装进度",
	batchComplete: "文件操作已完成；请按各项运行状态继续验证。",
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
	enabled: "配置已启用",
	disabled: "配置已停用",
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
	viewDetails: "查看详情",
	viewProject: "查看项目",
	closeDetails: "关闭详情",
	rankingDetails: "排名依据",
	projectDetails: "项目信息",
	trustDetails: "信任证据",
	installDetails: "安装说明",
	projectType: "项目形态",
	license: "许可证",
	lastMaintained: "最近维护",
	notAvailable: "暂无",
	catalogInstallSource: "目录安装源",
	preflightNote: "点击安装后会重新解析不可变版本或 commit，并展示内容完整性、生命周期脚本与风险。",
	installing: "安装中",
	confirmTitle: "确认安装",
	confirmBody: "以下来源已经解析到不可变版本或 commit。请核对脚本与风险后，再允许修改当前 Profile 或 Skills 目录。",
	confirmSpec: "安装源",
	requestedSource: "目录声明",
	resolvedSource: "实际安装",
	integrity: "内容完整性",
	riskApproval: "我已核对上面的精确来源、脚本和风险，并允许执行这次安装。",
	confirmNeedConfig: "这个插件可能还需要额外配置。",
	confirm: "确认安装",
	cancel: "取消",
	github: "GitHub",
	more: "加载更多",
	stars: "Stars",
	weekly: "近7日",
	daily: "今日",
	hotScore: "热度分",
	basis_hot: "排序依据：日增、周增、增长率、活跃度、质量与总热度",
	basis_rising: "排序依据：今日新增 Stars",
	basis_total: "排序依据：GitHub Stars 总数",
	basis_category: "分类内保持总榜顺序",
	basis_search: "搜索结果按名称与内容相关性排序",
	basisShort_hot: "综合热度榜",
	basisShort_rising: "今日增长榜",
	basisShort_total: "Stars 总榜",
	basisShort_category: "分类总榜",
	basisShort_search: "相关性排序",
	restart: "文件已写入且配置可组合；请重启 DSH，再验证插件是否实际运行。",
	phase_queued: "排队中",
	phase_validating: "验证中",
	phase_downloading: "下载中",
	"phase_waiting-profile-lock": "等待写入 profile",
	phase_installing: "安装中",
	phase_installed: "写入完成",
	phase_failed: "安装失败",
	phase_cancelled: "已取消",
	installProgressLabel: "安装进度",
	installProgressEstimate: "模拟进度",
	installStageCheck: "检查",
	installStageDownload: "下载",
	installStageApply: "安装",
	installStageReady: "完成",
	installStatusQueued: "正在准备安装",
	installStatusValidating: "正在核对安装源和风险证据",
	installStatusDownloading: "正在下载插件文件",
	installStatusWaiting: "正在等待其他插件操作完成",
	installStatusWriting: "正在写入当前 DSH Profile",
	installStatusProfileCheck: "正在检查当前 DSH Profile",
	installStatusDependencies: "正在安装依赖",
	installStatusFinalCheck: "正在确认 Profile 配置可组合",
	installStatusInstalled: "文件已写入，配置检查已结束",
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
	evidence: "查看信任证据",
	evidenceSignalIndexed: "已进入 DSHEval 索引",
	evidenceSignalDshSkill: "声明为 DSH Skill",
	evidenceSignalAgentSkill: "声明为通用 Agent Skill",
	evidenceSignalThemeBundle: "命中 DSH/Cordis 主题 Bundle 结构",
	evidenceSignalDshBundle: "命中 DSH Bundle 结构",
	evidenceSignalInstallSource: "安装源可解析",
	evidenceCaveatNotSecurityReview: "这些证据不代表代码已通过安全审核；安装前仍需核对精确来源、脚本与权限。",
	"risk_lifecycle-scripts_summary": "安装会执行包生命周期脚本",
	"risk_lifecycle-scripts_detail": "安装器会运行上方列出的包脚本。",
	"risk_repository-identity_summary": "npm 包未能与目录仓库自动绑定",
	"risk_repository-identity_detail": "包未声明可识别的 GitHub repository；精确版本已锁定，但发布者身份仍需人工判断。",
	"risk_skill-content_summary": "Skill 是会影响模型行为的主动内容",
	"risk_skill-content_detail": "将复制该 commit 中的 SKILL.md、脚本、模板和资源；安装器拒绝符号链接，但不把结构验证表述为安全审核。",
	"risk_restart-required_summary": "写入成功后仍需重启并验证运行状态",
	"risk_restart-required_detail": "安装后的配置检查只证明 Profile 可以组合，不代表插件已经在当前 DSH 进程中运行。",
	trust_indexed: "仅收录",
	trust_structured: "结构已识别",
	"trust_install-source": "安装源可解析",
	"form_dsh-bundle": "DSH Bundle",
	"form_dsh-skill": "DSH Skill",
	"form_agent-skill": "Agent Skill",
	form_theme: "主题",
	"form_mcp-integration": "MCP 集成",
	"form_desktop-app": "桌面应用",
	"form_ecosystem-project": "生态项目",
	form_candidate: "候选项目",
	activation_pending: "运行状态：等待安装",
	"activation_not-applicable": "运行状态：不适用于 Bundle loader；后续会话需验证 Skill 可见性",
	"activation_configuration-valid": "运行状态：配置可组合，当前进程尚未验证",
	"activation_restart-required": "运行状态：需要重启后验证",
	activation_live: "运行状态：正在运行",
	activation_inert: "运行状态：已写入但未激活",
	activation_broken: "运行状态：安装或配置验证失败",
	activation_unknown: "运行状态：尚未取得运行时证据",
	skillHint: "这是 Skill，不能通过 dsh plugin 一键装进 Web profile。",
	cardTitle: "榜单数据源",
	cardHint: "Host 端从该地址读取 manifest 与不可变榜单快照；旧数据源会自动回退兼容文件。",
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
	filter: "Filters",
	filterHint: "Adjust which catalog entries are included.",
	hot: "Top 100",
	rising: "Rising",
	total: "All",
	category: "Categories",
	categoryFilter: "Plugin category",
	hideSkills: "Hide Skills",
	hideSkillsHint: "Show Bundles and other ecosystem projects only",
	hiddenSkillsPrefix: "Hidden",
	skillRepositories: "Skill repositories",
	showCandidates: "Explore candidates and ecosystem projects",
	showCandidatesHint: "Also show candidates that cannot currently be installed directly",
	clearFilters: "Clear filters",
	entries: "entries",
	cachedFresh: "Local snapshot available",
	cachedStale: "Showing an older snapshot",
	cacheAgeUnknown: "cache age unknown",
	minutesAgo: "minutes ago",
	hoursAgo: "hours ago",
	cacheFallback: "Snapshot fallback",
	updated: "Snapshot",
	source: "Source",
	empty: "No matching plugins",
	loadingRankings: "Loading rankings…",
	loadError: "Could not load the hosted rankings",
	installError: "Plugin installation failed",
	retry: "Retry",
	rank: "Rank",
	retryReloadRequired: "The catalog has changed. Refresh these results before running a new install preflight.",
	install: "Install",
	preflighting: "Checking source",
	batchInstall: "Install selected",
	batchProgress: "Batch progress",
	batchComplete: "File operations finished; continue with the runtime verification shown for each item.",
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
	enabled: "Enabled in config",
	disabled: "Disabled in config",
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
	viewDetails: "View details",
	viewProject: "View project",
	closeDetails: "Close details",
	rankingDetails: "Ranking basis",
	projectDetails: "Project details",
	trustDetails: "Trust evidence",
	installDetails: "Installation",
	projectType: "Project type",
	license: "License",
	lastMaintained: "Last maintained",
	notAvailable: "Not available",
	catalogInstallSource: "Catalog install source",
	preflightNote: "Install will resolve this to an immutable version or commit, then show integrity, lifecycle scripts, and risks.",
	installing: "Installing",
	confirmTitle: "Confirm install",
	confirmBody: "The source below has been resolved to an immutable version or commit. Review scripts and risks before allowing changes to the current Profile or Skills directory.",
	confirmSpec: "Install spec",
	requestedSource: "Catalog source",
	resolvedSource: "Resolved install",
	integrity: "Integrity",
	riskApproval: "I reviewed the exact source, scripts, and risks above and allow this installation.",
	confirmNeedConfig: "This plugin may require extra configuration.",
	confirm: "Install",
	cancel: "Cancel",
	github: "GitHub",
	more: "Load more",
	stars: "Stars",
	weekly: "7-day",
	daily: "Today",
	hotScore: "Heat score",
	basis_hot: "Ranked by daily and weekly growth, growth rate, activity, quality, and popularity",
	basis_rising: "Ranked by Stars gained today",
	basis_total: "Ranked by total GitHub Stars",
	basis_category: "Category results retain the overall ranking order",
	basis_search: "Search results are ranked by name and content relevance",
	basisShort_hot: "Composite heat",
	basisShort_rising: "Today's growth",
	basisShort_total: "Stars ranking",
	basisShort_category: "Category ranking",
	basisShort_search: "Relevance order",
	restart: "Files were written and the profile composes. Restart DSH, then verify that the plugin is actually running.",
	phase_queued: "Queued",
	phase_validating: "Validating",
	phase_downloading: "Downloading",
	"phase_waiting-profile-lock": "Waiting for profile",
	phase_installing: "Installing",
	phase_installed: "Files written",
	phase_failed: "Failed",
	phase_cancelled: "Cancelled",
	installProgressLabel: "Installation progress",
	installProgressEstimate: "Estimated",
	installStageCheck: "Check",
	installStageDownload: "Download",
	installStageApply: "Install",
	installStageReady: "Ready",
	installStatusQueued: "Preparing the installation",
	installStatusValidating: "Checking the source and risk evidence",
	installStatusDownloading: "Downloading plugin files",
	installStatusWaiting: "Waiting for another plugin operation",
	installStatusWriting: "Writing to the current DSH profile",
	installStatusProfileCheck: "Checking the current DSH profile",
	installStatusDependencies: "Installing dependencies",
	installStatusFinalCheck: "Confirming that the Profile configuration composes",
	installStatusInstalled: "Files written; configuration check finished",
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
	evidence: "Review trust evidence",
	evidenceSignalIndexed: "Listed in the DSHEval index",
	evidenceSignalDshSkill: "Declared as a DSH Skill",
	evidenceSignalAgentSkill: "Declared as a general Agent Skill",
	evidenceSignalThemeBundle: "Matches the DSH/Cordis theme Bundle structure",
	evidenceSignalDshBundle: "Matches the DSH Bundle structure",
	evidenceSignalInstallSource: "Install source resolved",
	evidenceCaveatNotSecurityReview: "This evidence is not a security review. Verify the exact source, scripts, and permissions before installing.",
	"risk_lifecycle-scripts_summary": "Installation will run package lifecycle scripts",
	"risk_lifecycle-scripts_detail": "The installer will run the package scripts listed above.",
	"risk_repository-identity_summary": "The npm package could not be linked to the catalog repository",
	"risk_repository-identity_detail": "The package does not declare a recognizable GitHub repository. The exact version is pinned, but publisher identity still needs manual review.",
	"risk_skill-content_summary": "A Skill is active content that can influence model behavior",
	"risk_skill-content_detail": "SKILL.md, scripts, templates, and resources from this commit will be copied. The installer rejects symbolic links, but structural validation is not a security review.",
	"risk_restart-required_summary": "Restart and runtime verification are still required after files are written",
	"risk_restart-required_detail": "The post-install check only proves that the Profile composes; it does not prove that the plugin is running in the current DSH process.",
	trust_indexed: "Indexed only",
	trust_structured: "Structure recognized",
	"trust_install-source": "Install source parsed",
	"form_dsh-bundle": "DSH Bundle",
	"form_dsh-skill": "DSH Skill",
	"form_agent-skill": "Agent Skill",
	form_theme: "Theme",
	"form_mcp-integration": "MCP integration",
	"form_desktop-app": "Desktop app",
	"form_ecosystem-project": "Ecosystem project",
	form_candidate: "Candidate",
	activation_pending: "Runtime: waiting for installation",
	"activation_not-applicable": "Runtime: not a Bundle loader item; verify Skill visibility in a later session",
	"activation_configuration-valid": "Runtime: profile composes; current process not verified",
	"activation_restart-required": "Runtime: restart required before verification",
	activation_live: "Runtime: live",
	activation_inert: "Runtime: written but inactive",
	activation_broken: "Runtime: installation or configuration check failed",
	activation_unknown: "Runtime: no authoritative evidence yet",
	skillHint: "This is a Skill and cannot be installed into the Web profile with dsh plugin.",
	cardTitle: "Rankings source",
	cardHint: "The host reads the manifest and immutable ranking snapshots from this URL, with legacy fallback.",
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