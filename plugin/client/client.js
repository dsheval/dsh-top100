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
//#region src/client/install-batch-presentation.ts
function isInstallBatchComplete(batch) {
	return batch.completed === batch.total;
}
/** A deliberately coarse stage indicator; it never pretends to be byte progress. */
function installStage(job) {
	if (job.phase === "installed") return {
		current: 4,
		total: 4,
		percent: 100
	};
	if (job.phase === "queued" || job.phase === "validating") return {
		current: 1,
		total: 4,
		percent: 25
	};
	if (job.phase === "downloading") return {
		current: 2,
		total: 4,
		percent: 50
	};
	if (job.phase === "waiting-profile-lock" || job.phase === "installing") return {
		current: 3,
		total: 4,
		percent: 75
	};
	const output = `${job.lastLine}\n${job.error ?? ""}`;
	if (/下载|fetch|network|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(output)) return {
		current: 2,
		total: 4,
		percent: 50
	};
	if (/Progress:|ERR_PNPM_|写入|配置验证|profile/i.test(output)) return {
		current: 3,
		total: 4,
		percent: 75
	};
	return {
		current: 1,
		total: 4,
		percent: 25
	};
}

//#endregion
//#region src/client/install-capability.ts
/** Explain the next user-visible step without conflating structure, trust, and installability. */
function presentInstallCapability(item) {
	if (item.installed) return {
		kind: "installed",
		labelKey: "capabilityInstalled",
		reasonKey: "capabilityInstalledReason"
	};
	if (item.installable && item.install?.needsConfig) return {
		kind: "manual",
		labelKey: "capabilityManual",
		reasonKey: "capabilityManualReason"
	};
	if (item.installable) return {
		kind: "ready",
		labelKey: "capabilityReady",
		reasonKey: "capabilityReadyReason"
	};
	if (!item.evidence.compatible) return {
		kind: "browse",
		labelKey: "capabilityBrowse",
		reasonKey: "capabilityUnverifiedReason"
	};
	return {
		kind: "browse",
		labelKey: "capabilityUnavailable",
		reasonKey: "capabilityNoSourceReason"
	};
}

//#endregion
//#region src/client/install-review-presentation.ts
/** Scripts and ordinary restart guidance have their own always-visible compact rows. */
function visibleInstallReviewRisks(risks, scriptCount) {
	return risks.filter((risk) => {
		if (risk.code === "lifecycle-scripts" && scriptCount > 0) return false;
		if (risk.code === "restart-required" && risk.severity === "info") return false;
		return true;
	});
}

//#endregion
//#region src/client/install-presentation.ts
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
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "managed-copy",
							children: [
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
							]
						}),
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
//#region src/client/repository-identity.ts
function presentRepositoryIdentity(entry) {
	const path = entry.fullName.split("/").map((part) => part.trim()).filter(Boolean);
	const repositoryName = path.at(-1) || entry.name.trim() || entry.fullName;
	const sourceName = entry.name.trim();
	const nameRepeatsFullPath = sourceName.toLocaleLowerCase() === entry.fullName.trim().toLocaleLowerCase();
	return {
		name: !sourceName || nameRepeatsFullPath ? repositoryName : sourceName,
		owner: entry.owner.trim() || path[0] || ""
	};
}

//#endregion
//#region src/client/trust-presentation.ts
function presentInstallRisk(risk, t) {
	return {
		summary: t(`risk_${risk.code}_summary`),
		detail: risk.code === "lifecycle-scripts" ? risk.detail : t(`risk_${risk.code}_detail`)
	};
}

