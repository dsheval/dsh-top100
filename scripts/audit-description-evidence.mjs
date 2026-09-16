#!/usr/bin/env node
/** Offline candidate planner. Never updates catalog/configuration or calls an API.
 * Run with node --import tsx scripts/audit-description-evidence.mjs --help.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { matchingEditorialHold } from '../collector/src/content-source.ts';
import { INSTALL_PARSER_VERSION } from '../collector/src/install-parse.ts';
import { canReuseDetectionCache } from '../collector/src/discovery-policy.ts';
import { summarizeSelectedReadme } from '../collector/src/reviewed-summary.ts';
import { cleanDescription, isPlaceholder, matchesReviewedReadme } from '../collector/src/description-rules.ts';

const HASH = value => createHash('sha256').update(value).digest('hex');
const safe = value => value.replace(/[^a-zA-Z0-9_.-]/g, '_');
const normalized = value => value ?? null;
const read = file => JSON.parse(file.endsWith('.gz') ? gunzipSync(fs.readFileSync(file)).toString() : fs.readFileSync(file, 'utf8'));
export const identity = row => [row.fullName.toLowerCase(), row.type ?? null, row.install?.packageName ?? null, row.install?.repositoryPath ?? null];
export function sameIdentity(a, b) { return JSON.stringify(identity(a)) === JSON.stringify(identity(b)); }
export function readmeCacheName(fullName, selectedPath, revision, branch) {
  const docPath = selectedPath ? `${selectedPath}/README.md` : 'README.md';
  return `v2_${HASH(JSON.stringify([fullName.toLowerCase(), docPath, revision, branch ?? 'HEAD']))}.json`;
}
export function cacheMatches(row, cache) {
  const d = cache?.detection;
  return Boolean(cache && row.pushedAt && canReuseDetectionCache(cache, row.pushedAt, INSTALL_PARSER_VERSION)
    && d?.isPlugin && d.type === row.type && d.packageName === row.install?.packageName
    && normalized(d.pluginPath) === normalized(row.install?.repositoryPath)
    && normalized(cache.subdir) === normalized(d.pluginPath)
    && d.evidence?.some(x => /validated (bundle|client|host) declaration and entry/.test(x)));
}
export function versionOnlyReadme(value) {
  // Whitelist only documentation labels. Do not strip versions from requirements,
  // API paths, tool names, feature statements, or arbitrary text.
  return value.replace(/((?:Current plugin release|Tested with DSH):?\s+)\d+\.\d+\.\d+(?:-[\w.-]+)?/g, '$1<VERSION>');
}
export function matchingHistory(row, histories) {
  const matches = [], rejected = [];
  for (const h of histories) {
    if (!sameIdentity(row, h.row)) continue;
    const text = cleanDescription(h.row.descriptionZh);
    if (!text || isPlaceholder(text) || !/[\u4e00-\u9fff]/.test(text)) continue;
    const sameReadme = matchesReviewedReadme(row.readmeSummary ?? '', h.row.readmeSummary ?? '');
    const sameDescription = (row.description ?? '') === (h.row.description ?? '');
    let match = null;
    if (sameReadme && sameDescription) match = 'exact-functional-source';
    else if (sameDescription && versionOnlyReadme(row.readmeSummary ?? '') === versionOnlyReadme(h.row.readmeSummary ?? '')) match = 'release-labels-only';
    // Description-only change is a review lead, never an automatic reuse decision.
    if (match && (text.length > 180 || (text.match(/[\u4e00-\u9fff]/g)?.length ?? 0) < 10 || !/[。！？]$/.test(text) || (cleanDescription(h.row.description) && cleanDescription(h.row.description).includes(text)))) {
      rejected.push({ file: h.file, text, reason: '旧文本是作者原描述／片段、过长双语文本或不完整功能中文，来源匹配仍不能自动复用。' });
      continue;
    }
    if (match) matches.push({ file: h.file, text, match, source: { description: h.row.description, readmeSummary: h.row.readmeSummary, identity: identity(h.row) } });
  }
  const values = [...new Set(matches.map(x => x.text))];
  return { matches, rejected, conflict: values.length > 1, text: values.length === 1 ? values[0] : null };
}
export function extractFunctionParagraphs(markdown) {
  const paragraphs = [];
  let skippedDepth = 0, code = false, buffer = [];
  const flush = () => { if (buffer.length) paragraphs.push(buffer.join(' ')); buffer = []; };
  for (const raw of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) { flush(); code = !code; continue; }
    if (code) continue;
    const heading = raw.match(/^\s*(#{1,6})\s+(.*)/);
    if (heading) {
      flush();
      if (skippedDepth && heading[1].length <= skippedDepth) skippedDepth = 0;
      if (/install|quick.?start|getting started|requirements?|dependencies|configuration|license|changelog|releas|verification|validation|publishing|development|安装|快速开始|配置|依赖|许可|更新日志|发布|验证|开发/.test(heading[2].toLowerCase())) skippedDepth ||= heading[1].length;
      continue;
    }
    if (skippedDepth) continue;
    if (!raw.trim()) { flush(); continue; }
    if (/^\s*[-+*]\s/.test(raw)) flush();
    buffer.push(raw);
  }
  flush();
  const result = [];
  for (const raw of paragraphs) {
    const line = raw.replace(/<[^>]*>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').replace(/^\s*[>+\-]\s*/, '').replace(/\s+/g, ' ').trim();
    if (line.length < 24 || line.length > 2500 || /^\s*\|/.test(line)) continue;
    if (/npm (?:install|i\b)|pnpm (?:add|install)|git clone|curl |API[_ -]?KEY\s*[=:]|令牌\s*[=:]|触发方式|源码验证|候选.*通过.*测试|^It supports @|^Errors:|^本地源码/.test(line)) continue;
    if (!/支持|提供|显示|读取|创建|编辑|管理|搜索|检索|记录|切换|预览|自动|导出|连接|\b(?:provides?|supports?|displays?|reads?|creates?|edits?|manages?|search|retriev\w*|records?|switch\w*|preview|connect\w*)\b/i.test(line)) continue;
    result.push(line);
    if (result.length === 6) break;
  }
  return result; // Retrieval heuristic, not semantic acceptance.
}
export function decide(row, audit, cache, document, histories, hold = matchingEditorialHold(row)) {
  const pkg = row.install?.packageName;
  const group = audit.offlineGroup;
  const sameCache = cacheMatches(row, cache);
  const expectedSummary = document?.text ? summarizeSelectedReadme(row.fullName, { packageName: pkg, repositoryPath: row.install?.repositoryPath ?? null }, document.text) : null;
  const boundDocument = Boolean(sameCache && document?.text && !document.conflict
    && matchesReviewedReadme(expectedSummary ?? '', cache.readmeSummary ?? '')
    && matchesReviewedReadme(expectedSummary ?? '', row.readmeSummary ?? ''));
  const paragraphs = boundDocument ? extractFunctionParagraphs(document.text) : [];
  const evidence = { cacheReused: sameCache, packageReadmeBound: boundDocument, functionExcerpts: paragraphs,
    structureBasis: sameCache ? 'same-revision-historical-detection' : row.install?.discovery?.status === 'verified' ? 'frozen-discovery-record' : 'unresolved',
    runtimeInstallVerified: false, readmeConflict: Boolean(document?.conflict) };
  const result = (queue, reason, extra = {}) => ({ queue, reason, evidence, requiresReviewBeforeApply: true, ...extra });
  if (pkg === '@deepseek-ai/dsh-root' || group === 'dependency-library') return result('identity', '所选根包／依赖对象须更正或确认；不继承根产品功能。', { alternativePaths: cache?.detection?.pluginPaths?.filter(p => p !== (row.install?.repositoryPath ?? '.')) ?? [] });
  if (['identity-change', 'manual-evidence', 'scoped-function', 'fixed-evidence-hold', 'notice-replacement'].includes(group)) return result('exceptions', '保留身份／固定复核／人工资料约束，自动内容候选不越过此门槛。');
  // Only the generic package-name heuristic may be satisfied by independently
  // bound selected-package README provenance. All other holds remain effective.
  const genericHold = hold?.reason === '当前摘要未标明所选子包或路径，需取得子包自身 README 后再生成内容。';
  if (hold && !(genericHold && boundDocument)) return result('exceptions', hold.reason);
  const lifecycleWarning = boundDocument && /this plugin is no longer maintained|^\s*[># ]*.*\bDISCONTINUED\b|本插件.{0,20}(?:停止维护|不再维护)/im.test(document.text.slice(0,2500));
  if (lifecycleWarning) return result('exceptions', '作者明确声明停止维护，须先核对适用版本与替代功能，不能直接补成推荐简介。');
  const structural = sameCache || (row.install?.discovery?.status === 'verified'
    && row.install.discovery.sourceRevision === row.pushedAt);
  if (!structural) return result('exceptions', '缺少匹配当前冻结版本的结构记录；需定向补证。');
  const history = matchingHistory(row, histories);
  if (history.conflict) return result('exceptions', '相同功能来源存在冲突中文，需人工选择。', { history });
  if (history.text) return result('reuse', '历史中文来源精确匹配，或仅白名单发行文案变化；生成独立复用候选。', { history, proposedDescriptionZh: history.text });
  if (boundDocument && paragraphs.length) return result('writing', '已定位所选包自身完整资料；功能段已提取，待内容复核后补写。', { rejectedHistoricalText: history.rejected });
  return result('exceptions', boundDocument ? '完整包级资料已绑定，但自动未提取到功能段；保留人工核实。' : '缺少可绑定当前包与版本的完整功能资料。');
}
function indexFiles(dir) {
  const index = new Map();
  if (fs.existsSync(dir)) for (const name of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const key = name.toLowerCase();
    if (index.has(key)) throw new Error(`Ambiguous case-folded cache: ${key}`);
    index.set(key, path.join(dir, name));
  }
  return index;
}
function lookupDocument(row, cacheRoot, rootsIndex) {
  const rootKey = `${safe(`${row.fullName}:${row.pushedAt}`)}.json`.toLowerCase();
  const rootFile = rootsIndex.get(rootKey);
  const branches = new Set();
  if (rootFile) {
    for (const item of read(rootFile)) {
      if (!item.url) continue;
      const url = new URL(item.url);
      if (url.hostname !== 'api.github.com' || !url.pathname.toLowerCase().startsWith(`/repos/${row.fullName.toLowerCase()}/contents`)) continue;
      const ref = url.searchParams.get('ref'); if (ref) branches.add(ref);
    }
  }
  // Without a branch recorded in source directory evidence, do not guess main/master.
  const found = [];
  for (const branch of branches) {
    const file = path.join(cacheRoot, 'readmes', readmeCacheName(row.fullName, row.install?.repositoryPath, row.pushedAt, branch));
    if (!fs.existsSync(file)) continue;
    const text = read(file);
    if (typeof text === 'string' && text) found.push({ text, file, branch, rootFile, sha256: HASH(fs.readFileSync(file)) });
  }
  if (!found.length) return null;
  return { ...found[0], conflict: new Set(found.map(x => x.text)).size > 1 };
}
export function run({ inventory, snapshot, cacheRoot, output, historyFiles = [] }) {
  cacheRoot = path.resolve(cacheRoot);
  historyFiles = historyFiles.map(file => path.resolve(file));
  const audited = read(inventory); const frozen = read(snapshot);
  const current = new Map(frozen.rankings.total.map(x => [x.fullName.toLowerCase(), x]));
  const historyIndex = new Map();
  for (const file of historyFiles) {
    const d = read(file);
    for (const row of d.plugins ?? d.rankings.total) {
      const key = row.fullName.toLowerCase();
      historyIndex.set(key, [...(historyIndex.get(key) ?? []), { file, row }]);
    }
  }
  const detect = indexFiles(path.join(cacheRoot, 'detect'));
  const roots = indexFiles(path.join(cacheRoot, 'roots'));
  const outputDir = path.resolve(output);
  const inputs = [inventory, snapshot, ...historyFiles].map(x => path.resolve(x));
  const protectedRoots = [path.resolve(cacheRoot), path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'collector', 'config')];
  if (inputs.some(x => x === outputDir || x.startsWith(outputDir + path.sep)) || protectedRoots.some(x => outputDir === x || outputDir.startsWith(x + path.sep))) throw new Error('Output must be separate from input/cache/configuration');
  fs.mkdirSync(outputDir, { recursive: true });
  const seen = new Set(), rows = [], failures = [], evidenceHashes = new Map();
  for (const audit of audited.rows) {
    const key = audit.fullName.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate input identity: ${audit.fullName}`); seen.add(key);
    const row = current.get(key); if (!row) throw new Error(`Missing frozen entry: ${audit.fullName}`);
    for (const f of ['description', 'readmeSummary']) if ((audit[f] ?? '') !== (row[f] ?? '')) throw new Error(`Stale inventory ${audit.fullName}: ${f}`);
    if (normalized(audit.packageName) !== normalized(row.install?.packageName) || normalized(audit.repositoryPath) !== normalized(row.install?.repositoryPath)) throw new Error(`Stale identity: ${audit.fullName}`);
    let cache = null, document = null;
    const cacheFile = detect.get(`${safe(row.fullName)}.json`.toLowerCase());
    try {
      if (cacheFile) { cache = read(cacheFile); evidenceHashes.set(cacheFile, HASH(fs.readFileSync(cacheFile))); }
      if (cacheMatches(row, cache)) {
        document = lookupDocument(row, cacheRoot, roots);
        if (document) for (const file of [document.file, document.rootFile]) evidenceHashes.set(file, HASH(fs.readFileSync(file)));
      }
    } catch (error) { failures.push({ fullName: row.fullName, reason: error.message }); cache = null; document = null; }
    const decision = decide(row, audit, cache, document, historyIndex.get(key) ?? []);
    rows.push({ fullName: row.fullName, rank: audit.rank, oldGroup: audit.offlineGroup, packageName: row.install?.packageName ?? null,
      repositoryPath: row.install?.repositoryPath ?? null, frozenPushedAt: row.pushedAt, sourceHash: audit.sourceHash,
      ...decision, detectionCache: cacheFile ?? null, readme: document ? { path: document.file, branch: document.branch, sourceRootCache: document.rootFile, sha256: document.sha256, bytes: Buffer.byteLength(document.text) } : null });
  }
  const counts = Object.fromEntries(['reuse', 'writing', 'identity', 'exceptions'].map(q => [q, rows.filter(r => r.queue === q).length]));
  const summary = { total: rows.length, counts, matchingDetectionCache: rows.filter(x => x.evidence.cacheReused).length,
    boundPackageReadmes: rows.filter(x => x.evidence.packageReadmeBound).length, exactPackageReadmesLocated: rows.filter(x => x.readme).length,
    parsingFailures: failures, actualApiRequests: 0, paidModelRequests: 0, productionModified: false, candidatesApplied: 0,
    scope: 'frozen snapshot; cache reuse is not current online validation or runtime installation',
    inputs: inputs.map(file => ({ file, sha256: HASH(fs.readFileSync(file)) })),
    policyFiles: ['../collector/config/editorial-holds.json', '../collector/config/reviewed-plugin-targets.json', '../collector/config/reviewed-function-evidence.json', '../collector/config/reviewed-descriptions.json', '../collector/src/content-source.ts', '../collector/src/discovery-policy.ts', '../collector/src/selected-readme.ts', '../collector/src/summary.ts', '../collector/src/reviewed-summary.ts', '../collector/src/install-parse.ts', '../collector/src/description-rules.ts', './audit-description-evidence.mjs'].map(relative => { const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), relative); return {file, sha256: HASH(fs.readFileSync(file))}; }),
    evidenceFiles: [...evidenceHashes].map(([file, sha256]) => ({ file, sha256 })) };
  const save = (name, data) => fs.writeFileSync(path.join(outputDir, name), JSON.stringify(data, null, 2) + '\n');
  save('results.json', { summary, rows }); save('summary.json', summary);
  for (const queue of Object.keys(counts)) save(`${queue}.json`, rows.filter(r => r.queue === queue));
  save('fetch-plan.json', { enabled: false, actualRequests: 0, purpose: 'Unresolved evidence work, not an authorized network batch', items: rows.filter(r => r.queue === 'exceptions').map(r => ({ fullName: r.fullName, packageName: r.packageName, repositoryPath: r.repositoryPath, reason: r.reason, requiresCurrentCommit: true })) });
  return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) console.log('Offline only: node --import tsx scripts/audit-description-evidence.mjs --inventory FILE --snapshot FILE --cache DIR --out DIR [--history FILE ...]');
  else {
    const options = { historyFiles: [] }; const keys = { '--inventory': 'inventory', '--snapshot': 'snapshot', '--cache': 'cacheRoot', '--out': 'output' };
    for (let i = 0; i < args.length; i += 2) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value: ${args[i]}`);
      if (args[i] === '--history') options.historyFiles.push(args[i + 1]);
      else if (keys[args[i]]) options[keys[args[i]]] = args[i + 1]; else throw new Error(`Unknown option: ${args[i]}`);
    }
    if (Object.values(keys).some(k => !options[k])) throw new Error('Required arguments missing; use --help');
    globalThis.fetch = () => { throw new Error('Network is disabled in this offline audit'); };
    const s = run(options); console.log(JSON.stringify({ ...s, inputs: s.inputs.length, evidenceFiles: s.evidenceFiles.length, policyFiles: s.policyFiles.length }, null, 2));
  }
}
