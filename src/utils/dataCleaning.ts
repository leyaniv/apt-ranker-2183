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

/**
 * Map a single Hebrew direction word to its cardinal direction.
 * Each hyphen-separated component in the raw `air_direction` string
 * represents one wall/exposure of the apartment.
 */
const COMPONENT_MAP: Record<string, BaseDirection> = {
  צפון: "N",
  דרום: "S",
  מזרח: "E",
  מערב: "W",
};

/**
 * Parse a Hebrew composite direction string into an array of BaseDirections.
 * E.g., "צפון-מזרח-דרום" → ["N", "E", "S"] (three exposures: N wall, E wall, S wall).
 *
 * The raw data uses hyphen-separated Hebrew direction words. Each component
 * corresponds to one cardinal exposure of the apartment.
 */
export function parseDirections(raw: string): BaseDirection[] {
  // Fix known typos and strip whitespace
  const cleaned = raw
    .replace("דרופ", "דרום") // typo: דרופ → דרום
    .replace(/\s+/g, "");

  const directions: BaseDirection[] = [];
  for (const part of cleaned.split("-")) {
    const dir = COMPONENT_MAP[part];
    if (dir) directions.push(dir);
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
