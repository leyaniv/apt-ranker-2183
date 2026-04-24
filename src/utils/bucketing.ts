/**
 * Quantile-based bucketing for numeric apartment parameters.
 *
 * Strategy: split values into N buckets so each bucket contains
 * roughly the same number of apartments (quantile bucketing).
 * This ensures meaningful differentiation even when values are
 * clustered.
 */

import type { BucketDef, BucketMap, Apartment, ParameterId } from "../types";

/** Format a number as a compact currency string (₪1.08M) */
function formatPrice(n: number): string {
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₪${(n / 1_000).toFixed(0)}K`;
  return `₪${n.toFixed(0)}`;
}

/** Format a number with unit suffix */
function formatArea(n: number, unit: string): string {
  return `${n.toFixed(1)}${unit}`;
}

/** Hebrew number formatting helpers */
function formatPriceHe(n: number): string {
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₪${(n / 1_000).toFixed(0)}K`;
  return `₪${n.toFixed(0)}`;
}

interface BucketConfig {
  paramId: ParameterId;
  accessor: (apt: Apartment) => number;
  bucketCount: number;
  formatEn: (n: number) => string;
  formatHe: (n: number) => string;
}

const BUCKET_CONFIGS: BucketConfig[] = [
  {
    paramId: "price",
    accessor: (apt) => apt.price,
    bucketCount: 5,
    formatEn: formatPrice,
    formatHe: formatPriceHe,
  },
  {
    paramId: "area_sqm",
    accessor: (apt) => apt.area_sqm,
    bucketCount: 5,
    formatEn: (n) => formatArea(n, " m²"),
    formatHe: (n) => formatArea(n, " מ״ר"),
  },
  {
    paramId: "balcony_area_sqm",
    accessor: (apt) => apt.balcony_area_sqm,
    bucketCount: 5,
    formatEn: (n) => formatArea(n, " m²"),
    formatHe: (n) => formatArea(n, " מ״ר"),
  },
  {
    paramId: "storage_area_sqm",
    accessor: (apt) => apt.storage_area_sqm,
    bucketCount: 3,
    formatEn: (n) => formatArea(n, " m²"),
    formatHe: (n) => formatArea(n, " מ״ר"),
  },
];

/**
 * Compute quantile-based bucket boundaries for a set of values.
 * Returns an array of `count` boundary values that split the data
 * into `count` roughly equal groups.
 */
function computeQuantileBoundaries(values: number[], count: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const boundaries: number[] = [];

  for (let i = 1; i < count; i++) {
    const idx = Math.floor((i / count) * sorted.length);
    boundaries.push(sorted[Math.min(idx, sorted.length - 1)]);
  }

  return boundaries;
}

/**
 * Build BucketDefs from a set of values using quantile boundaries.
 */
function buildBuckets(
  values: number[],
  count: number,
  formatEn: (n: number) => string,
  formatHe: (n: number) => string
): BucketDef[] {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const boundaries = computeQuantileBoundaries(values, count);

  const buckets: BucketDef[] = [];
  let prevBound = min;

  for (let i = 0; i < count; i++) {
    const bucketMax = i < count - 1 ? boundaries[i] : max;
    buckets.push({
      label: `${formatEn(prevBound)} – ${formatEn(bucketMax)}`,
      labelHe: `${formatHe(prevBound)} – ${formatHe(bucketMax)}`,
      min: prevBound,
      max: bucketMax,
    });
    prevBound = bucketMax;
  }

  return buckets;
}

/**
 * For a value and a set of bucket definitions, return the index
 * of the bucket it falls into (0-based).
 */
export function getBucketIndex(value: number, buckets: BucketDef[]): number {
  for (let i = 0; i < buckets.length; i++) {
    if (value <= buckets[i].max) return i;
  }
  return buckets.length - 1;
}

/**
 * Compute all bucket definitions for the numeric parameters
 * based on the actual apartment data distribution.
 */
export function computeAllBuckets(apartments: Apartment[]): BucketMap {
  const bucketMap: BucketMap = {};

  for (const config of BUCKET_CONFIGS) {
    const values = apartments.map(config.accessor);
    bucketMap[config.paramId] = buildBuckets(
      values,
      config.bucketCount,
      config.formatEn,
      config.formatHe
    );
  }

  return bucketMap;
}
