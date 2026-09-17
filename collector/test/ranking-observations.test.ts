import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DshPlugin } from '@dsh-top100/schema';
import { openDatabase, importMarketData } from '../src/database.js';
import { buildRankings } from '../src/rankings.js';
import { stampRepositoryObservations } from '../src/github.js';
import { fetchRepositoryUpdates } from '../src/github-batch.js';

const dirs: string[] = [];
afterEach(() => { dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });
function plugin(name: string, stars: number, date?: string): DshPlugin {
  return { id: name, fullName: name, name: name.split('/')[1], repo: name.split('/')[1], owner: name.split('/')[0],
    type: 'cordis-plugin', stars, ...(date ? { starsObservedAt: `${date}T00:00:00.000Z` } : {}),
    forks: 0, openIssues: 0, description: 'Test project', descriptionZh: null, readmeSummary: null,
    language: null, license: null, homepage: null, tags: [], topics: [], sources: [], curated: false,
    pushedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    lastCheckedAt: '2026-09-17T00:00:00Z', install: { method: 'pnpm-profile', needsConfig: false },
    score: { total: 0, breakdown: { maintain: 0, practical: 0, popularity: 0, ease: 0, signal: 0 }, confidence: 0, explanation: '' } };
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'rank-observations-')); dirs.push(dir);
  const db = openDatabase({ path: join(dir, 'db.sqlite') });
  const put = (date: string, plugins: DshPlugin[]) => importMarketData(db, { schemaVersion: 2, generatedAt: `${date}T00:00:00Z`, plugins }, { snapshotDate: date });
  const rank = (sources?: DshPlugin[]) => buildRankings(db, '2026-09-17', resolve('../config/ranking.json'), { now: new Date('2026-09-17T01:00:00Z'), sources });
  return { db, put, rank, dir };
}
describe('observed repository attention', () => {
  it('never promotes legacy imports, source check times or cached previous-day values to successful observations', () => {
    const {db,put,rank}=fixture();
    try {
      put('2026-09-10',[plugin('a/legacy',10),plugin('a/stale',10,'2026-09-10')]);
      put('2026-09-17',[plugin('a/legacy',100),plugin('a/stale',10,'2026-09-10')]);
      const result=rank(); expect(result.rankings.hot).toEqual([]); expect(result.rankings.rising).toEqual([]);
      expect(result.rankings.total.every(row=>row.dailyStars===null && row.weeklyStars===null && row.hotScore===null)).toBe(true);
      expect(db.prepare('select stars_observed_at from repository_daily_stats where snapshot_date=?').all('2026-09-17')).toEqual([{stars_observed_at:null},{stars_observed_at:null}]);
    } finally {db.close();}
  });
  it('does not call a two-day gain daily growth and preserves a valid longer window', () => {
    const {db,put,rank}=fixture();
    try {
      put('2026-09-10',[plugin('a/project',100,'2026-09-10')]);
      put('2026-09-14',[plugin('a/project',110,'2026-09-14')]);
      put('2026-09-15',[plugin('a/project',112,'2026-09-15')]);
      put('2026-09-17',[plugin('a/project',120,'2026-09-17')]);
      expect(rank().rankings.total[0]).toMatchObject({dailyStars:null,threeDayStars:10,weeklyStars:20});
      expect(rank().rankings.rising).toHaveLength(1);
    } finally {db.close();}
  });
  it('keeps loss signed for display, clips scores and excludes low growth without padding', () => {
    const {db,put,rank}=fixture();
    try {
      for(const day of ['2026-09-10','2026-09-14','2026-09-16']) put(day,[plugin('a/loss',10,day),plugin('a/tiny',1,day),plugin('a/new',0,day)]);
      put('2026-09-17',[plugin('a/loss',8,'2026-09-17'),plugin('a/tiny',2,'2026-09-17'),plugin('a/new',3,'2026-09-17')]);
      const r=rank();expect(r.rankings.rising.map(x=>x.fullName)).toEqual(['a/new']);expect(r.rankings.hot).toEqual([]);
      expect(r.rankings.total.find(x=>x.fullName==='a/loss')).toMatchObject({dailyStars:-2,threeDayStars:-2,weeklyStars:-2,risingScore:0});
    } finally {db.close();}
  });
  it('balances scale, keeps strong large-project growth, and ignores description and commit changes', () => {
    const {db,put,rank}=fixture();
    try {
      for(const day of ['2026-09-10','2026-09-14']) put(day,[plugin('a/small',20,day),plugin('a/large',1000,day),plugin('a/fast',1000,day)]);
      const today=[plugin('a/small',30,'2026-09-17'),plugin('a/large',1010,'2026-09-17'),plugin('a/fast',1100,'2026-09-17')];
      const before=rank(today);expect(before.rankings.rising.map(x=>x.fullName)).toEqual(['a/fast','a/small','a/large']);
      today[0].descriptionZh='提供项目资料检索和整理功能。';today[0].readmeSummary='Complete';today[0].license='MIT';today[0].pushedAt='2026-09-17T00:00:00Z';
      const after=rank(today);expect(after.rankings.total.map(x=>[x.fullName,x.hotScore,x.risingScore])).toEqual(before.rankings.total.map(x=>[x.fullName,x.hotScore,x.risingScore]));
      put('2026-09-17',today);expect(rank().rankings).toEqual(after.rankings);
    } finally {db.close();}
  });
  it('maps rising scores to a fixed 100-point scale without changing order or depending on other projects', () => {
    const {db,put,rank}=fixture();
    try {
      put('2026-09-14',['half','strong','fast','loss'].map(name=>plugin(`a/${name}`,50,'2026-09-14')));
      const today=[plugin('a/half',100,'2026-09-17'),plugin('a/strong',250,'2026-09-17'),
        plugin('a/fast',500,'2026-09-17'),plugin('a/loss',40,'2026-09-17')];
      const result=rank(today);
      expect(result.rankings.rising.map(row=>row.fullName)).toEqual(['a/fast','a/strong','a/half']);
      [75,100*2/3,50].forEach((value,index)=>expect(result.rankings.rising[index].risingScore).toBeCloseTo(value,10));
      expect(result.rankings.total.find(row=>row.fullName==='a/loss')?.risingScore).toBe(0);
      expect(rank(today.slice(0,1)).rankings.rising[0].risingScore).toBe(50);
      const extreme=rank([plugin('a/fast',1000000000,'2026-09-17')]).rankings.rising[0];
      expect(extreme.risingScore).toBeGreaterThan(99);expect(extreme.risingScore).toBeLessThan(100);
      expect(result.rankings.total.every(row=>row.risingScore!>=0 && row.risingScore!<=100)).toBe(true);
    } finally {db.close();}
  });
  it('keeps heat half-credit anchors, signed losses and headroom for very large signals', () => {
    const {db,put,rank}=fixture();
    try {
      put('2026-09-10',[plugin('a/anchor',80,'2026-09-10'),plugin('a/strong',8000,'2026-09-10'),
        plugin('a/loss',120,'2026-09-10'),plugin('a/extreme',0,'2026-09-10')]);
      const result=rank([plugin('a/anchor',100,'2026-09-17'),plugin('a/strong',10000,'2026-09-17'),
        plugin('a/loss',100,'2026-09-17'),plugin('a/extreme',1000000000,'2026-09-17')]);
      const byName=new Map(result.rankings.total.map(row=>[row.fullName,row]));
      expect(byName.get('a/anchor')!.hotScore).toBeCloseTo(50,10);
      expect(byName.get('a/strong')!.hotScore).toBeCloseTo(1000/11,10);
      expect(byName.get('a/loss')).toMatchObject({weeklyStars:-20,hotScore:20});
      expect(result.rankings.hot.map(row=>row.fullName)).toEqual(['a/extreme','a/strong','a/anchor','a/loss']);
      expect(byName.get('a/extreme')!.hotScore).toBeLessThan(100);
      expect(rank([plugin('a/anchor',100,'2026-09-17')]).rankings.hot[0].hotScore).toBeCloseTo(50,10);
    } finally {db.close();}
  });
  it('rejects future observations and same-date endpoints more than six hours off the intended interval', () => {
    const {db,put,rank}=fixture();
    try {
      const base=plugin('a/time',10,'2026-09-14');base.starsObservedAt='2026-09-14T10:00:00Z';put('2026-09-14',[base]);
      expect(rank([plugin('a/time',30,'2026-09-17')]).rankings.rising).toEqual([]);
      const future=plugin('a/time',30,'2026-09-17');future.starsObservedAt='2026-09-17T02:00:00Z';
      expect(rank([future]).rankings.total[0].starsObservedAt).toBeNull();
    } finally {db.close();}
  });
  it('preserves a newer successful same-day baseline on failed reimport and migrates legacy rows without backfill', () => {
    const {db,put,dir}=fixture();
    put('2026-09-14',[plugin('a/keep',20,'2026-09-14')]);put('2026-09-14',[plugin('a/keep',10,'2026-09-13')]);
    expect(db.prepare('select stars,stars_observed_at from repository_daily_stats').get()).toMatchObject({stars:20,stars_observed_at:'2026-09-14T00:00:00.000Z'});
    db.exec('ALTER TABLE repository_daily_stats DROP COLUMN stars_observed_at');db.close();
    const reopened=openDatabase({path:join(dir,'db.sqlite')});
    try {expect(reopened.prepare('select stars,stars_observed_at from repository_daily_stats').get()).toMatchObject({stars:20,stars_observed_at:null});} finally {reopened.close();}
  });
  it('stamps successful REST data before caching and GraphQL aliases only when they have no errors', async () => {
    const at='2026-09-17T00:00:00Z';const repo={full_name:'a/test',stargazers_count:10};
    expect(stampRepositoryObservations({items:[repo]},at).items[0]).toMatchObject({starsObservedAt:at});
    expect(JSON.parse(JSON.stringify(repo)).starsObservedAt).toBe(at);
    const response={nameWithOwner:'a/test',stargazerCount:10,forkCount:0,issues:{totalCount:0},pushedAt:at,updatedAt:at,isArchived:false,isFork:false};
    const updates=await fetchRepositoryUpdates(['a/test','b/fail'],{request:async()=>({data:{repository0:response,repository1:response},errors:[{message:'partial failure',path:['repository1','stargazerCount']}]})});
    expect(updates.size).toBe(1);expect(Number.isFinite(Date.parse(updates.get('a/test')!.starsObservedAt))).toBe(true);
    const privateUpdate = await fetchRepositoryUpdates(['a/private'], { request: async () => ({
      data: { repository0: { ...response, isPrivate: true } }, errors: [{ message: 'metrics denied', path: ['repository0', 'stargazerCount'] }],
    }) });
    expect(privateUpdate.get('a/private')).toMatchObject({ private: true, starsObservedAt: '' });
  });
});

