// bucket calculations needed all over the place

export function allBuckets(couplingStats) {
  const { bucketCount, bucketSize, firstBucketStart } = couplingStats;

  const results = [];
  for (let index = 0; index < bucketCount; index += 1) {
    const start = firstBucketStart + index * bucketSize;
    results.push({ index, start, end: start + bucketSize - 1 });
  }
  return results;
}
export function bucketsSelected(couplingStats, earliest, latest) {
  return allBuckets(couplingStats).filter((bucket) => {
    if (bucket.start > latest) return false;
    if (bucket.end < earliest) return false;
    return true;
  });
}

export function couplingDateRange(couplingStats, earliest, latest) {
  const buckets = bucketsSelected(couplingStats, earliest, latest);
  const couplingStart = buckets[0].start;
  const couplingEnd = buckets[buckets.length - 1].end;
  return { couplingStart, couplingEnd };
}
