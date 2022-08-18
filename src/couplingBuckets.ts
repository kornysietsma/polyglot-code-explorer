// bucket calculations needed all over the place

import { CouplingStats } from "./viz.types";

function allBuckets(couplingStats: CouplingStats) {
  const { bucketCount, bucketSize, firstBucketStart } = couplingStats;

  const results = [];
  for (let index = 0; index < bucketCount; index += 1) {
    const start = firstBucketStart + index * bucketSize;
    results.push({ index, start, end: start + bucketSize - 1 });
  }
  return results;
}
function bucketsSelected(
  couplingStats: CouplingStats,
  earliest: number,
  latest: number
) {
  return allBuckets(couplingStats).filter((bucket) => {
    if (bucket.start > latest) return false;
    if (bucket.end < earliest) return false;
    return true;
  });
}

export function couplingDateRange(
  couplingStats: CouplingStats,
  earliest: number,
  latest: number
) {
  const buckets = bucketsSelected(couplingStats, earliest, latest);
  const couplingStart = buckets[0].start;
  const couplingEnd = buckets[buckets.length - 1].end;
  return { couplingStart, couplingEnd };
}
