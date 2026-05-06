import { useMemo } from "react";
import type { Apartment, BucketMap, ParameterId } from "../types";
import { getBucketIndex } from "../utils/bucketing";

export interface ValueStats {
  available: number;
  sold: number;
  total: number;
}

/**
 * Compute per-value availability stats for a parameter.
 * Returns a map: valueKey → { available, sold, total }.
 *
 * For air_direction, an apartment can contribute to multiple values
 * (since it faces multiple directions).
 */
export function useValueStats(
  apartments: Apartment[],
  paramId: ParameterId,
  buckets: BucketMap
): Record<string, ValueStats> {
  return useMemo(() => {
    const stats: Record<string, ValueStats> = {};

    const ensure = (key: string) => {
      if (!stats[key]) stats[key] = { available: 0, sold: 0, total: 0 };
    };

    for (const apt of apartments) {
      const keys = getValueKeys(apt, paramId, buckets);
      for (const key of keys) {
        ensure(key);
        stats[key].total++;
        if (apt.isSold) {
          stats[key].sold++;
        } else {
          stats[key].available++;
        }
      }
    }

    return stats;
  }, [apartments, paramId, buckets]);
}

function getValueKeys(
  apt: Apartment,
  paramId: ParameterId,
  buckets: BucketMap
): string[] {
  switch (paramId) {
    case "rooms":
      return [apt.rooms];
    case "building":
      return [apt.buildingKey];
    case "floor":
      return [apt.floorBucket];
    case "layout":
      return [apt.layout];
    case "air_direction":
      return apt.directions;
    case "air_direction_count":
      return [String(apt.directionCount)];
    case "type":
      return [apt.type];
    case "price":
    case "area_sqm":
    case "balcony_area_sqm":
    case "storage_area_sqm": {
      const paramBuckets = buckets[paramId];
      if (!paramBuckets) return ["0"];
      const value =
        paramId === "price"
          ? apt.price
          : paramId === "area_sqm"
            ? apt.area_sqm
            : paramId === "balcony_area_sqm"
              ? apt.balcony_area_sqm
              : apt.storage_area_sqm;
      return [String(getBucketIndex(value, paramBuckets))];
    }
    default:
      return [];
  }
}
