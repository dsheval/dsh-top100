# Ranking Methodology

## Ranking unit

One GitHub repository is one ranking entry. Stars from multiple skills in the same repository are not duplicated.

## Total ranking

The total ranking contains every active, verified repository ordered by current GitHub Stars. Ties use the stable repository order produced by the database query.

## Rising 100

For each repository:

```text
dailyStars = currentStars - nearestSnapshotBefore(currentSnapshotDate)
```

Negative values are clamped to zero. Entries are ordered by `dailyStars`, then current Stars, then `fullName`; only the first 100 are published in the rising list.

When no earlier daily snapshot exists, `dailyStars` is zero. A new deployment receives useful rising data after its second daily snapshot.

## Top 100

The Top 100 keeps the existing composite popularity score, combining normalized signals configured in `config/ranking.json`:

| Signal | Default weight |
| --- | ---: |
| Daily Stars growth | 35 |
| Weekly Stars growth | 25 |
| Weekly growth rate | 15 |
| Recent repository activity | 10 |
| Available description, README, license and source evidence | 10 |
| Total Stars popularity | 5 |

Growth and popularity use logarithmic normalization so one very large repository does not flatten the rest of the list. Activity uses an exponential half-life, currently 60 days. The public Top 100 is ordered by the computed score, but each card displays GitHub Stars for a consistent user-facing metric.

Changing weights changes product behavior. Update tests and this document in the same change.
