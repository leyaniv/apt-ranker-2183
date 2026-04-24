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
 * Returns the raw value score (1–5) before weighting.
 */
function getParameterScore(
  apt: Apartment,
  paramId: ParameterId,
  scores: ValueScores,
  buckets: BucketMap
): number {
  const paramScores = scores[paramId] ?? {};
  const valueKey = getValueKey(apt, paramId, buckets);

  if (paramId === "air_direction" && Array.isArray(valueKey)) {
    // Average the scores of all directions the apartment faces
    if (valueKey.length === 0) return DEFAULT_SCORE;
    const sum = valueKey.reduce(
      (acc, dir) => acc + (paramScores[dir] ?? DEFAULT_SCORE),
      0
    );
    return sum / valueKey.length;
  }

  const key = Array.isArray(valueKey) ? valueKey[0] : valueKey;
  return paramScores[key] ?? DEFAULT_SCORE;
}

/**
 * Compute the total weighted score for a single apartment.
 */
export function computeApartmentScore(
  apt: Apartment,
  scores: ValueScores,
  weights: ImportanceWeights,
  buckets: BucketMap
): { totalScore: number; breakdown: Record<string, number> } {
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown: Record<string, number> = {};

  for (const config of PARAMETER_CONFIGS) {
    const weight = weights[config.id] ?? DEFAULT_WEIGHT;
    if (weight === 0) continue; // Skip disabled parameters

    const valueScore = getParameterScore(apt, config.id, scores, buckets);
    const contribution = valueScore * weight;

    breakdown[config.id] = contribution;
    weightedSum += contribution;
    totalWeight += weight;
  }

  const totalScore = totalWeight > 0 ? weightedSum / totalWeight : DEFAULT_SCORE;
  return { totalScore, breakdown };
}

/**
 * Rank all apartments by their computed scores, highest first.
 */
export function rankApartments(
  apartments: Apartment[],
  scores: ValueScores,
  weights: ImportanceWeights,
  buckets: BucketMap
): RankedApartment[] {
  const ranked = apartments.map((apt) => {
    const { totalScore, breakdown } = computeApartmentScore(
      apt,
      scores,
      weights,
      buckets
    );
    return { apartment: apt, totalScore, breakdown };
  });

  // Normalize scores to the full 1–5 range
  if (ranked.length > 1) {
    const rawScores = ranked.map((r) => r.totalScore);
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
 */
export function computeCombinedRanking(
  profiles: Profile[],
  apartments: Apartment[],
  buckets: BucketMap,
  profileWeights?: Record<string, number>
): CombinedRankedApartment[] {
  if (profiles.length === 0 || apartments.length === 0) return [];

  // Per-profile ranking lookup: profileId → (slug → normalized totalScore)
  const rankings = new Map<string, Map<string, number>>();
  for (const p of profiles) {
    const ranked = rankApartments(apartments, p.scores, p.weights, buckets);
    const slugMap = new Map<string, number>();
    for (const r of ranked) {
      slugMap.set(r.apartment.property_slug, r.totalScore);
    }
    rankings.set(p.id, slugMap);
  }

  return apartments
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
