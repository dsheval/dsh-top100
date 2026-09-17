/** Production-scale, synthetic-only regression; never reads production data. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const count = 24_000, skills = 1_600, rssLimitMiB = 1_792;
const mode = process.argv[2];
const directory = process.argv[3];

if (mode === '--seed') {
  const { openDatabase, importMarketData, dateInTimeZone } = await import('../collector/src/database.ts');
  const today = dateInTimeZone(new Date(), 'Asia/Shanghai');
  const plugins = Array.from({ length: count }, (_, i) => ({
    id: `memory-fixture/plugin-${i}`, fullName: `memory-fixture/plugin-${i}`,
    owner: 'memory-fixture', name: `plugin-${i}`, repo: `plugin-${i}`,
    type: i < skills ? 'skill' : 'cordis-plugin', stars: count - i, forks: 2, openIssues: 1,
    description: 'A project testing extension', descriptionZh: '为项目提供测试结果查看和开发配置管理功能。',
    readmeSummary: (`Project ${i} provides test reports, project settings, and development configuration. `).repeat(20).slice(0, 1200),
    language: 'TypeScript', license: 'MIT', homepage: null, curated: false,
    topics: ['dsh-plugin', 'testing'], tags: ['测试', '开发'], sources: ['synthetic-memory-fixture'],
    install: { method: i < skills ? 'skills-add' : 'pnpm-profile', needsConfig: false,
      packageName: `memory-fixture-${i}`, repositoryPath: `packages/plugin-${i}` },
    categories: [{ id: 'coding', confidence: 1, evidence: 'Synthetic project testing fixture', source: 'manual' }],
    score: { total: 80, breakdown: { maintain: 80, practical: 80, popularity: 80, ease: 80, signal: 80 }, confidence: 1, explanation: 'fixture' },
    pushedAt: `${today}T00:00:00Z`, updatedAt: `${today}T00:00:00Z`,
    createdAt: '2026-01-01T00:00:00Z', lastCheckedAt: `${today}T00:00:00Z`,
  }));
  const market = { schemaVersion: 2, generatedAt: `${today}T00:00:00Z`, plugins };
  mkdirSync(join(directory, 'data'), { recursive: true });
  const db = openDatabase({ path: join(directory, 'market.sqlite') });
  try {
    for (const offset of [7, 3, 1]) {
      const day = new Date(`${today}T12:00:00Z`); day.setUTCDate(day.getUTCDate() - offset);
      for (const plugin of plugins) plugin.starsObservedAt = new Date(Date.now() - offset * 86400000).toISOString();
      importMarketData(db, market, { snapshotDate: day.toISOString().slice(0, 10) });
    }
  } finally { db.close(); }
  for (const plugin of plugins) { plugin.stars += 3; plugin.starsObservedAt = new Date().toISOString(); }
  writeFileSync(join(directory, 'data/plugins.json'), JSON.stringify(market));
} else if (mode === '--preview') {
  const { DatabaseSync } = await import('node:sqlite');
  const { buildRankings } = await import('../collector/src/rankings.ts');
  const { dateInTimeZone } = await import('../collector/src/database.ts');
  const market = JSON.parse(readFileSync(join(directory, 'data/plugins.json'), 'utf8'));
  const db = new DatabaseSync(join(directory, 'market.sqlite'), { readOnly: true });
  try {
    for (let i = 0; i < 3; i++) {
      const rankings = buildRankings(db, dateInTimeZone(new Date(), 'Asia/Shanghai'), join(root, 'config/ranking.json'), { sources: market.plugins });
      assert.equal(rankings.rankings.total.length, count - skills);
      assert.equal(rankings.directories.skills.length, skills);
      assert.equal(rankings.rankings.rising[0].dailyStars, 3);
    }
  } finally { db.close(); }
  const peakMiB = Math.ceil(process.resourceUsage().maxRSS / 1024);
  assert.ok(peakMiB <= rssLimitMiB, `preview peak ${peakMiB} MiB exceeds ${rssLimitMiB}`);
  console.log(JSON.stringify({ phase: 'repeated-previews', count, peakMiB }));
} else if (mode === '--audit') {
  const { auditPublication } = await import('../collector/src/operation-audit.ts');
  const { dateInTimeZone } = await import('../collector/src/database.ts');
  const audit = await auditPublication({ publicDirectory: join(directory, 'public'), expectedDate: dateInTimeZone(new Date(), 'Asia/Shanghai') });
  assert.equal(audit.pluginCount, count - skills);
  assert.equal(audit.skillCount, skills);
  for (const board of Object.values(audit.boards)) {
    assert.equal(board.total, 100);
    // Synthetic entries do not invent verified source evidence. Description
    // holds remain valid; this check exercises publication integrity and memory.
  }
  console.log(JSON.stringify({ phase: 'publication-audited', assets: audit.localAssetsVerified, plugins: audit.pluginCount, skills: audit.skillCount }));
} else {
  assert.equal(mode, undefined, 'unexpected memory check argument');
  const temporary = mkdtempSync(join(tmpdir(), 'top100-publication-memory-'));
  // Explicitly empty these settings so .env cannot enable credentials or paid work.
  const env = { ...process.env, DSH_MONITOR_READ_ONLY: '1', DSH_DAILY_UPDATE: '0', DSH_OPERATION_DATE: '',
    DSH_MODEL_REQUESTS_ENABLED: '0', DSH_MODEL_BUDGET_CONFIG: '', DEEPSEEK_API_KEY: '', DEEPSEEK_API_KEY_FILE: '',
    GITHUB_TOKEN: '', INSTALL_ASSESSMENT_BATCH_SIZE: '0', NODE_OPTIONS: '', TZ: 'Asia/Shanghai',
    DATABASE_PATH: join(temporary, 'market.sqlite'), SOURCE_DATA_PATH: join(temporary, 'data/plugins.json'),
    PUBLIC_DATA_DIR: join(temporary, 'public') };
  const preload = ['--import', join(root, 'scripts/publication-memory-offline.mjs')];
  function run(args) {
    const result = spawnSync(process.execPath, [...preload, ...args], {
      cwd: root, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 ** 2,
    });
    // Only print bounded metrics and lifecycle lines, never the full generated catalog.
    for (const line of result.stdout?.split('\n') ?? []) {
      if (/^\[publication-|^\{"phase"|^SQLite import|^Published ranking/.test(line)) console.log(line);
    }
    assert.ifError(result.error);
    assert.equal(result.status, 0, `memory check failed (${result.signal ?? 'exit'}): ${result.stderr?.slice(-3000)}`);
    assert.match(result.stdout, /\[publication-offline\] \{"attempts":0\}/);
    return result.stdout;
  }
  try {
    const self = fileURLToPath(import.meta.url);
    for (const phase of ['--seed', '--preview']) run(['--max-old-space-size=768', '--import', 'tsx', self, phase, temporary]);
    const pkg = JSON.parse(readFileSync(join(root, 'collector/package.json'), 'utf8'));
    const [executable, ...args] = pkg.scripts['db:sync'].trim().split(/\s+/);
    assert.equal(executable, 'node');
    const script = args.pop();
    const output = run([...args, join(root, 'collector', script)]);
    const metrics = output.split('\n').filter(line => line.startsWith('[publication-memory] '))
      .map(line => JSON.parse(line.slice('[publication-memory] '.length)));
    assert.equal(metrics.at(-1)?.phase, 'exports-complete');
    const peakMiB = metrics.at(-1).peakMiB;
    assert.ok(peakMiB <= rssLimitMiB, `publication peak ${peakMiB} MiB exceeds ${rssLimitMiB}`);
    run(['--max-old-space-size=768', '--import', 'tsx', self, '--audit', temporary]);
    console.log(JSON.stringify({ check: 'production-scale-publication', count, peakMiB, rssLimitMiB, networkRequests: 0 }));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
