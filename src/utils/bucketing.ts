/**
 * Fixed-boundary bucketing for numeric apartment parameters.
 *
 * Each parameter has a hand-picked set of integer (or round) boundary
 * values. Boundaries are stable across data changes and avoid the
 * "112.2 – 112.2" degenerate ranges produced by quantile bucketing
 * when many apartments share similar values.
 */

import type { BucketDef, BucketMap, Apartment, ParameterId } from "../types";

/** Format a price boundary as ₪X.XM / ₪XK. */
function formatPrice(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    // Drop trailing zero: 1.20 → 1.2M, but keep 1.05M
    return `₪${m.toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (n >= 1_000) return `₪${Math.round(n / 1_000)}K`;
  return `₪${Math.round(n)}`;
}

/** Format a price boundary in Hebrew using מש״ח (millions of shekels). */
function formatPriceHe(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m.toFixed(2).replace(/\.?0+$/, "")} מש״ח`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)} אש״ח`;
  return `₪${Math.round(n)}`;
}

/** Format an area boundary as an integer with the given unit. */
function formatArea(n: number, unit: string): string {
  return `${Math.round(n)}${unit}`;
}

interface BucketConfig {
  paramId: ParameterId;
  accessor: (apt: Apartment) => number;
  /** Interior boundary values, ascending. N boundaries → N+1 buckets. */
  boundaries: number[];
  formatEn: (n: number) => string;
  formatHe: (n: number) => string;
}

const BUCKET_CONFIGS: BucketConfig[] = [
  {
    paramId: "price",
    accessor: (apt) => apt.price,
    // 5 buckets: <₪1.2M, ₪1.2–1.5M, ₪1.5–1.8M, ₪1.8–2.1M, ≥₪2.1M
    boundaries: [1_200_000, 1_500_000, 1_800_000, 2_100_000],
    formatEn: formatPrice,
    formatHe: formatPriceHe,
  },
  {
    paramId: "area_sqm",
    accessor: (apt) => apt.area_sqm,
    // 5 buckets: <90, 90–110, 110–115, 115–130, ≥130 m²
    boundaries: [90, 110, 115, 130],
    formatEn: (n) => formatArea(n, " m²"),
    formatHe: (n) => formatArea(n, " מ״ר"),
  },
  {
    paramId: "balcony_area_sqm",
    accessor: (apt) => apt.balcony_area_sqm,
    // 5 buckets: <15, 15–25, 25–50, 50–90, ≥90 m²
    boundaries: [15, 25, 50, 90],
    formatEn: (n) => formatArea(n, " m²"),
    formatHe: (n) => formatArea(n, " מ״ר"),
  },
  {
    paramId: "storage_area_sqm",
    accessor: (apt) => apt.storage_area_sqm,
    // 3 buckets: <6, 6–8, ≥8 m²
    boundaries: [6, 8],
    formatEn: (n) => formatArea(n, " m²"),
    formatHe: (n) => formatArea(n, " מ״ר"),
  },
];

/**
 * Build BucketDefs from a sorted list of interior boundaries.
 * - First bucket: "< b0"
 * - Middle bucket i: "b[i-1] – b[i]"
 * - Last bucket: "≥ b[last]"
 */
function buildBuckets(
  boundaries: number[],
  formatEn: (n: number) => string,
  formatHe: (n: number) => string
): BucketDef[] {
  const buckets: BucketDef[] = [];
  const count = boundaries.length + 1;

  for (let i = 0; i < count; i++) {
    const lo = i === 0 ? -Infinity : boundaries[i - 1];
    const hi = i === count - 1 ? Infinity : boundaries[i];

    let label: string;
    let labelHe: string;
    if (i === 0) {
      label = `< ${formatEn(hi)}`;
      labelHe = `< ${formatHe(hi)}`;
    } else if (i === count - 1) {
      label = `≥ ${formatEn(lo)}`;
      labelHe = `≥ ${formatHe(lo)}`;
    } else {
      label = `${formatEn(lo)} – ${formatEn(hi)}`;
      labelHe = `${formatHe(lo)} – ${formatHe(hi)}`;
    }

    buckets.push({ label, labelHe, min: lo, max: hi });
  }

  return buckets;
}

/**
 * For a value and a set of bucket definitions, return the index
 * of the bucket it falls into (0-based). Boundaries are exclusive
 * on the upper end, so a value equal to a boundary falls into the
 * lower bucket.
 */
export function getBucketIndex(value: number, buckets: BucketDef[]): number {
  for (let i = 0; i < buckets.length; i++) {
    if (value < buckets[i].max) return i;
  }
  return buckets.length - 1;
}

/**
 * Compute all bucket definitions for the numeric parameters.
 * `apartments` is unused with fixed boundaries but kept for API
 * compatibility (and so we can revisit data-aware bucketing later).
 */
export function computeAllBuckets(_apartments: Apartment[]): BucketMap {
  const bucketMap: BucketMap = {};

  for (const config of BUCKET_CONFIGS) {
    bucketMap[config.paramId] = buildBuckets(
      config.boundaries,
      config.formatEn,
      config.formatHe
    );
  }

  return bucketMap;
}
