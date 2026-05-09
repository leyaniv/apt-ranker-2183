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

/**
 * Combine the two per-balcony direction fields into a deduplicated set
 * of cardinals. A corner balcony (e.g. "צפון-מזרח") contributes both
 * cardinals; an apartment with two balconies on different walls
 * contributes one cardinal per balcony. Returns an empty array when the
 * apartment hasn't been labeled.
 */
export function parseBalconyDirections(apt: RawApartment): BaseDirection[] {
  const all: BaseDirection[] = [];
  if (apt.balcony_1_direction) all.push(...parseDirections(apt.balcony_1_direction));
  if (apt.balcony_2_direction) all.push(...parseDirections(apt.balcony_2_direction));
  return [...new Set(all)];
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
):
  | "regular"
  | "garden"
  | "garden_duplex"
  | "roof_duplex"
  | "upper_duplex"
  | "double_height_duplex" {
  if (apt.remarks === "דופלקס גג") return "roof_duplex";
  if (apt.remarks === "דופלקס עליון") return "upper_duplex";
  if (apt.remarks === "דופלקס חלל כפול") return "double_height_duplex";
  if (apt.remarks === "דירת גן") {
    return apt.floor.includes(",") ? "garden_duplex" : "garden";
  }
  return "regular";
}

/* ─── Main cleaning function ─────────────────── */

/** Resolve the building number for an apartment. Lottery units have an
 *  explicit `building` field; open-market units only carry the building
 *  number under `apartment_number_from_api` (a misleading name from the
 *  upstream API, see the type comment). Returns 0 when neither is
 *  available so callers can still produce a stable string key. */
function resolveBuilding(apt: RawApartment): number {
  if (typeof apt.building === "number" && Number.isFinite(apt.building)) {
    return apt.building;
  }
  const fromApi = apt.apartment_number_from_api;
  if (fromApi) {
    const n = parseInt(fromApi, 10);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Clean a raw apartment array: fix typos, derive fields, and return
 * enriched Apartment records ready for scoring.
 */
export function cleanApartments(raw: RawApartment[]): Apartment[] {
  return raw.map((apt) => {
    const directions = parseDirections(apt.air_direction);
    const balconyDirections = parseBalconyDirections(apt);
    const building = resolveBuilding(apt);
    return {
      ...apt,
      // Field-by-field defaulting so downstream consumers (scoring,
      // filters, detail view) see well-typed values even for open-market
      // units that arrive without these fields. Open-market units are
      // filtered out of those flows anyway, but defaults keep the
      // Apartment shape honest.
      type: apt.type ?? "",
      price: apt.price ?? 0,
      area_sqm: apt.area_sqm ?? 0,
      balcony_area_sqm: apt.balcony_area_sqm ?? 0,
      storage_area_sqm: apt.storage_area_sqm ?? 0,
      storage_id: apt.storage_id ?? "",
      parking_count: apt.parking_count ?? 0,
      building,
      apartment_number: apt.apartment_number ?? 0,
      price_per_sqm: apt.price_per_sqm ?? 0,
      pdf_other: apt.pdf_other ?? [],
      buildingKey: `${apt.lot}/${building}`,
      directions,
      directionCount: directions.length,
      balconyDirections,
      roomsNum: parseFloat(apt.rooms),
      floorPrimary: parsePrimaryFloor(apt.floor),
      floorBucket: getFloorBucket(apt.floor),
      layout: deriveLayout(apt),
      isSold: (apt.status ?? "").trim() === "נמכר",
      userMarkedSold: false,
      isFreeMarketing: (apt.status ?? "").trim() === "שיווק חופשי",
    };
  });
}