//#endregion
//#region src/client/RankingsPage.tsx
const SORT_VIEWS = [
	"hot",
	"rising",
	"total"
];
const CATALOG_SCOPES = ["plugins", "skills"];
const LAST_BATCH_KEY = "dsh-top100:last-install-batch:v1";
const DSHEVAL_SITE = "https://www.dsheval.ai";
const GITHUB_ICON = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	focusable: "false",
	children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 .7a11.3 11.3 0 0 0-3.6 22c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.2 1.9 1.2 1.1 1.9 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6a4.7 4.7 0 0 1 1.2-3.1c-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.8.1 3.1a4.7 4.7 0 0 1 1.2 3.1c0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z" })
});
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
function CategoryGlyph({ id }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 24 24",
		"aria-hidden": "true",
		children: [
			id === "ai" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m12 3 1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" })] }) : null,
			id === "appearance" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "4",
					y: "4",
					width: "6",
					height: "6",
					rx: "1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "14",
					y: "4",
					width: "6",
					height: "6",
					rx: "1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "4",
					y: "14",
					width: "6",
					height: "6",
					rx: "1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "14",
					y: "14",
					width: "6",
					height: "6",
					rx: "1"
				})
			] }) : null,
			id === "coding" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4l-3 16" }) }) : null,
			id === "knowledge" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" }) }) : null,
			id === "tools" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-3-3 2.4-2.4Z" }) }) : null,
			id === "security" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m9 12 2 2 4-4" })] }) : null,
			id === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 5h16M4 12h16M4 19h16" }) : null
		]
	});
}
function ChevronDown() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		viewBox: "0 0 20 20",
		"aria-hidden": "true",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m5.5 7.5 4.5 4.5 4.5-4.5" })
	});
}
function rankingBasisKey(view, query) {
	return query ? "basis_search" : `basis_${view}`;
}
function rankingBasisShortKey(view, query) {
	return query ? "basisShort_search" : `basisShort_${view}`;
}
function deltaLabel(value) {
	return value > 0 ? `+${value}` : String(value);
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
var HttpError = class extends Error {
	constructor(message, status) {
		super(message);
		this.status = status;
	}
};
async function readJson(url, init) {
	const response = await fetch(url, init);
	const body = await response.json();
	if (!response.ok) throw new HttpError(body.error || body.message || `${response.status} ${response.statusText}`, response.status);
	return body;
}
function rememberedBatchId() {
	try {
		return window.localStorage.getItem(LAST_BATCH_KEY);
	} catch {
		return null;
	}
}
function rememberBatch(batchId) {
	try {
		if (batchId) window.localStorage.setItem(LAST_BATCH_KEY, batchId);
		else window.localStorage.removeItem(LAST_BATCH_KEY);
	} catch {}
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
	const [category, setCategory] = (0, react.useState)(null);
	const [query, setQuery] = (0, react.useState)("");
	const [draft, setDraft] = (0, react.useState)("");
	const [catalogScope, setCatalogScope] = (0, react.useState)("plugins");
	const [installAvailability, setInstallAvailability] = (0, react.useState)("all");
	const [categoryMenuOpen, setCategoryMenuOpen] = (0, react.useState)(false);
	const [data, setData] = (0, react.useState)(null);
	const [items, setItems] = (0, react.useState)([]);
	const [error, setError] = (0, react.useState)(null);
	const [errorAction, setErrorAction] = (0, react.useState)("load");
	const [loading, setLoading] = (0, react.useState)(true);
	const [busy, setBusy] = (0, react.useState)(() => rememberedBatchId());
	const [preparing, setPreparing] = (0, react.useState)(null);
	const [confirming, setConfirming] = (0, react.useState)(null);
	const [preflights, setPreflights] = (0, react.useState)([]);
	const [riskAccepted, setRiskAccepted] = (0, react.useState)(false);
	const [batch, setBatch] = (0, react.useState)(null);
	const [installActivityOpen, setInstallActivityOpen] = (0, react.useState)(false);
	const [notice, setNotice] = (0, react.useState)(null);
	const loadSequence = (0, react.useRef)(0);
	const loadedSnapshot = (0, react.useRef)(null);
	const recoveryChecked = (0, react.useRef)(false);
	const load = (0, react.useCallback)(async (nextView, nextQuery, nextCategory, nextCatalogScope, nextInstallAvailability, offset = 0, append = false) => {
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
				category: nextCategory ?? "",
				catalogScope: nextCatalogScope,
				installAvailability: nextInstallAvailability,
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
		load(view, query, category, catalogScope, installAvailability, 0, false);
	}, [
		catalogScope,
		category,
		installAvailability,
		load,
		query,
		section,
		view
	]);
	(0, react.useEffect)(() => {
		if (recoveryChecked.current) return;
		recoveryChecked.current = true;
		if (busy) return;
		readJson("/dsh-top100/status").then((status) => {
			const recovered = status.activeBatches[0];
			if (!recovered) return;
			rememberBatch(recovered.batchId);
			setBatch(recovered);
			setBusy(recovered.batchId);
			setNotice(t("installTaskRecovered"));
		}).catch(() => {});
	}, [busy, t]);
	(0, react.useEffect)(() => {
		if (!busy) return void 0;
		const refresh = () => {
			readJson(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(busy)}`).then(async (snapshot) => {
				setBatch(snapshot);
				if (isInstallBatchComplete(snapshot)) {
					rememberBatch(null);
					setBusy(null);
					setNotice(snapshot.requiresRestart ? t("restart") : t("batchComplete"));
					await load(view, query, category, catalogScope, installAvailability, 0, false);
				}
			}).catch((cause) => {
				if (cause instanceof HttpError && cause.status === 404) {
					rememberBatch(null);
					setBusy(null);
					setBatch(null);
					setNotice(t("installTaskUnavailable"));
					setError(null);
					return;
				}
				setErrorAction("install");
				setError(cause instanceof Error ? cause.message : String(cause));
			});
		};
		refresh();
		const timer = window.setInterval(refresh, 800);
		return () => window.clearInterval(timer);
	}, [
		busy,
		catalogScope,
		category,
		installAvailability,
		load,
		query,
		t,
		view
	]);
	const remaining = (0, react.useMemo)(() => {
		if (!data) return 0;
		return Math.max(0, data.total - items.length);
	}, [data, items.length]);
	const preflightsByName = (0, react.useMemo)(() => new Map(preflights.map((preflight) => [preflight.fullName, preflight])), [preflights]);
	const activeCategory = data?.categories.find((definition) => definition.id === category);
	function startSearch(value) {
		const nextQuery = value.trim();
		setCategory(null);
		setDraft(nextQuery);
		setQuery(nextQuery);
	}
	function switchCatalogScope(nextScope) {
		setCatalogScope(nextScope);
		setView(nextScope === "plugins" ? "hot" : "total");
		setInstallAvailability("all");
		setCategory(null);
		setQuery("");
		setDraft("");
		setCategoryMenuOpen(false);
	}
	function selectCategory(nextCategory) {
		setCategory(nextCategory);
		setCategoryMenuOpen(false);
	}
	function selectRankingView(nextView) {
		setView(nextView);
		setQuery("");
		setDraft("");
	}
	async function prepareInstall(item) {
		setInstallActivityOpen(false);
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
			rememberBatch(result.batchId);
			setInstallActivityOpen(true);
		} catch (cause) {
			setErrorAction("install");
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setPreflights([]);
			setRiskAccepted(false);
		}
	}
	async function cancelJob(jobId) {
		try {
			await readJson("/dsh-top100/cancel", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ jobId })
			});
		} catch (cause) {
			setErrorAction("install");
			setError(`${t("cancelFailed")} ${cause instanceof Error ? cause.message : String(cause)}`);
		}
	}
	async function retryJob(job) {
		if (!job.action || job.action === "install") {
			let item = items.find((candidate) => candidate.fullName === job.fullName);
			if (!item) try {
				item = (await readJson(`/dsh-top100/rankings?${new URLSearchParams({
					view: "total",
					category: "",
					catalogScope: "plugins",
					installAvailability: "all",
					q: job.fullName,
					offset: "0",
					limit: "20"
				})}`)).items.find((candidate) => candidate.fullName === job.fullName);
			} catch {}
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
			rememberBatch(result.batchId);
			setInstallActivityOpen(true);
		} catch (cause) {
			setErrorAction("install");
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}
	function jobPanel(job) {
		const stage = installStage(job);
		const status = installStatus(job);
		const error$1 = job.phase === "failed" ? presentInstallError(job.error ?? job.lastLine) : null;
		const errorKey = error$1 ? ERROR_LOCALE_KEYS[error$1.kind] : null;
		const activeStage = stage.current - 1;
		const terminal = [
			"installed",
			"failed",
			"cancelled"
		].includes(job.phase);
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
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "job-plugin-name",
						title: job.fullName,
						children: job.fullName
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(`phase_${job.phase}`) })]
				}),
				!terminal ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "job-progress",
					role: "progressbar",
					"aria-label": t("installProgressLabel"),
					"aria-valuemin": 0,
					"aria-valuemax": 100,
					"aria-valuenow": stage.percent,
					"aria-valuetext": `${t("installProgressEstimate")} ${stage.current}/${stage.total}`,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { width: `${stage.percent}%` } })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "job-stages",
					"aria-hidden": "true",
					children: stages.map((key, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: index < activeStage ? "is-complete" : index === activeStage ? "is-active" : void 0,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}), t(key)]
					}, key))
				})] }) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: "job-status",
					children: [t(status.key), status.count === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [" · ", status.count] })]
				}),
				job.phase === "installed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: `activation activation-${job.activationState}`,
					children: t(`activation_${job.activationState}`)
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
					onClick: () => {
						setInstallActivityOpen(false);
						setSection("installed");
					},
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
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "market-title-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								className: "github-link",
								href: "https://github.com/dsheval/dsh-top100",
								"aria-label": "dsh-top100 GitHub",
								title: "dsh-top100 GitHub",
								target: "_blank",
								rel: "noopener noreferrer",
								children: GITHUB_ICON
							})]
						}),
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
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "catalog-navigation",
					role: "group",
					"aria-label": t("catalogScope"),
					children: CATALOG_SCOPES.map((scope) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "catalog-tab",
						"aria-pressed": catalogScope === scope,
						title: t(`catalogScopeHint_${scope}`),
						onClick: () => switchCatalogScope(scope),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`catalogScope_${scope}`) }), data?.scopeCounts ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "catalog-count",
							children: data.scopeCounts[scope].toLocaleString("en-US")
						}) : null]
					}, scope))
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "toolbar ranking-toolbar",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "search-cluster",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "search",
							value: draft,
							placeholder: t("searchPlaceholder"),
							onChange: (event) => setDraft(event.target.value),
							onKeyDown: (event) => {
								if (event.key === "Enter" && !event.nativeEvent.isComposing) startSearch(draft);
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "primary",
							onClick: () => startSearch(draft),
							children: t("search")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "market-filter-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "market-category-menu",
							onBlur: (event) => {
								if (!event.currentTarget.contains(event.relatedTarget)) setCategoryMenuOpen(false);
							},
							onKeyDown: (event) => {
								if (event.key === "Escape") setCategoryMenuOpen(false);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "market-category-trigger",
								"aria-expanded": categoryMenuOpen,
								"aria-controls": "top100-category-menu",
								title: activeCategory?.description ?? t("allCategories"),
								onClick: () => setCategoryMenuOpen((current) => !current),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "market-category-icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CategoryGlyph, { id: category })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: activeCategory?.label ?? t("allCategories") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronDown, {})
								]
							}), categoryMenuOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								id: "top100-category-menu",
								className: "market-category-popover",
								role: "listbox",
								"aria-label": t(catalogScope === "skills" ? "skillCategoryFilter" : "categoryFilter"),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "market-category-choice market-category-choice-all",
									role: "option",
									"aria-selected": category === null,
									onClick: () => selectCategory(null),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "market-category-icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CategoryGlyph, { id: null })
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("allCategories") })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "market-category-grid",
									children: data?.categories.map((definition) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "market-category-choice",
										role: "option",
										"aria-selected": definition.id === category,
										title: definition.description,
										onClick: () => selectCategory(definition.id),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "market-category-icon",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CategoryGlyph, { id: definition.id })
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: definition.label })]
									}, definition.id))
								})]
							}) : null]
						}), catalogScope === "plugins" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "install-only-toggle",
							role: "switch",
							"aria-checked": installAvailability === "installable",
							onClick: () => setInstallAvailability((current) => current === "installable" ? "all" : "installable"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "switch-track",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installableOnly") })]
						}) : null]
					})]
				}),
				data ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "ranking-context",
					"aria-live": "polite",
					children: [query ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "result-count search-result-count",
						children: [
							t("catalogMatches"),
							" ",
							data.total,
							" ",
							t("entries"),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
								" · ",
								t("showingResults"),
								" ",
								items.length
							] })
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "result-count",
						children: [
							items.length,
							" / ",
							data.total,
							" ",
							t(catalogScope === "plugins" ? "pluginEntries" : "skillEntries")
						]
					}), query ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "ranking-current-label",
						title: t(rankingBasisKey(view, query)),
						children: t(rankingBasisShortKey(view, query))
					}) : catalogScope === "plugins" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "ranking-modes",
						"aria-label": t("sortBy"),
						children: SORT_VIEWS.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": view === id,
							title: t(rankingBasisKey(id, "")),
							onClick: () => selectRankingView(id),
							children: t(id)
						}, id))
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "ranking-current-label stars-browse",
						children: ["★ ", t("starsBrowsing")]
					})]
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
							onClick: () => void load(view, query, category, catalogScope, installAvailability, 0, false),
							children: t("retry")
						}) : null
					]
				}) : null,
				batch ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: `install-activity-banner ${busy ? "is-active" : "is-complete"}`,
					role: "status",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: batch.jobs[0] ? t(`phase_${batch.jobs[0].phase}`) : t(busy ? "installTaskRunning" : "installTaskComplete") }), batch.jobs[0] ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						title: batch.jobs[0].fullName,
						children: batch.jobs[0].fullName
					}) : null] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setInstallActivityOpen(true),
						children: t(busy ? "viewInstallProgress" : "viewInstallResult")
					})]
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "list",
					"aria-busy": loading,
					"aria-label": loading && items.length === 0 ? t("loadingRankings") : void 0,
					children: [loading && items.length === 0 && !error ? SKELETON_CARDS : items.map((item) => {
						const identity = presentRepositoryIdentity(item);
						const installCapability = presentInstallCapability(item);
						const rankingMetric = catalogScope === "plugins" && !query && view === "hot" ? {
							label: t("hotScore"),
							value: item.hotScore.toFixed(1)
						} : catalogScope === "plugins" && !query && view === "rising" ? {
							label: t("daily"),
							value: `+${item.dailyStars}`
						} : null;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							className: "ranking-card",
							"data-rank": item.rank,
							"data-trust": item.evidence.trustLevel,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "card-copy",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "card-heading",
									children: [catalogScope === "plugins" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "rank",
										"aria-label": `${t("rank")} ${item.rank}`,
										children: ["#", item.rank]
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "rank",
										children: t(`catalogScope_${catalogScope}`)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
										href: item.url || `https://github.com/${item.fullName}`,
										target: "_blank",
										rel: "noreferrer",
										"aria-label": identity.name,
										title: identity.name,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "repo-name",
											children: identity.name
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "title-arrow",
											"aria-hidden": "true",
											children: "↗"
										})]
									}) })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "desc",
									children: item.descriptionZh || item.description
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "card-footer",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "facts",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "star-fact",
											children: ["★ ", item.stars]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											t("weekly"),
											" ",
											deltaLabel(item.weeklyStars)
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
											className: `capability-label capability-${installCapability.kind}`,
											title: t(installCapability.reasonKey),
											children: t(installCapability.labelKey)
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "actions",
									children: item.installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "primary",
										onClick: () => setSection("installed"),
										children: t("manage")
									}) : item.installable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "primary",
										disabled: busy !== null || preparing !== null,
										onClick: () => void prepareInstall(item),
										children: preparing === item.fullName ? t("preflighting") : t("reviewInstall")
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
										className: "project-link",
										href: item.url || `https://github.com/${item.fullName}`,
										target: "_blank",
										rel: "noreferrer",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("viewProject") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"aria-hidden": "true",
											children: "↗"
										})]
									})
								})]
							})]
						}, `${item.fullName}-${item.rank}`);
					}), !loading && items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "lede",
						children: t("empty")
					}) : null]
				}),
				remaining > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					disabled: loading,
					onClick: () => void load(view, query, category, catalogScope, installAvailability, items.length, true),
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
					"aria-labelledby": "dsh-top100-confirm-title",
					onKeyDownCapture: (event) => {
						if (event.key !== "Escape") return;
						event.stopPropagation();
						setConfirming(null);
						setPreflights([]);
						setRiskAccepted(false);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dialog",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: "confirm-header",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									id: "dsh-top100-confirm-title",
									children: confirming.length === 1 ? t("confirmProjectTitle").replace("{name}", presentRepositoryIdentity(confirming[0]).name) : t("confirmTitle")
								}), confirming.length === 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									className: "confirm-target",
									"aria-label": t("resolvedSource"),
									children: preflightsByName.get(confirming[0].fullName)?.provenance.resolvedTarget ?? confirming[0].installSpec?.spec ?? "-"
								}) : null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "confirm-body",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "confirm-list",
									children: confirming.map((item) => {
										const preflight = preflightsByName.get(item.fullName);
										const identity = presentRepositoryIdentity(item);
										const scriptCount = preflight?.lifecycleScripts.length ?? 0;
										const needsRestart = preflight?.risks.some((risk) => risk.code === "restart-required") ?? false;
										const visibleRisks = visibleInstallReviewRisks(preflight?.risks ?? [], scriptCount);
										const sourceSummaryKey = preflight?.provenance.source === "github" ? "commitLocked" : preflight?.provenance.repositoryIdentity === "unavailable" ? "sourceIdentityUnavailable" : "sourceMatched";
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "confirm-item",
											children: [
												confirming.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "confirm-project",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: identity.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
														className: "confirm-target",
														"aria-label": t("resolvedSource"),
														children: preflight?.provenance.resolvedTarget ?? item.installSpec?.spec ?? "-"
													})]
												}) : null,
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
													className: "confirm-effects",
													"aria-label": t("installSummary"),
													children: [
														scriptCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: "confirm-scripts",
															"data-warning": scriptCount > 0,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("confirmScripts") }), preflight?.lifecycleScripts.map((script) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: "script-evidence",
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: script.name }),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		"aria-hidden": "true",
																		children: "→"
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: script.command })
																]
															}, script.name))]
														}) : null,
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
															className: "risk-list",
															children: visibleRisks.map((risk) => {
																const presented = presentInstallRisk(risk, t);
																return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
																	"data-severity": risk.severity,
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: presented.summary }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: presented.detail })]
																}, risk.code);
															})
														}),
														needsRestart ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															className: "confirm-followup",
															children: t("confirmRestart")
														}) : null,
														item.install?.needsConfig ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															className: "confirm-followup",
															children: t("confirmNeedConfig")
														}) : null
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
													className: "confirm-evidence",
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("viewInstallTechnicalEvidence") }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															className: "confirm-source-status",
															children: t(sourceSummaryKey)
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", { children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("requestedSource") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight?.provenance.requestedTarget ?? item.installSpec?.spec ?? item.type }) })] }),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("resolvedSource") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight?.provenance.resolvedTarget ?? "-" }) })] }),
															preflight?.provenance.integrity ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("integrity") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: preflight.provenance.integrity }) })] }) : null
														] }),
														scriptCount === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("noBuildScripts") }) : null,
														needsRestart ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("risk_restart-required_detail") }) : null,
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
															className: "confirm-project-link",
															href: item.url || `https://github.com/${item.fullName}`,
															target: "_blank",
															rel: "noreferrer",
															children: [t("viewProject"), " ↗"]
														})
													]
												})
											]
										}, item.fullName);
									})
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
								className: "confirm-footer",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "confirm-caveat",
										children: t("confirmSecurityNote")
									}),
									preflights.some((value) => value.requiresExplicitApproval) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "risk-approval",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: riskAccepted,
											onChange: (event) => setRiskAccepted(event.target.checked)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("riskApproval") })]
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "confirm-actions",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											autoFocus: true,
											onClick: () => {
												setConfirming(null);
												setPreflights([]);
												setRiskAccepted(false);
											},
											children: t("cancel")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "primary",
											disabled: !riskAccepted,
											onClick: () => void install(confirming),
											children: t("confirm")
										})]
									})
								]
							})
						]
					})
				}) : null
			] }) : section === "installed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ManagedPage, { t }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiagnosticsPage, { t }),
			batch && installActivityOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "install-activity-mask",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: "install-activity-dialog",
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "dsh-top100-install-activity-title",
					onKeyDownCapture: (event) => {
						if (event.key !== "Escape") return;
						event.stopPropagation();
						event.nativeEvent.stopImmediatePropagation();
						setInstallActivityOpen(false);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "install-activity-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							id: "dsh-top100-install-activity-title",
							children: t("installActivityTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(busy ? "installActivityActiveHint" : "installActivityCompleteHint") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "install-activity-close",
							autoFocus: true,
							"aria-label": t("closeInstallActivity"),
							onClick: () => setInstallActivityOpen(false),
							children: "×"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "install-activity-list",
						children: batch.jobs.map((job) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "install-activity-item",
							children: jobPanel(job)
						}, job.id))
					})]
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
  --t100-ink: var(--dsw-alias-label-primary, color-mix(in srgb, currentColor 92%, transparent));
  --t100-body: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 72%, transparent));
  --t100-muted: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 58%, transparent));
  --t100-line: var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 14%, transparent));
  --t100-surface: var(--dsw-alias-bg-layer-1, Canvas);
  --t100-fill: var(--dsw-alias-bg-layer-2, color-mix(in srgb, currentColor 6%, transparent));
  --t100-accent: color-mix(in srgb, #3f8b82 78%, currentColor);
  --t100-accent-soft: color-mix(in srgb, var(--t100-accent) 16%, transparent);
  /* Match the user's reference screenshot, without currentColor mixing. */
  --t100-action: #67a298;
  --t100-action-hover: #5f998f;
  --t100-action-border: #67a298;
  --t100-on-action: #ffffff;
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
.dsh-top100 .market-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
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
  color: var(--t100-body);
  font-size: 12px;
  line-height: 18px;
}
.dsh-top100 .data-source {
  color: var(--t100-accent);
  font-weight: 650;
  text-decoration: none;
}
.dsh-top100 .data-source:hover { text-decoration: underline; }
.dsh-top100 .cache-warning { color: #9a6700; }
.dsh-top100 .github-link {
  display: inline-flex;
  flex: 0 0 36px;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--t100-ink);
  text-decoration: none;
}
.dsh-top100 .github-link svg { width: 20px; height: 20px; fill: currentColor; }
.dsh-top100 .github-link:hover { background: var(--t100-fill); }
.dsh-top100 .github-link:focus-visible { outline: 2px solid var(--t100-accent); outline-offset: 2px; }
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
.dsh-top100 .ranking-toolbar {
  flex-direction: column;
  align-items: stretch;
}
.dsh-top100 .ranking-toolbar .search-cluster {
  width: 100%;
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
.dsh-top100 .catalog-navigation {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 36px;
  padding: 2px 1px 7px;
  border-bottom: 1px solid var(--t100-line);
}
.dsh-top100 button.catalog-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border-color: transparent;
  color: var(--t100-body);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.dsh-top100 button.catalog-tab:hover { color: var(--t100-ink); }
.dsh-top100 button.catalog-tab[aria-pressed="true"] {
  color: var(--t100-accent);
  background: var(--t100-accent-soft);
}
.dsh-top100 .catalog-count {
  color: inherit;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
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
.dsh-top100 span.tab {
  display: inline-flex;
  align-items: center;
  cursor: default;
}
.dsh-top100 .tab[aria-selected="true"] {
  background: var(--t100-accent);
  border-color: var(--t100-accent);
  color: #f7f3e7;
}
.dsh-top100 button.primary {
  background: var(--t100-action);
  border-color: var(--t100-action-border);
  color: var(--t100-on-action);
  font-size: 14px;
  font-weight: 600;
}
.dsh-top100 button.primary:hover:not(:disabled) {
  background: var(--t100-action-hover);
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
.dsh-top100 .market-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}
.dsh-top100 .market-category-menu {
  position: relative;
  flex: 0 1 176px;
}
.dsh-top100 button.market-category-trigger {
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr) 15px;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--t100-surface);
  font-size: 12px;
  font-weight: 650;
  text-align: left;
  white-space: nowrap;
}
.dsh-top100 button.market-category-trigger:hover,
.dsh-top100 button.market-category-trigger[aria-expanded="true"] {
  border-color: color-mix(in srgb, var(--t100-accent) 52%, var(--t100-line));
  color: var(--t100-accent);
  background: color-mix(in srgb, var(--t100-accent) 7%, var(--t100-surface));
}
.dsh-top100 .market-category-trigger > svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  transition: transform 140ms ease;
}
.dsh-top100 .market-category-trigger[aria-expanded="true"] > svg { transform: rotate(180deg); }
.dsh-top100 .market-category-icon {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  color: var(--t100-accent);
}
.dsh-top100 .market-category-icon svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.65;
}
.dsh-top100 .market-category-popover {
  position: absolute;
  z-index: 40;
  top: calc(100% + 7px);
  left: 0;
  width: min(330px, calc(100vw - 56px));
  padding: 7px;
  border: 1px solid var(--t100-line);
  border-radius: 12px;
  background: var(--t100-surface);
  box-shadow: 0 14px 34px color-mix(in srgb, #17211f 17%, transparent);
}
.dsh-top100 .market-category-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--t100-line);
}
.dsh-top100 button.market-category-choice {
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 0;
  height: 38px;
  padding: 0 8px;
  border-color: transparent;
  border-radius: 7px;
  color: var(--t100-body);
  font-size: 11px;
  text-align: left;
}
.dsh-top100 button.market-category-choice:hover { background: var(--t100-fill); }
.dsh-top100 button.market-category-choice[aria-selected="true"] {
  color: var(--t100-accent);
  background: var(--t100-accent-soft);
  font-weight: 700;
}
.dsh-top100 .market-category-choice > span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-top100 button.market-category-choice-all {
  width: 100%;
  margin-bottom: 4px;
}
.dsh-top100 button.install-only-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--t100-surface);
  color: var(--t100-body);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.dsh-top100 button.install-only-toggle:hover { color: var(--t100-ink); }
