/**
 * Scoring engine: computes apartment scores based on user preferences.
 *
 * Each parameter has:
 *   - Value scores (1–5): how much the user likes each specific value
 *   - Importance weight (1–5): how much the parameter matters overall
 *
 * Total score = Σ(value_score × weight) / Σ(weight), normalized to [1, 5].
 */

import type {
  Apartment,
  ParameterId,
  ValueScores,
  ImportanceWeights,
  BucketMap,
  RankedApartment,
  Profile,
} from "../types";
import { getBucketIndex } from "./bucketing";
import { PARAMETER_CONFIGS } from "./parameterConfigs";

/** Default score for any unscored value */
const DEFAULT_SCORE = 3;
/** Default importance weight */
const DEFAULT_WEIGHT = 3;

/** Allowed range for the per-apartment manual adjustment (in percentage
 *  points of the displayed Overall Match). Mirrors the slider in the
 *  apartment detail view. */
const MANUAL_ADJUSTMENT_MIN = -10;
const MANUAL_ADJUSTMENT_MAX = 10;

/**
 * Clamp a manual adjustment to the supported range. Treats non-finite values
 * as 0 so a stray NaN or undefined never poisons the ranking math.
 */
function clampAdjustment(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) return 0;
  if (value < MANUAL_ADJUSTMENT_MIN) return MANUAL_ADJUSTMENT_MIN;
  if (value > MANUAL_ADJUSTMENT_MAX) return MANUAL_ADJUSTMENT_MAX;
  return value;
}

/**
 * Get the value key for an apartment for a given parameter.
 * This maps the apartment's actual data to the key used in ValueScores.
 */
function getValueKey(
  apt: Apartment,
  paramId: ParameterId,
  buckets: BucketMap
): string | string[] {
  switch (paramId) {
    case "rooms":
      return apt.rooms;
    case "building":
      return apt.buildingKey;
    case "floor":
      return apt.floorBucket;
    case "layout":
      return apt.layout;
    case "air_direction":
      // Returns multiple keys — one per direction the apt faces
      return apt.directions;
    case "air_direction_count":
      return String(apt.directionCount);
    case "balcony_direction":
      // One key per cardinal covered by the apartment's balcony
      // entrance(s); see `balconyDirections` in dataCleaning.
      return apt.balconyDirections;
    case "type":
      return apt.type;
    case "price":
    case "area_sqm":
    case "balcony_area_sqm":
    case "storage_area_sqm":
    case "price_per_sqm" as ParameterId: {
      const paramBuckets = buckets[paramId];
      if (!paramBuckets) return "0";
      const value =
        paramId === "price"
          ? apt.price
          : paramId === "area_sqm"
            ? apt.area_sqm
            : paramId === "balcony_area_sqm"
              ? apt.balcony_area_sqm
              : paramId === "storage_area_sqm"
                ? apt.storage_area_sqm
                : 0; // unreachable
      return String(getBucketIndex(value, paramBuckets));
    }
    default:
      return "";
  }
}

/**
 * Compute the score contribution of a single parameter for one apartment.
 *
 * Returns:
 *   - a number in [1, 5] for normal scoring,
 *   - `null` when the apartment is excluded by this parameter (any
 *     contributing value has score 0) and `respectExclusions` is true.
 *
 * When `respectExclusions` is false (e.g. in the Combine view when a profile
 * opts out of enforcing exclusions), score-0 values are treated as 1
 * (strongest dislike) instead of removing the apartment.
 */
function getParameterScore(
  apt: Apartment,
  paramId: ParameterId,
  scores: ValueScores,
  buckets: BucketMap,
  respectExclusions: boolean
): number | null {
  const paramScores = scores[paramId] ?? {};
  const valueKey = getValueKey(apt, paramId, buckets);

  if (
    (paramId === "air_direction" || paramId === "balcony_direction") &&
    Array.isArray(valueKey)
  ) {
    // Average the scores of all directions the apartment faces (for
    // air_direction) / its balcony entrance(s) face (for balcony_direction).
    // Any single excluded direction vetoes the whole apartment.
    //
    // For balcony_direction, an empty array means the apartment hasn't
    // been labeled yet (typically open-market units, which are filtered
    // out of the ranking elsewhere). Treating that as DEFAULT_SCORE keeps
    // these units from being penalized or excluded by this parameter.
    if (valueKey.length === 0) return DEFAULT_SCORE;
    let sum = 0;
    for (const dir of valueKey) {
      const s = paramScores[dir] ?? DEFAULT_SCORE;
      if (s === 0) {
        if (respectExclusions) return null;
        sum += 1;
      } else {
        sum += s;
      }
    }
    return sum / valueKey.length;
  }

  const key = Array.isArray(valueKey) ? valueKey[0] : valueKey;
  const s = paramScores[key] ?? DEFAULT_SCORE;
  if (s === 0) {
    if (respectExclusions) return null;
    return 1;
  }
  return s;
}