describe('bounded historical snapshot transition', () => {
  it('publishes historical estimates after the sync entry point reimports the same legacy day', () => {
    const f = fixture();
    for (const [date, stars] of [['2026-09-10', 20], ['2026-09-14', 30], ['2026-09-16', 40], ['2026-09-17', 50]] as const) {
      f.put(date, [plugin('a/transition', stars)]);
      f.db.prepare('UPDATE repository_daily_stats SET recorded_at=? WHERE snapshot_date=?').run(`${date}T00:00:00Z`, date);
    }
    f.db.close();
    const sourcePath = join(f.dir, 'plugins.json');
    writeFileSync(sourcePath, JSON.stringify({ schemaVersion: 2, generatedAt: '2026-09-17T00:00:00Z', plugins: [plugin('a/transition', 50)] }));
    const clockPath = join(f.dir, 'clock.mjs');
    // Advance every clock read so the import always follows the preview's clock,
    // independently of machine speed. Any attempted request fails this offline test.
    writeFileSync(clockPath, `
      const RealDate = Date;
      let tick = 0;
      const base = RealDate.parse('2026-09-17T04:00:00.000Z');
      globalThis.Date = class extends RealDate {
        constructor(...args) { args.length ? super(...args) : super(base + tick++ * 100); }
        static now() { return base + tick++ * 100; }
      };
      let requests = 0;
      globalThis.fetch = async () => { requests++; throw new Error('Offline sync test'); };
      process.on('exit', () => { if (requests) process.exitCode = 1; });
    `);
    const publicDirectory = join(f.dir, 'public');
    const synced = spawnSync(process.execPath, ['--import', clockPath, '--import', 'tsx', resolve('src/sync-database.ts')], {
      cwd: resolve('.'), encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, NODE_OPTIONS: '', TZ: 'Asia/Shanghai',
        SOURCE_DATA_PATH: sourcePath, DATABASE_PATH: join(f.dir, 'db.sqlite'), PUBLIC_DATA_DIR: publicDirectory,
        DSH_MODEL_REQUESTS_ENABLED: '0', DSH_DAILY_UPDATE: '0', DSH_MODEL_BUDGET_CONFIG: '',
        DEEPSEEK_API_KEY: '', DEEPSEEK_API_KEY_FILE: '', DSH_MONITOR_READ_ONLY: '1',
        INSTALL_ASSESSMENT_BATCH_SIZE: '0' },
    });
    expect(synced.error).toBeUndefined();
    expect(synced.status, synced.stderr + synced.stdout).toBe(0);
    const published = JSON.parse(readFileSync(join(publicDirectory, 'rankings.json'), 'utf8'));
    expect(published.rankings.hot).toHaveLength(1);
    expect(published.rankings.rising).toHaveLength(1);
    expect(published.rankings.rising[0]).toMatchObject({ fullName: 'a/transition', starsObservedAt: null,
      dailyStars: 10, threeDayStars: 20, weeklyStars: 30,
      growthBasis: { daily: 'historical-estimate', threeDay: 'historical-estimate', weekly: 'historical-estimate' } });
  }, 35_000);

  function legacy(f: ReturnType<typeof fixture>, date: string, stars: number) {
    f.put(date, [plugin('a/transition', stars)]);
    f.db.prepare('UPDATE repository_daily_stats SET recorded_at=? WHERE snapshot_date=?').run(`${date}T00:00:00Z`, date);
  }
  function rankAt(f: ReturnType<typeof fixture>, date: string, source: DshPlugin) {
    return buildRankings(f.db, date, resolve('../config/ranking.json'), {
      now: new Date(`${date}T12:00:00Z`), sources: [source],
    });
  }
  it('reuses exact legacy dates as labelled estimates without backfilling observation timestamps or missing daily baselines', () => {
    const f=fixture();
    try {
      legacy(f,'2026-09-10',20); legacy(f,'2026-09-14',30); legacy(f,'2026-09-17',40);
      const r=f.rank();
      expect(r.rankings.hot).toHaveLength(1);expect(r.rankings.rising).toHaveLength(1);
      expect(r.rankings.rising[0]).toMatchObject({dailyStars:null,weeklyStars:20,threeDayStars:10,
        risingScore:100*Math.sqrt(10/Math.sqrt(80))/(Math.sqrt(10/Math.sqrt(80))+Math.sqrt(5)),starsObservedAt:null,
        growthBasis:{threeDay:'historical-estimate',weekly:'historical-estimate'}});
      expect(f.db.prepare('SELECT count(stars_observed_at) AS n FROM repository_daily_stats').get()).toEqual({n:0});
      // A different current value cannot be attributed to the saved snapshot.
      expect(f.rank([plugin('a/transition',100)]).rankings.hot).toEqual([]);
    } finally {f.db.close();}
  });
  it('uses yesterday’s exact snapshot for daily gain or loss, retaining provenance and missing-day gaps', () => {
    const f=fixture();
    try {
      legacy(f,'2026-09-15',10);legacy(f,'2026-09-17',40);
      expect(f.rank().rankings.total[0]).toMatchObject({dailyStars:null,growthBasis:{daily:null}});
      legacy(f,'2026-09-16',30);
      expect(f.rank([plugin('a/transition',40)]).rankings.total[0]).toMatchObject({dailyStars:10,growthBasis:{daily:'historical-estimate'}});
      legacy(f,'2026-09-17',25);
      expect(f.rank().rankings.total[0]).toMatchObject({dailyStars:-5,growthBasis:{daily:'historical-estimate'}});
      expect(f.rank([plugin('a/transition',25,'2026-09-16')]).rankings.total[0].dailyStars).toBeNull();
      expect(f.db.prepare('SELECT count(stars_observed_at) AS n FROM repository_daily_stats').get()).toEqual({n:0});
    } finally {f.db.close();}
  });
  it('expires daily fallback after its fixed cutoff and prefers valid daily observations', () => {
    const f=fixture();
    try {
      legacy(f,'2026-09-17',30);
      expect(rankAt(f,'2026-09-18',plugin('a/transition',40,'2026-09-18')).rankings.total[0])
        .toMatchObject({dailyStars:10,growthBasis:{daily:'historical-estimate'}});
      legacy(f,'2026-09-18',40);
      expect(rankAt(f,'2026-09-19',plugin('a/transition',45,'2026-09-19')).rankings.total[0].dailyStars).toBeNull();
      f.put('2026-09-16',[plugin('a/transition',40,'2026-09-16')]);
      expect(rankAt(f,'2026-09-17',plugin('a/transition',45,'2026-09-17')).rankings.total[0])
        .toMatchObject({dailyStars:5,growthBasis:{daily:'observed'}});
    } finally {f.db.close();}
  });
  it('never substitutes nearby dates, known stale current values, future imports or late reimports', () => {
    const f=fixture();
    try {
      legacy(f,'2026-09-12',20);legacy(f,'2026-09-17',40);
      expect(f.rank().rankings.rising).toEqual([]);
      legacy(f,'2026-09-14',30);
      expect(f.rank([plugin('a/transition',40,'2026-09-16')]).rankings.rising).toEqual([]);
      f.put('2026-09-14',[plugin('a/transition',30,'2026-09-13')]);
      f.db.prepare('UPDATE repository_daily_stats SET recorded_at=? WHERE snapshot_date=?').run('2026-09-14T00:00:00Z','2026-09-14');
      expect(f.rank().rankings.rising).toEqual([]); // known failed baseline is not a historical estimate
      legacy(f,'2026-09-14',30);
      f.db.prepare('UPDATE repository_daily_stats SET recorded_at=? WHERE snapshot_date=?').run('2026-09-18T00:00:00Z','2026-09-14');
      expect(f.rank().rankings.rising).toEqual([]);
    } finally {f.db.close();}
  });
  it('prefers valid observations, expires each window and cannot treat new missing observations as legacy', () => {
    const f=fixture();
    try {
      legacy(f,'2026-09-14',20);legacy(f,'2026-09-17',30);
      let r=rankAt(f,'2026-09-20',plugin('a/transition',40,'2026-09-20'));
      expect(r.rankings.rising[0].growthBasis?.threeDay).toBe('historical-estimate');
      f.put('2026-09-17',[plugin('a/transition',30,'2026-09-17')]);
      r=rankAt(f,'2026-09-20',plugin('a/transition',40,'2026-09-20'));
      expect(r.rankings.rising[0].growthBasis?.threeDay).toBe('observed');
      // Even dated unknown rows after the fixed cutoff are never accepted.
      legacy(f,'2026-09-18',32);
      r=rankAt(f,'2026-09-21',plugin('a/transition',45,'2026-09-21'));
      expect(r.rankings.rising).toEqual([]);
      expect(r.rankings.hot[0].growthBasis?.weekly).toBe('historical-estimate');
      expect(rankAt(f,'2026-09-25',plugin('a/transition',60,'2026-09-25')).rankings.hot).toEqual([]);
      expect(rankAt(f,'2026-09-18',plugin('a/transition',45)).rankings.rising).toEqual([]);
    } finally {f.db.close();}
  });
});
