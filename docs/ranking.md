# Ranking methodology

## Unit and scope

One GitHub repository is one ranking entry. Both boards measure repository attention for projects supporting DSH, not independent plugin adoption or runtime quality. Show the actual package, its function and owning repository. Do not split projects into subjective “plugin / ecosystem integration” groups or apportion parent Stars by an invented coefficient. Skills remain a separate directory.

The featured self repository and conclusively ineligible selected packages are excluded before selection. Existing source-reviewed exclusions in `config/ranking.json` remain effective. Historical records retained pending a routine structure recheck are not automatically ineligible. Neither missing Chinese text nor a frozen description determines plugin identity.

## Reliable observations

`starsObservedAt` is stamped when GitHub repository metadata is successfully received, including REST search/list results and per-alias GraphQL refresh. Cache hits and failed refreshes retain their original observation time; `lastCheckedAt` remains source-review metadata. Import time is not observation time.

SQLite adds nullable `stars_observed_at` to daily statistics without backfilling legacy rows. A valid observation must be on the snapshot date in Asia/Shanghai and not in the future. Same-day stale reimports cannot overwrite a newer valid historical observation.

Daily, 3-day and 7-day deltas require observations on the exact corresponding dates. Actual endpoint spacing must be within 6 hours of the intended window. Missing, stale and future observations return `null`, never fabricated zero. The bounded legacy transition below is a separately labelled exception for 3/7-day calendar snapshots. Display signed net changes; scoring alone clips negative growth to zero. Intermediate missing days do not invalidate an otherwise observed window, but cannot supply a missing daily endpoint.

## Boards

Total: all active eligible plugin repositories, descending repository Stars, then full name.

Heat: at least 10 Stars and a valid 7-day window. With S=current Stars, G7=max(0,7-day net growth):

```
H = 60 * sqrt(G7)/(sqrt(G7)+sqrt(20)) + 40 * sqrt(S)/(sqrt(S)+sqrt(100))
```

Recent momentum: a valid 3-day window and at least 3 net new Stars, without a repository-age or additional total-Star threshold. B3=Stars at the 3-day baseline:

```
R = G3 / sqrt(B3+50)
risingScore = 100 * sqrt(R) / (sqrt(R) + sqrt(5))
```

The displayed rising index uses a fixed 0–100 scale, with `rising.scoreScale=5`: raw values 5/20/45 map to 50/66.67/75. The positive mapping is monotonic and does not use the daily maximum or other projects. Finite values approach 100; the leader is not forced to 100. Rank on unrounded raw scores (before the display mapping), preserving order and tie-breaks. Heat ties use weekly net change, total Stars, full name; momentum ties use 3-day net change, total Stars, full name. Publish at most 100 qualifying entries, allowing short and empty lists. Descriptions, README length, license presence and commit frequency do not contribute to either score. These formulas are configurable product choices, not a validated measure of quality or resistance to manipulated Stars.

## Transition and compatibility

Existing history remains intact without backfilled observation times. `legacySnapshotsThrough: "2026-09-17"` explicitly enables a bounded transition (omit it for strict observation-only ranking). Only exact-date legacy rows on/before this cutoff, with a same-day, non-future import timestamp and valid nonnegative Stars, may supply estimated 1/3/7-day growth. Unknown current data also needs a matching saved snapshot on/before the cutoff. Explicit stale/invalid current observations and known invalid historical observations cannot fall back. Import now records `stars_observation_invalid` so failed observation evidence survives independently of the nullable success timestamp; old unknown records retain their uncertainty.

Both valid observations always take priority and keep the six-hour interval check. Legacy endpoints only support a calendar-snapshot estimate, not an asserted exact elapsed window. Each metric publishes `growthBasis.daily/threeDay/weekly` as `observed`, `historical-estimate` or null, while clients show uncluttered scores and deltas. The ranking-method page explains the historical transition; individual rows do not repeat estimate labels (user decision, 2026-09-17). Daily growth may use today’s minus yesterday’s dated snapshot, never yesterday’s delta copied forward. A missing date is never substituted, interpolated or filled with zero. Scores, thresholds, exclusions and ranking precision are unchanged.

With the fixed 2026-09-17 cutoff, estimated daily windows end by snapshot date 2026-09-18, estimated rising windows end by snapshot date 2026-09-20 and estimated heat windows by 2026-09-24. Later missing observations cannot extend this period; absence then produces short/empty boards. This cutoff is a dated rollout setting, not a rolling grace period. Review it against the actual authorized deployment date; do not silently move it on restart. No production deployment has been made by this local trial.

Legacy snapshots can include delayed or failed refreshes; a label does not verify those records or eliminate catch-up growth. This transition is an explicit approximate-data product choice. Total and Skills remain available regardless of window coverage.

The v2 envelope is retained. `dailyStars`, `weeklyStars`, `hotScore` may be null; additive `threeDayStars`, `risingScore`, `starsObservedAt`, `growthBasis` fields describe the new metrics. Updated clients can read legacy rows, showing their existing daily metric without calling it 3-day momentum. Very old clients may not explain null metrics; publish updated website/plugin alongside activation.

Validate missing dates, failed/cached refresh, legacy migration, negative growth, cold start, duplicate repository exclusion, deterministic ties, description-independent scores, preview/import equivalence and production-scale memory before publication.