/**
 * Compute the total weighted score for a single apartment.
 *
 * Returns `excluded: true` when at least one contributing parameter has
 * score 0 for this apartment (and `respectExclusions` is true). Excluded
 * apartments should be removed from the ranking before normalization.
 *
 * `adjustment` is the user's manual nudge in [-10, +10] percentage points
 * (see the slider below the notes section in `ApartmentDetail`). The
 * displayed Overall Match is `weightedSum / (totalWeight * 5) * 100`, so
 * adding `M` percentage points to that display equals adding `M / 20` to the
 * per-unit-weight `totalScore`. Excluded apartments do not have the
 * adjustment applied (their score is meaningless until exclusions are
 * lifted via `respectExclusions=false`).
 */
export function computeApartmentScore(
  apt: Apartment,
  scores: ValueScores,
  weights: ImportanceWeights,
  buckets: BucketMap,
  respectExclusions: boolean = true,
  adjustment: number = 0
): {
  totalScore: number;
  totalWeight: number;
  breakdown: Record<string, number>;
  excluded: boolean;
} {
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown: Record<string, number> = {};
  let excluded = false;

  for (const config of PARAMETER_CONFIGS) {
    const weight = weights[config.id] ?? DEFAULT_WEIGHT;
    if (weight === 0) continue; // Skip disabled parameters

    const valueScore = getParameterScore(
      apt,
      config.id,
      scores,
      buckets,
      respectExclusions
    );
    if (valueScore === null) {
      excluded = true;
      // Keep iterating so the breakdown reflects all parameters consistently
      // for any UI that wants to show why the apartment was excluded.
      breakdown[config.id] = 0;
      continue;
    }
    const contribution = valueScore * weight;

    breakdown[config.id] = contribution;
    weightedSum += contribution;
    totalWeight += weight;
  }

  let totalScore = totalWeight > 0 ? weightedSum / totalWeight : DEFAULT_SCORE;
  if (!excluded) {
    const m = clampAdjustment(adjustment);
    if (m !== 0) totalScore += m / 20;
  }
  return { totalScore, totalWeight, breakdown, excluded };
}

/**
 * Rank all apartments by their computed scores, highest first.
 *
 * Apartments excluded by the profile (any contributing value scored 0)
 * are removed before normalization, so they don't appear in the ranking
 * and don't skew the normalized 1–5 range. Pass `respectExclusions=false`
 * to disable this filtering and treat 0 as 1 instead.
 *
 * Set `includeExcluded=true` to keep excluded apartments in the result
 * (tagged with `excluded: true`) instead of dropping them. Excluded
 * entries are scored with 0→1 substitution so they have a meaningful
 * number, and are excluded from the min/max used for normalization
 * (the same linear transform is then applied to them, so they typically
 * sink to the bottom of the list).
 *
 * `adjustments` (property_slug → -10..+10) applies the user's manual
 * per-apartment nudge before normalization. See `computeApartmentScore`.
 */
