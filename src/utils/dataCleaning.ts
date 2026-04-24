/**
 * Data cleaning utilities for raw apartment records.
 *
 * Fixes known data quality issues:
 * - air_direction typos ("דרופ-מזרח" → "דרום-מזרח", extra spaces)
 * - Derives composite building key ("{lot}/{building}")
 * - Parses direction strings into base directions
 * - Normalizes floor values to a primary floor number + bucket
 */

import type { RawApartment, Apartment, BaseDirection } from "../types";

/* ─── Hebrew → English direction mapping ────── */

const DIRECTION_MAP: Record<string, BaseDirection> = {
  צפון: "N",
  דרום: "S",
  מזרח: "NE", // Actually "East" but in this project's context it maps to NE/SE
  מערב: "NW", // Same — "West" maps to NW/SW
  "צפון-מזרח": "NE",
  "צפון-מערב": "NW",
  "דרום-מזרח": "SE",
  "דרום-מערב": "SW",
};

/** Single Hebrew direction component → BaseDirection */
const COMPONENT_MAP: Record<string, BaseDirection> = {
  צפון: "N",
  דרום: "S",
  מזרח: "NE", // Contextually NE when alone; re-derived from pairs below
  מערב: "NW",
};

/**
 * Parse a Hebrew composite direction string into an array of BaseDirections.
 * E.g., "צפון-מזרח-דרום" → ["N", "NE", "S"]
 *
 * The raw data uses hyphen-separated Hebrew direction words. Single words are
 * cardinal (N/S) or ordinal (NE/NW/SE/SW). Multi-word strings represent
 * apartments that face multiple directions.
 */
export function parseDirections(raw: string): BaseDirection[] {
  // Fix known typos
  let cleaned = raw
    .replace("דרופ", "דרום") // typo: דרופ → דרום
    .replace(/\s+/g, ""); // remove extra whitespace

  // If the whole string is a known composite, return it directly
  if (DIRECTION_MAP[cleaned]) {
    return [DIRECTION_MAP[cleaned]];
  }

  // Split by hyphen and process pairs/singles
  const parts = cleaned.split("-");
  const directions: BaseDirection[] = [];

  let i = 0;
  while (i < parts.length) {
    // Try two-part composite first (e.g., "צפון-מזרח" → NE)
    if (i + 1 < parts.length) {
      const pair = `${parts[i]}-${parts[i + 1]}`;
      if (DIRECTION_MAP[pair]) {
        directions.push(DIRECTION_MAP[pair]);
        i += 2;
        continue;
      }
    }
    // Single component
    if (COMPONENT_MAP[parts[i]]) {
      directions.push(COMPONENT_MAP[parts[i]]);
    }
    i++;
  }

  // Deduplicate (shouldn't happen, but safe)
  return [...new Set(directions)];
}

/* ─── Floor bucketing ────────────────────────── */

/** Assign a floor bucket label based on floor string */
export function getFloorBucket(floor: string): string {
  const parts = floor.split(",").map((s) => parseInt(s.trim(), 10));
  const primary = Math.min(...parts);

  if (primary <= -1) return "underground";
  if (primary === 0) return "ground";
  if (primary >= 1 && primary <= 3) return "low";
  if (primary >= 4 && primary <= 7) return "mid";
  if (primary >= 8 && primary <= 11) return "high";
  return "top"; // 12+
}

/** Get the primary (lowest) floor number from a floor string */
export function parsePrimaryFloor(floor: string): number {
  const parts = floor.split(",").map((s) => parseInt(s.trim(), 10));
  return Math.min(...parts);
}

/* ─── Layout derivation ──────────────────────── */

/** Derive the apartment layout from the remarks field + floor data */
function deriveLayout(
  apt: RawApartment
): "regular" | "garden" | "garden_duplex" | "roof_duplex" {
  if (apt.remarks === "דופלקס גג") return "roof_duplex";
  if (apt.remarks === "דירת גן") {
    return apt.floor.includes(",") ? "garden_duplex" : "garden";
  }
  return "regular";
}

/* ─── Main cleaning function ─────────────────── */

/**
 * Clean a raw apartment array: fix typos, derive fields, and return
 * enriched Apartment records ready for scoring.
 */
export function cleanApartments(raw: RawApartment[]): Apartment[] {
  return raw.map((apt) => {
    const directions = parseDirections(apt.air_direction);
    return {
      ...apt,
      buildingKey: `${apt.lot}/${apt.building}`,
      directions,
      directionCount: directions.length,
      roomsNum: parseFloat(apt.rooms),
      floorPrimary: parsePrimaryFloor(apt.floor),
      floorBucket: getFloorBucket(apt.floor),
      layout: deriveLayout(apt),
    };
  });
}