.dsh-top100 button.install-only-toggle[aria-checked="true"] {
  border-color: color-mix(in srgb, var(--t100-accent) 42%, var(--t100-line));
  color: var(--t100-accent);
  background: color-mix(in srgb, var(--t100-accent) 7%, var(--t100-surface));
}
.dsh-top100 .switch-track {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--t100-muted) 28%, transparent);
  transition: background 140ms ease;
}
.dsh-top100 .switch-track > span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--t100-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, #17211f 24%, transparent);
  transition: transform 140ms ease;
}
.dsh-top100 .install-only-toggle[aria-checked="true"] .switch-track { background: var(--t100-accent); }
.dsh-top100 .install-only-toggle[aria-checked="true"] .switch-track > span { transform: translateX(12px); }
.dsh-top100 .ranking-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 32px;
  padding: 0 1px;
  color: var(--t100-body);
  font-size: 12px;
  line-height: 18px;
}
.dsh-top100 .search-result-count small {
  color: var(--t100-body);
  font-size: 12px;
}
.dsh-top100 .search-result-tab[aria-selected="true"]::before {
  content: "↳";
  margin-right: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dsh-top100 .result-count {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-top100 .filter-summary {
  flex: 0 0 auto;
  color: var(--t100-accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-top100 .ranking-current-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  color: var(--t100-muted);
  font-weight: 600;
  white-space: nowrap;
}
.dsh-top100 .ranking-modes {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 1px;
  padding: 2px;
  border: 1px solid var(--t100-line);
  border-radius: 9px;
  background: var(--t100-fill);
}
.dsh-top100 .ranking-modes button {
  height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  color: var(--t100-body);
  font-size: 12px;
  font-weight: 600;
}
.dsh-top100 .ranking-modes button:hover { color: var(--t100-ink); }
.dsh-top100 .ranking-modes button[aria-pressed="true"] {
  color: var(--t100-accent);
  background: var(--t100-surface);
  box-shadow: 0 1px 3px color-mix(in srgb, #17211f 12%, transparent);
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
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 9px;
  min-height: 126px;
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
  width: 40px;
  height: 20px;
  border-radius: 999px;
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
.dsh-top100 .ranking-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 10px;
  align-items: start;
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--t100-line);
  border-radius: 12px;
  background: var(--t100-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, #17211f 6%, transparent);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.dsh-top100 .ranking-card::before {
  content: "";
  position: absolute;
  inset: 12px auto 12px 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--t100-line);
}
.dsh-top100 .ranking-card[data-trust="install-source"]::before { background: var(--t100-accent); }
.dsh-top100 .ranking-card:hover {
  border-color: color-mix(in srgb, var(--t100-accent) 34%, var(--t100-line));
  box-shadow: 0 7px 18px color-mix(in srgb, #17211f 9%, transparent);
}
.dsh-top100 .rank {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 21px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 25%, var(--t100-line));
  border-radius: 999px;
  background: var(--t100-accent-soft);
  box-sizing: border-box;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--t100-accent);
}
.dsh-top100 .ranking-card[data-rank="1"] .rank,
.dsh-top100 .ranking-card[data-rank="2"] .rank,
.dsh-top100 .ranking-card[data-rank="3"] .rank {
  border-color: var(--t100-accent);
  background: var(--t100-accent);
  color: #f8fbfa;
}
.dsh-top100 .card-copy { min-width: 0; }
.dsh-top100 .card-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  margin-bottom: 7px;
}
.dsh-top100 h3 {
  margin: 0 0 5px;
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  text-overflow: ellipsis;
}
.dsh-top100 .card-copy h3 {
  min-width: 0;
  margin: 0;
  font-size: 14px;
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
.dsh-top100 .repo-name { font-weight: 720; }
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
.dsh-top100 .repo-owner-name {
  min-width: 0;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
}
.dsh-top100 .desc {
  display: block;
  min-height: 0;
  margin: 0;
  overflow: visible;
  color: var(--t100-body);
  font-size: 13px;
  line-height: 20px;
}
.dsh-top100 .facts {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 10px;
  margin-top: 8px;
  color: var(--t100-body);
  font-size: 12px;
  line-height: 18px;
}
.dsh-top100 .facts > span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
}
.dsh-top100 .capability-label {
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--t100-body);
  font: inherit;
  white-space: nowrap;
}
.dsh-top100 .capability-label.capability-ready,
.dsh-top100 .capability-label.capability-installed {
  color: var(--t100-accent);
}
.dsh-top100 .capability-label.capability-manual {
  color: #8a5c00;
}
.dsh-top100 .ranking-metric strong {
  color: var(--t100-accent);
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .ranking-metric { gap: 3px; }
.dsh-top100 .star-fact {
  color: var(--t100-ink);
  font-variant-numeric: tabular-nums;
}
.dsh-top100 .evidence-badge,
.dsh-top100 .form-factor {
  display: inline-flex;
  align-items: center;
  justify-self: start;
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
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}
.dsh-top100 .actions > button,
.dsh-top100 .actions > .project-link {
  box-sizing: border-box;
  display: inline-flex;
  flex: 0 0 auto;
  height: 36px;
  min-height: 36px;
  min-width: 64px;
  padding: 0 16px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
}
.dsh-top100 .card-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding-top: 10px;
  border-top: 1px solid var(--t100-line);
}
.dsh-top100 .card-footer .facts {
  min-width: 0;
  margin-top: 0;
}
.dsh-top100 .project-link {
  border: 1px solid var(--t100-line);
  color: var(--t100-ink);
  background: var(--t100-fill);
  text-decoration: none;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
}
.dsh-top100 .project-link:hover {
  border-color: var(--t100-accent);
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
}
.dsh-top100 .project-link:focus-visible {
  outline: 2px solid var(--t100-accent);
  outline-offset: 2px;
}
.dsh-top100 .row-actions {
  min-width: 104px;
}
.dsh-top100 .managed-list article {
  position: relative;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 10px 12px;
  align-items: start;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--t100-line);
  border-radius: 12px;
  background: var(--t100-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, #17211f 6%, transparent);
}
.dsh-top100 .managed-list .status-cell {
  grid-column: 1;
  grid-row: 1;
  min-height: 20px;
  padding-top: 1px;
}
.dsh-top100 .managed-list .managed-copy {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
}
.dsh-top100 .managed-list .row-actions {
  grid-column: 2;
  grid-row: 2;
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
.dsh-top100 .job-plugin-name {
  overflow: hidden;
  color: var(--t100-ink);
  font: 700 14px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-top100 .job-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dsh-top100 .job-heading strong {
  flex: 0 0 auto;
  color: var(--t100-accent);
  font-size: 11px;
  font-weight: 700;
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
.dsh-top100 .activation.activation-configuration-required,
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
.dsh-top100 .job-installed.activation-configuration-required {
  border-color: color-mix(in srgb, #c98300 46%, var(--t100-line));
}
.dsh-top100 .job-installed.activation-configuration-required .job-progress > span {
  background: #c98300;
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
.dsh-top100 .install-activity-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px 9px 12px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 25%, var(--t100-line));
  border-radius: 9px;
  background: color-mix(in srgb, Canvas 93%, var(--t100-accent-soft));
}
.dsh-top100 .install-activity-banner > div {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  gap: 8px;
  align-items: baseline;
}
.dsh-top100 .install-activity-banner strong {
  font-size: 12px;
}
.dsh-top100 .install-activity-banner span {
  max-width: 280px;
  overflow: hidden;
  color: var(--t100-muted);
  font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-top100 .install-activity-banner > button {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 5px 10px;
  border-color: color-mix(in srgb, var(--t100-accent) 34%, var(--t100-line));
  color: var(--t100-accent);
  font-size: 11px;
  font-weight: 700;
}
.dsh-top100 .install-activity-banner.is-active {
  border-left: 3px solid var(--t100-accent);
}
.dsh-top100 .install-activity-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, #17211f 44%, transparent);
}
.dsh-top100 .install-activity-dialog {
  display: grid;
  grid-template-rows: auto auto;
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 24%, var(--t100-line));
  border-radius: 14px;
  background: var(--t100-surface);
  color: var(--t100-ink);
  box-shadow: 0 24px 70px color-mix(in srgb, #17211f 26%, transparent);
  animation: t100-install-dialog-in 160ms cubic-bezier(.2,.75,.25,1);
}
@keyframes t100-install-dialog-in {
  from { opacity: .6; transform: translateY(8px) scale(.99); }
}
.dsh-top100 .install-activity-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 16px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--t100-line);
}
.dsh-top100 .install-activity-head h3 {
  margin: 0 0 3px;
  font-size: 16px;
  line-height: 1.3;
}
.dsh-top100 .install-activity-head p {
  margin: 0;
  color: var(--t100-muted);
  font-size: 11px;
  line-height: 1.5;
}
.dsh-top100 button.install-activity-close {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  color: var(--t100-muted);
  font-size: 22px;
  font-weight: 300;
  line-height: 1;
}
.dsh-top100 button.install-activity-close:hover {
  background: var(--t100-fill);
  color: var(--t100-ink);
}
.dsh-top100 .install-activity-list {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px 16px 16px;
  overflow: visible;
}
.dsh-top100 .install-activity-item > .job {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  padding: 12px;
  border-radius: 9px;
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
  grid-template-columns: auto minmax(0, 1fr) 32px;
  gap: 10px;
  align-items: start;
}
.dsh-top100 .detail-rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 7px;
  box-sizing: border-box;
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
.dsh-top100 .detail-refresh {
  margin: -2px 0 0;
  color: var(--t100-accent);
  font-size: 10px;
}
.dsh-top100 .detail-refresh.is-warning { color: #9a6700; }
.dsh-top100 .detail-decision {
  display: grid;
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--t100-line);
  border-left-width: 3px;
  border-radius: 10px;
  background: var(--t100-fill);
}
.dsh-top100 .detail-decision-installable,
.dsh-top100 .detail-decision-installed {
  border-color: color-mix(in srgb, var(--t100-accent) 28%, var(--t100-line));
  border-left-color: var(--t100-accent);
  background: color-mix(in srgb, var(--t100-accent) 5%, var(--t100-surface));
}
.dsh-top100 .detail-decision-browse {
  border-left-color: var(--t100-muted);
  background: var(--t100-fill);
}
.dsh-top100 .detail-decision h4 {
  margin: 2px 0 0;
  font-size: 14px;
  line-height: 1.4;
}
.dsh-top100 .detail-decision > p {
  margin: 0;
  color: var(--t100-body);
  font-size: 11px;
  line-height: 1.55;
}
.dsh-top100 .detail-eyebrow {
  color: var(--t100-muted);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: .08em;
}
.dsh-top100 .detail-decision .detail-caveat {
  padding: 8px 9px;
  border-left: 3px solid #c98300;
  border-radius: 0 7px 7px 0;
  background: color-mix(in srgb, #f0b429 8%, transparent);
  color: #7a5200;
}
.dsh-top100 .detail-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
.dsh-top100 .detail-properties a {
  color: var(--t100-accent);
  overflow-wrap: anywhere;
}
.dsh-top100 details.detail-secondary {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--t100-line);
  border-radius: 10px;
  background: transparent;
}
.dsh-top100 details.detail-secondary[open] {
  display: grid;
  gap: 12px;
}
.dsh-top100 .detail-secondary > summary {
  color: var(--t100-body);
  font-size: 11px;
  font-weight: 700;
}
.dsh-top100 .detail-ranking-basis {
  margin: 0;
  color: var(--t100-muted);
  font-size: 10px;
  line-height: 1.5;
}
.dsh-top100 .detail-secondary .detail-highlight {
  justify-self: start;
  margin: -6px 0 0;
  padding: 3px 7px;
  border-radius: 99px;
  background: var(--t100-accent-soft);
  color: var(--t100-accent);
  font-size: 10px;
  font-weight: 700;
}
.dsh-top100 .detail-secondary .detail-properties {
  padding-top: 10px;
  border-top: 1px solid var(--t100-line);
}
.dsh-top100 .decision-properties > div {
  padding: 7px 8px;
  border-radius: 7px;
  background: var(--t100-fill);
}
.dsh-top100 .decision-properties dd { color: var(--t100-body); }
.dsh-top100 .trust-section {
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 18%, var(--t100-line));
  border-radius: 10px;
  background: color-mix(in srgb, var(--t100-accent) 4%, var(--t100-surface));
}
.dsh-top100 .trust-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dsh-top100 .trust-heading .evidence-badge {
  min-height: 22px;
  border: 1px solid color-mix(in srgb, var(--t100-accent) 22%, var(--t100-line));
  background: transparent;
}
.dsh-top100 .trust-note {
  margin: 0;
  color: var(--t100-muted);
  font-size: 11px;
  line-height: 1.55;
}
.dsh-top100 .trust-section details.evidence-rail {
  margin: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  background: var(--t100-fill);
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
  box-sizing: border-box;
  width: min(480px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
  overflow: hidden;
  border-radius: 12px;
  background: var(--t100-surface);
  color: var(--t100-ink);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  box-shadow: 0 16px 56px #0003;
}
.dsh-top100 .confirm-header { padding: 24px 24px 20px; }
.dsh-top100 .confirm-header h3 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; overflow-wrap: anywhere; }
.dsh-top100 .confirm-body {
  min-height: 0;
  overflow: auto;
  padding: 0 24px 18px;
  overscroll-behavior: contain;
}
.dsh-top100 .confirm-list {
  display: grid;
  gap: 24px;
}
.dsh-top100 .confirm-item {
  min-width: 0;
}
.dsh-top100 .confirm-item + .confirm-item {
  border-top: 1px solid var(--t100-line);
  padding-top: 24px;
}
.dsh-top100 .confirm-project {
  display: grid;
  margin-bottom: 18px;
}
.dsh-top100 .confirm-project strong {
  overflow-wrap: anywhere;
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
}
.dsh-top100 .confirm-project-link {
  display: inline-block;
  margin-top: 8px;
  color: var(--t100-body);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  text-decoration: none;
}
.dsh-top100 .confirm-project-link:hover { color: var(--t100-ink); text-decoration: underline; }
.dsh-top100 .confirm-project-link:focus-visible { outline: 2px solid var(--t100-accent); outline-offset: 3px; }
.dsh-top100 .dialog code {
  color: var(--t100-ink);
  font: 13px/20px ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.dsh-top100 code.confirm-target { display: block; margin-top: 6px; color: var(--t100-body); }
.dsh-top100 .confirm-source-status {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--t100-body);
}
.dsh-top100 .confirm-scripts p { margin: 0; font-size: 14px; line-height: 22px; }
.dsh-top100 .confirm-scripts[data-warning="true"] { border-left: 2px solid var(--t100-accent); padding-left: 12px; }
.dsh-top100 .confirm-scripts[data-warning="true"] > p { font-weight: 500; }
.dsh-top100 .confirm-followup { margin: 14px 0 0; font-size: 14px; line-height: 22px; color: var(--t100-body); }
.dsh-top100 .confirm-evidence {
  margin-top: 16px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--t100-body);
  font-size: 12px;
  line-height: 20px;
}
.dsh-top100 .confirm-evidence summary {
  padding: 0;
  color: var(--t100-ink);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.dsh-top100 .confirm-evidence dl { margin: 12px 0 0; padding: 12px; border-radius: 6px; background: color-mix(in srgb, var(--t100-ink) 4%, var(--t100-surface)); }
.dsh-top100 .confirm-evidence dl > div { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 10px; }
.dsh-top100 .confirm-evidence dl > div + div { margin-top: 10px; }
.dsh-top100 .confirm-evidence dd { min-width: 0; margin: 0; }
.dsh-top100 .confirm-footer {
  padding: 16px 24px 20px;
  border-top: 1px solid var(--t100-line);
  background: var(--t100-surface);
}
.dsh-top100 .confirm-caveat {
  margin: 0;
  color: var(--t100-body);
  font-size: 12px;
  line-height: 18px;
}
.dsh-top100 .script-evidence {
  display: grid;
  grid-template-columns: auto 14px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--t100-ink) 4%, var(--t100-surface));
}
.dsh-top100 .script-evidence span {
  color: var(--t100-body);
  font: 400 13px/20px ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
}
.dsh-top100 .risk-list {
  display: grid;
  gap: 12px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.dsh-top100 .risk-list:empty { display: none; }
.dsh-top100 .risk-list li {
  display: grid;
  gap: 4px;
  font-size: 13px;
  line-height: 20px;
}
.dsh-top100 .risk-list strong { font-weight: 600; }
.dsh-top100 .risk-list li[data-severity="warning"] { border-left: 3px solid #b77912; padding-left: 12px; }
.dsh-top100 .risk-list span { color: var(--t100-body); white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-top100 .risk-approval {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 12px 0 0;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}
.dsh-top100 .risk-approval input { flex: 0 0 16px; width: 16px; height: 16px; margin: 3px 0 0; accent-color: var(--t100-accent); }
.dsh-top100 .confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.dsh-top100 .confirm-actions button { min-width: 88px; height: 40px; padding: 0 16px; font-size: 14px; font-weight: 500; }
.dsh-top100 .confirm-actions button.primary { font-weight: 600; }
.dsh-top100 .confirm-actions button.primary:disabled { color: var(--t100-body); background: var(--t100-fill); border-color: var(--t100-line); opacity: 1; cursor: not-allowed; }
.dsh-top100 button:focus-visible,
.dsh-top100 input:focus-visible,
.dsh-top100 select:focus-visible,
.dsh-top100 summary:focus-visible {
  outline: 2px solid var(--t100-accent);
  outline-offset: 2px;
}
.dsh-top100 code {
  font-size: 12px;
  word-break: break-all;
}
@container (max-width: 420px) {
  .dsh-top100 .market-head { grid-template-columns: 40px minmax(0, 1fr); gap: 10px; }
  .dsh-top100 .rank-mark { width: 40px; height: 40px; border-radius: 12px; }
  .dsh-top100 .rank-mark svg { width: 34px; height: 34px; }
  .dsh-top100 .meta { gap: 3px 10px; }
  .dsh-top100 .toolbar { flex-wrap: wrap; }
  .dsh-top100 .search-cluster { flex-basis: 100%; }
  .dsh-top100 .search-cluster > button.primary { flex: 0 0 auto; }
  .dsh-top100 .catalog-navigation { gap: 4px; }
  .dsh-top100 .market-filter-row { width: 100%; flex-wrap: wrap; }
  .dsh-top100 .market-category-menu { flex: 1 1 150px; }
  .dsh-top100 .market-category-popover { width: min(330px, calc(100vw - 36px)); }
  .dsh-top100 .ranking-context { flex-wrap: wrap; }
  .dsh-top100 .card-footer { grid-template-columns: minmax(0, 1fr); align-items: stretch; }
  .dsh-top100 .managed-list .row-actions { grid-column: 1 / -1; }
  .dsh-top100 .actions { flex-wrap: wrap; }
  .dsh-top100 .detail-drawer { width: 100%; padding: 15px; }
  .dsh-top100 .detail-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dsh-top100 .detail-actions { margin: auto -15px -15px; padding: 11px 15px 15px; }
  .dsh-top100 .install-activity-banner { align-items: stretch; flex-direction: column; }
  .dsh-top100 .install-activity-banner > div { justify-content: space-between; }
  .dsh-top100 .install-activity-banner > button { width: 100%; }
  .dsh-top100 .install-activity-mask { padding: 8px; }
  .dsh-top100 .install-activity-dialog { width: calc(100vw - 16px); max-height: calc(100vh - 16px); }
  .dsh-top100 .install-activity-head { padding: 15px 15px 12px; }
  .dsh-top100 .install-activity-list { padding: 12px 15px; }
}
@media (max-width: 720px) {
  .dsh-top100 .diag-grid { grid-template-columns: 1fr; }
  .dsh-top100 .actions .job { flex: 1 1 100%; width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-top100 .ranking-card { transition: none; }
  .dsh-top100 .detail-drawer { animation: none; }
  .dsh-top100 .install-activity-dialog { animation: none; }
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
	title: "dsh-top100",
	subtitle: "发现、核对并安装 DSH 插件",
	rankings: "插件市场",
	installedPage: "已安装",
	diagnostics: "诊断",
	search: "搜索",
	searchPlaceholder: "搜索名称、简介或标签",
	searchResults: "搜索结果",
	catalogMatches: "全库匹配",
	showingResults: "已显示",
	catalogRank: "全库排名",
	filter: "筛选",
	filterHint: "调整榜单的收录范围。",
	catalogScope: "市场范围",
	catalogScope_plugins: "插件",
	catalogScope_skills: "Skills",
	catalogScope_ecosystem: "生态项目",
	catalogScopeHint_plugins: "已验证为 DSH Plugin；安装能力作为独立条件筛选",
	catalogScopeHint_skills: "独立 Skills 技能库，不参与 Plugin 排名",
	catalogScopeHint_ecosystem: "经确认与 DSH 相关的应用和外围项目，不参与排名",
	exploreMore: "探索更多",
	installAvailability: "安装来源",
	installAvailability_installable: "有安装源",
	installAvailability_all: "全部插件",
	installAvailability_unavailable: "未识别安装源",
	installableOnly: "仅看有安装源",
	sortBy: "排序",
	starsSort: "GitHub Stars",
	starsShort: "Stars",
	starsBrowsing: "按 Stars 浏览",
	allCategories: "全部分类",
	categoryRanking: "分类筛选结果",
	hot: "综合热度",
	rising: "新锐榜",
	total: "总榜",
	category: "分类筛选",
	categoryFilter: "插件分类",
	skillCategoryFilter: "Skill 分类",
	hideSkills: "Skills 技能库",
	hideSkillsHint: "Skills 使用独立目录，不参与 Plugin 排名",
	hiddenSkillsPrefix: "已隐藏",
	skillRepositories: "个 Skill 仓库",
	showCandidates: "探索候选与生态项目",
	showCandidatesHint: "同时显示当前不能直接安装的候选项目",
	clearFilters: "清除筛选",
	entries: "项",
	pluginEntries: "个插件",
	skillEntries: "个 Skills",
	cachedFresh: "本地快照可用",
	cachedStale: "正在显示较旧快照",
	cacheAgeUnknown: "缓存时间未知",
	minutesAgo: "分钟前获取",
	hoursAgo: "小时前获取",
	cacheFallback: "使用快照原因",
	updated: "数据日期",
	source: "数据源",
	empty: "此范围内没有匹配项目",
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
	installTaskRunning: "安装任务正在运行",
	installTaskComplete: "安装任务已有结果",
	viewInstallProgress: "查看安装进度",
	viewInstallResult: "查看安装结果",
	installActivityTitle: "安装任务",
	installActivityActiveHint: "安装会在后台继续；关闭窗口不会中断任务。",
	installActivityCompleteHint: "任务已经结束，可在这里查看结果或重新尝试。",
	installTaskRecovered: "已恢复上次未完成的安装任务。",
	installTaskUnavailable: "上次安装任务已随 DSH 重启结束，无法恢复进度；请检查已安装与诊断页面确认最终状态。",
	cancelFailed: "取消请求失败，任务可能仍在运行；正在继续读取权威状态。",
	closeInstallActivity: "关闭安装窗口",
	continueBrowsing: "继续浏览",
	batchSucceeded: "成功",
	batchFailed: "失败",
	batchCancelled: "取消",
	batchActive: "进行中",
	batchRestartRequired: "待重启",
	batchConfigurationRequired: "待配置",
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
	browseOnly: "未识别安装源",
	browseOnlyHint: "暂未识别到匹配当前项目的安装源，不代表无法安装；请前往 GitHub 查看说明。",
	capabilityReady: "已识别安装源",
	capabilityReadyReason: "点击后核对精确来源与脚本；识别到安装源不保证安装成功或通过安全审核",
	capabilityManual: "安装后需配置",
	capabilityManualReason: "目录提供安装目标，但作者标注安装后还需配置",
	capabilityBrowse: "生态项目",
	capabilityUnavailable: "未识别安装源",
	capabilityNoSourceReason: "暂未识别到匹配的安装源，不代表无法安装；请查看项目说明",
	capabilityUnverifiedReason: "尚未确认符合 DSH 插件结构",
	capabilityInstalled: "已安装",
	capabilityInstalledReason: "当前 Profile 已包含这个项目",
	viewDetails: "查看详情",
	reviewInstall: "安装",
	viewProject: "查看项目",
	closeDetails: "关闭详情",
	readmeSummary: "README 摘要",
	detailRefreshing: "正在读取权威详情…",
	detailFallback: "权威详情暂时不可用，以下显示榜单摘要",
	installDecision: "安装决策",
	installAvailableTitle: "可以在 DSH 中预检安装",
	installAvailableHint: "继续后会先核对精确版本、仓库身份、内容完整性和安装脚本，再由你确认是否写入。",
	installUnavailableTitle: "暂不支持在 DSH 内安装",
	installedDecisionTitle: "已安装到当前 Profile",
	installedDecisionHint: "前往已安装管理，可以启停、更新或卸载这个项目。",
	installContextMissing: "目录未提供权限、账号和首次使用说明；继续前请查看作者文档。",
	afterInstall: "安装后",
	afterInstallConfigure: "完成作者要求的配置，再验证插件是否运行",
	afterInstallVerify: "可能需要重启 DSH，再验证插件是否运行",
	projectAndRankingDetails: "项目与排名信息",
	reviewAndInstall: "核对并安装",
	trustDetails: "信任证据",
	projectType: "项目形态",
	license: "许可证",
	lastMaintained: "最近维护",
	language: "主要语言",
	homepage: "项目主页",
	configurationRequirement: "额外配置",
	configurationRequiredUnknown: "需要；具体步骤由作者文档说明",
	configurationNotDeclared: "目录未标注；安装前仍应核对作者文档",
	notSecurityReview: "这里核对的是结构与来源一致性，不是代码安全认证。",
	notAvailable: "暂无",
	catalogInstallSource: "目录安装源",
	installing: "安装中",
	confirmTitle: "确认安装",
	confirmProjectTitle: "安装 {name}？",
	confirmScripts: "安装时将执行脚本：",
	confirmRestart: "安装后需重启 DSH，并检查插件是否正常运行。",
	confirmSecurityNote: "来源校验不等于安全审核。",
	confirmBody: "确认后，将写入当前 DSH 配置或 Skills 目录。",
	installSummary: "安装影响",
	sourceMatched: "版本已固定，仓库身份匹配",
	sourceIdentityUnavailable: "版本已固定，发布者身份待人工确认",
	commitLocked: "仓库 commit 已固定",
	willRunScriptsPrefix: "将执行",
	buildScriptsUnit: "个 npm 生命周期脚本",
	noBuildScripts: "未发现 npm 生命周期脚本",
	restartAfterInstall: "安装后需重启验证",
	noRestartRequired: "无需重启",
	viewInstallTechnicalEvidence: "来源与校验详情",
	viewTechnicalEvidence: "查看技术证据",
	confirmSpec: "安装源",
	requestedSource: "目录声明",
	resolvedSource: "实际安装",
	integrity: "内容完整性",
	riskApproval: "我已核对安装来源、脚本与风险，同意安装。",
	confirmNeedConfig: "这个插件可能还需要额外配置。",
	confirm: "开始安装",
	cancel: "取消",
	github: "GitHub",
	more: "加载更多",
	stars: "Stars",
	weekly: "7日",
	daily: "今日",
	hotScore: "热度分",
	basis_hot: "排序依据：日增、周增、增长率、活跃度、质量与总热度",
	basis_rising: "排序依据：今日新增 Stars",
	basis_total: "排序依据：GitHub Stars 总数",
	basis_category: "分类筛选保持总榜顺序",
	basis_search: "搜索结果按名称与内容相关性排序",
	basisShort_hot: "综合热度榜",
	basisShort_rising: "今日增长榜",
	basisShort_total: "Stars 总榜",
	basisShort_category: "分类筛选",
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
	installProgressEstimate: "阶段",
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
	trust_indexed: "已收录，结构待确认",
	trust_structured: "符合 DSH 插件结构",
	"trust_install-source": "目录含安装目标",
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
	"activation_configuration-required": "状态：已安装，完成作者要求的配置后再验证",
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
	title: "dsh-top100",
	subtitle: "Discover, review, and install DSH plugins",
	rankings: "Marketplace",
	installedPage: "Installed",
	diagnostics: "Diagnostics",
	search: "Search",
	searchPlaceholder: "Search name, summary, or tags",
	searchResults: "Search results",
	catalogMatches: "Catalog matches",
	showingResults: "showing",
	catalogRank: "Catalog rank",
	filter: "Filters",
	filterHint: "Adjust which catalog entries are included.",
	catalogScope: "Marketplace scope",
	catalogScope_plugins: "Plugins",
	catalogScope_skills: "Skills",
	catalogScope_ecosystem: "Ecosystem",
	catalogScopeHint_plugins: "Verified DSH Plugins; installation availability is filtered separately",
	catalogScopeHint_skills: "A separate Skills library that does not participate in Plugin rankings",
	catalogScopeHint_ecosystem: "Confirmed DSH apps and related projects that do not participate in rankings",
	exploreMore: "Explore more",
	installAvailability: "Install source",
	installAvailability_installable: "Source identified",
	installAvailability_all: "All plugins",
	installAvailability_unavailable: "No install source identified",
	installableOnly: "With install source only",
	sortBy: "Sort",
	starsSort: "GitHub Stars",
	starsShort: "Stars",
	starsBrowsing: "Browse by Stars",
	allCategories: "All categories",
	categoryRanking: "Category ranking",
	hot: "Trending",
	rising: "Rising",
	total: "All",
	category: "Category filter",
	categoryFilter: "Plugin category",
	skillCategoryFilter: "Skill category",
	hideSkills: "Skills directory",
	hideSkillsHint: "Skills use a separate directory and do not participate in Plugin rankings",
	hiddenSkillsPrefix: "Hidden",
	skillRepositories: "Skill repositories",
	showCandidates: "Explore candidates and ecosystem projects",
	showCandidatesHint: "Also show candidates that cannot currently be installed directly",
	clearFilters: "Clear filters",
	entries: "entries",
	pluginEntries: "plugins",
	skillEntries: "Skills",
	cachedFresh: "Local snapshot available",
	cachedStale: "Showing an older snapshot",
	cacheAgeUnknown: "cache age unknown",
	minutesAgo: "minutes ago",
	hoursAgo: "hours ago",
	cacheFallback: "Snapshot fallback",
	updated: "Snapshot",
	source: "Source",
	empty: "No matching projects in this section",
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
	installTaskRunning: "Installation in progress",
	installTaskComplete: "Installation result available",
	viewInstallProgress: "View install progress",
	viewInstallResult: "View install result",
	installActivityTitle: "Installation task",
	installActivityActiveHint: "Installation continues in the background; closing this window will not interrupt it.",
	installActivityCompleteHint: "The task has finished. Review the result or try again here.",
	installTaskRecovered: "Recovered the previous active installation task.",
	installTaskUnavailable: "The previous task ended when DSH restarted and its progress cannot be recovered. Check Installed and Diagnostics for the final state.",
	cancelFailed: "The cancel request failed. The task may still be running; authoritative status polling will continue.",
	closeInstallActivity: "Close installation window",
	continueBrowsing: "Continue browsing",
	batchSucceeded: "Succeeded",
	batchFailed: "Failed",
	batchCancelled: "Cancelled",
	batchActive: "Active",
	batchRestartRequired: "Restart pending",
	batchConfigurationRequired: "Configuration pending",
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
	browseOnly: "No install source identified",
	browseOnlyHint: "No matching install source has been identified; this does not mean installation is impossible. Check GitHub for instructions.",
	capabilityReady: "Install source identified",
	capabilityReadyReason: "Review exact source and scripts after click; source recognition does not guarantee installation or security",
	capabilityManual: "Configure after install",
	capabilityManualReason: "The catalog has an install target, and the author marks additional configuration as required",
	capabilityBrowse: "Ecosystem project",
	capabilityUnavailable: "No install source identified",
	capabilityNoSourceReason: "No matching source has been identified yet; check the project instructions for other installation methods",
	capabilityUnverifiedReason: "DSH plugin structure has not been confirmed",
	capabilityInstalled: "Installed",
	capabilityInstalledReason: "This item is already in the current profile",
	viewDetails: "View details",
	reviewInstall: "Install",
	viewProject: "View project",
	closeDetails: "Close details",
	readmeSummary: "README summary",
	detailRefreshing: "Loading authoritative details…",
	detailFallback: "Authoritative details are unavailable; showing the ranking summary",
	installDecision: "Install decision",
	installAvailableTitle: "Available for DSH preflight",
	installAvailableHint: "Continue to verify the exact version, repository identity, content integrity, and install scripts before anything is written.",
	installUnavailableTitle: "Not installable inside DSH",
	installedDecisionTitle: "Installed in the current profile",
	installedDecisionHint: "Open Installed management to enable, disable, update, or uninstall this item.",
	installContextMissing: "Permissions, accounts, and first-use instructions are not in the catalog; review the author's documentation before continuing.",
	afterInstall: "After installation",
	afterInstallConfigure: "Complete the author's configuration, then verify that the plugin is running",
	afterInstallVerify: "You may need to restart DSH, then verify that the plugin is running",
	projectAndRankingDetails: "Project and ranking details",
	reviewAndInstall: "Review and install",
	trustDetails: "Trust evidence",
	projectType: "Project type",
	license: "License",
	lastMaintained: "Last maintained",
	language: "Primary language",
	homepage: "Project homepage",
	configurationRequirement: "Additional configuration",
	configurationRequiredUnknown: "Required; consult the author's documentation for the exact steps",
	configurationNotDeclared: "Not declared in the catalog; still check the author's documentation",
	notSecurityReview: "This checks structure and source consistency; it is not a code security certification.",
	notAvailable: "Not available",
	catalogInstallSource: "Catalog install source",
	installing: "Installing",
	confirmTitle: "Confirm installation",
	confirmProjectTitle: "Install {name}?",
	confirmScripts: "Installation will run these scripts:",
	confirmRestart: "Restart DSH after installation and check that the plugin is running.",
	confirmSecurityNote: "Source verification is not a security review.",
	confirmBody: "Once confirmed, this writes to your current DSH profile or Skills directory.",
	installSummary: "Installation effects",
	sourceMatched: "Version pinned; repository identity matched",
	sourceIdentityUnavailable: "Version pinned; publisher identity needs manual review",
	commitLocked: "Repository commit pinned",
	willRunScriptsPrefix: "Will run",
	buildScriptsUnit: "npm lifecycle script(s)",
	noBuildScripts: "No npm lifecycle scripts detected",
	restartAfterInstall: "Restart to verify",
	noRestartRequired: "No restart required",
	viewInstallTechnicalEvidence: "Source and verification details",
	viewTechnicalEvidence: "View technical evidence",
	confirmSpec: "Install spec",
	requestedSource: "Catalog source",
	resolvedSource: "Resolved install",
	integrity: "Integrity",
	riskApproval: "I reviewed the install source, scripts, and risks and agree to install.",
	confirmNeedConfig: "This plugin may require extra configuration.",
	confirm: "Start install",
	cancel: "Cancel",
	github: "GitHub",
	more: "Load more",
	stars: "Stars",
	weekly: "7d",
	daily: "Today",
	hotScore: "Heat score",
	basis_hot: "Ranked by daily and weekly growth, growth rate, activity, quality, and popularity",
	basis_rising: "Ranked by Stars gained today",
	basis_total: "Ranked by total GitHub Stars",
	basis_category: "Category filters retain the overall ranking order",
	basis_search: "Search results are ranked by name and content relevance",
	basisShort_hot: "Composite heat",
	basisShort_rising: "Today's growth",
	basisShort_total: "Stars ranking",
	basisShort_category: "Category filter",
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
	installProgressEstimate: "Stage",
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
	trust_indexed: "Listed; structure unconfirmed",
	trust_structured: "Matches the DSH plugin structure",
	"trust_install-source": "Catalog has an install target",
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
	"activation_configuration-required": "Status: installed; complete the author's configuration before verification",
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