export function rankApartments(
  apartments: Apartment[],
  scores: ValueScores,
  weights: ImportanceWeights,
  buckets: BucketMap,
  respectExclusions: boolean = true,
  includeExcluded: boolean = false,
  adjustments?: Record<string, number>
): RankedApartment[] {
  const ranked: RankedApartment[] = [];
  for (const apt of apartments) {
    const adj = adjustments?.[apt.property_slug] ?? 0;
    const { totalScore, totalWeight, breakdown, excluded } =
      computeApartmentScore(apt, scores, weights, buckets, respectExclusions, adj);
    if (excluded) {
      if (!includeExcluded) continue;
      // Re-score with exclusions disabled (0→1) so excluded apts have a
      // real, sortable number rather than 0. The manual nudge still applies
      // so excluded entries that the user has down-weighted stay sunk.
      const noVeto = computeApartmentScore(apt, scores, weights, buckets, false, adj);
      ranked.push({
        apartment: apt,
        totalScore: noVeto.totalScore,
        totalWeight: noVeto.totalWeight,
        breakdown: noVeto.breakdown,
        excluded: true,
      });
      continue;
    }
    ranked.push({ apartment: apt, totalScore, totalWeight, breakdown });
  }

  // Normalize scores to the full 1–5 range using only the non-excluded
  // entries' min/max so excluded apts can't compress the visible spread.
  // The same linear transform is applied to excluded entries so they
  // remain comparable for sorting (they typically fall at or below the
  // visible minimum).
  const visible = includeExcluded ? ranked.filter((r) => !r.excluded) : ranked;
  if (visible.length > 1) {
    const rawScores = visible.map((r) => r.totalScore);
    const min = Math.min(...rawScores);
    const max = Math.max(...rawScores);
    const range = max - min;
    if (range > 0) {
      for (const r of ranked) {
        r.totalScore = 1 + ((r.totalScore - min) / range) * 4;
      }
    }
  }

  ranked.sort((a, b) => b.totalScore - a.totalScore);
  return ranked;
}

/** A single apartment entry in the combined (multi-profile) ranking. */
export interface CombinedRankedApartment {
  apartment: Apartment;
  /** Per-profile normalized total scores, in the same order as the input profiles */
  perProfile: number[];
  /** Weighted average across profiles (weighted by `profileWeights`) */
  avgScore: number;
}

/**
 * Rank apartments across multiple profiles, weighting each profile by
 * its importance (1–5, default 3). Mirrors the math shown in the Combine tab.
 *
 * `respectExclusions` (per profile) controls how that profile's score-0
 * vetoes affect the combined ranking:
 *   - `true`  → apartments excluded by this profile are removed from the
 *               combined ranking entirely.
 *   - `false` (default) → score-0 is treated as a strong dislike (1) for
 *               this profile only, but the apartment still appears.
 */
export function computeCombinedRanking(
  profiles: Profile[],
  apartments: Apartment[],
  buckets: BucketMap,
  profileWeights?: Record<string, number>,
  respectExclusions?: Record<string, boolean>
): CombinedRankedApartment[] {
  if (profiles.length === 0 || apartments.length === 0) return [];

  // Per-profile ranking lookup: profileId → (slug → normalized totalScore)
  const rankings = new Map<string, Map<string, number>>();
  // Slugs excluded by at least one "respect exclusions" profile
  const excludedFromCombined = new Set<string>();
  for (const p of profiles) {
    const respect = respectExclusions?.[p.id] ?? false;
    const ranked = rankApartments(
      apartments,
      p.scores,
      p.weights,
      buckets,
      respect,
      false,
      p.manualAdjustments
    );
    const slugMap = new Map<string, number>();
    for (const r of ranked) {
      slugMap.set(r.apartment.property_slug, r.totalScore);
    }
    rankings.set(p.id, slugMap);
    if (respect) {
      const visible = new Set(ranked.map((r) => r.apartment.property_slug));
      for (const apt of apartments) {
        if (!visible.has(apt.property_slug)) excludedFromCombined.add(apt.property_slug);
      }
    }
  }

  return apartments
    .filter((apt) => !excludedFromCombined.has(apt.property_slug))
    .map((apt) => {
      const slug = apt.property_slug;
      const perProfile = profiles.map(
        (p) => rankings.get(p.id)?.get(slug) ?? 0
      );
      let weightedSum = 0;
      let totalWeight = 0;
      for (let i = 0; i < profiles.length; i++) {
        const w = profileWeights?.[profiles[i].id] ?? 3;
        weightedSum += perProfile[i] * w;
        totalWeight += w;
      }
      const avgScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      return { apartment: apt, perProfile, avgScore };
    })
    .sort((a, b) => b.avgScore - a.avgScore);
}
