/**
 * Parameter configuration registry.
 *
 * Defines all scorable parameters with their type (categorical vs bucketed),
 * labels, possible values, and display settings. Bucket values are populated
 * dynamically at runtime from the data; this file only defines the static
 * categorical values and metadata.
 */

import type { ParameterConfig } from "../types";

/* ─── Floor bucket values (static — defined in plan) ─── */

const FLOOR_VALUES = [
  "underground",
  "ground",
  "low",
  "mid",
  "high",
  "top",
] as const;

const FLOOR_LABELS: Record<string, { en: string; he: string }> = {
  underground: { en: "Underground (-2 to -1)", he: "מרתף (-2 עד -1)" },
  ground: { en: "Ground (0)", he: "קרקע (0)" },
  low: { en: "Low (1–3)", he: "נמוכה (1–3)" },
  mid: { en: "Mid (4–7)", he: "בינונית (4–7)" },
  high: { en: "High (8–11)", he: "גבוהה (8–11)" },
  top: { en: "Top (12–15)", he: "עליונה (12–15)" },
};

/* ─── Direction labels ─── */

const DIRECTION_LABELS: Record<string, { en: string; he: string }> = {
  N: { en: "North", he: "צפון" },
  E: { en: "East", he: "מזרח" },
  S: { en: "South", he: "דרום" },
  W: { en: "West", he: "מערב" },
};

const DIR_COUNT_LABELS: Record<string, { en: string; he: string }> = {
  "1": { en: "1 Air Direction", he: "כיוון אוויר אחד" },
  "2": { en: "2 Air Directions", he: "2 כיווני אוויר" },
  "3": { en: "3 Air Directions", he: "3 כיווני אוויר" },
};

/* ─── Building labels ─── */

const BUILDING_VALUES = [
  "207/1", "207/2", "207/3", "207/4", "207/5", "207/6",
  "208/1", "208/2", "208/3", "208/4", "208/5", "208/6",
];

function buildBuildingLabels(): Record<string, { en: string; he: string }> {
  const labels: Record<string, { en: string; he: string }> = {};
  for (const key of BUILDING_VALUES) {
    const [lot, bldg] = key.split("/");
    labels[key] = {
      en: `Lot ${lot} / Building ${bldg}`,
      he: `מגרש ${lot} / בניין ${bldg}`,
    };
  }
  return labels;
}

/* ─── Room labels ─── */

const ROOM_VALUES = ["3", "4", "4.5", "5", "6"];
const ROOM_LABELS: Record<string, { en: string; he: string }> = {
  "3": { en: "3 Rooms", he: "3 חדרים" },
  "4": { en: "4 Rooms", he: "4 חדרים" },
  "4.5": { en: "4.5 Rooms", he: "4.5 חדרים" },
  "5": { en: "5 Rooms", he: "5 חדרים" },
  "6": { en: "6 Rooms", he: "6 חדרים" },
};

/* ─── Static parameter configs ─── */

/**
 * All scorable parameter configurations.
 * Bucketed parameters have empty `values`/`valueLabels` here —
 * they're populated at runtime after computing bucket boundaries.
 */
export const PARAMETER_CONFIGS: ParameterConfig[] = [
  {
    id: "rooms",
    kind: "categorical",
    label: { en: "Rooms", he: "חדרים" },
    values: ROOM_VALUES,
    valueLabels: ROOM_LABELS,
  },
  {
    id: "building",
    kind: "categorical",
    label: { en: "Building", he: "בניין" },
    values: BUILDING_VALUES,
    valueLabels: buildBuildingLabels(),
  },
  {
    id: "air_direction",
    kind: "categorical",
    label: { en: "Air Direction", he: "כיוון אוויר" },
    values: ["N", "E", "S", "W"],
    valueLabels: DIRECTION_LABELS,
  },
  {
    id: "air_direction_count",
    kind: "categorical",
    label: { en: "Number of Air Directions", he: "מספר כיווני אוויר" },
    values: ["1", "2", "3"],
    valueLabels: DIR_COUNT_LABELS,
  },
  {
    id: "floor",
    kind: "categorical",
    label: { en: "Floor", he: "קומה" },
    values: [...FLOOR_VALUES],
    valueLabels: FLOOR_LABELS,
  },
  {
    id: "layout",
    kind: "categorical",
    label: { en: "Layout", he: "סוג דירה" },
    values: ["regular", "garden", "garden_duplex", "roof_duplex"],
    valueLabels: {
      regular: { en: "Regular apartment", he: "דירה רגילה" },
      garden: { en: "Garden apartment", he: "דירת גן" },
      garden_duplex: { en: "Garden duplex", he: "דופלקס גן" },
      roof_duplex: { en: "Roof duplex", he: "דופלקס גג" },
    },
  },
  // Bucketed numeric — values populated at runtime
  {
    id: "price",
    kind: "bucketed",
    label: { en: "Price", he: "מחיר" },
    values: [],
    valueLabels: {},
  },
  {
    id: "area_sqm",
    kind: "bucketed",
    label: { en: "Area", he: "שטח דירה" },
    values: [],
    valueLabels: {},
  },
  {
    id: "balcony_area_sqm",
    kind: "bucketed",
    label: { en: "Balcony Area", he: "שטח מרפסת" },
    values: [],
    valueLabels: {},
  },
  {
    id: "storage_area_sqm",
    kind: "bucketed",
    label: { en: "Storage Area", he: "שטח מחסן" },
    values: [],
    valueLabels: {},
  },
  {
    id: "type",
    kind: "categorical",
    label: { en: "Apartment Type", he: "טיפוס דירה" },
    values: [], // Populated at runtime from data
    valueLabels: {},
    advanced: true,
  },
];

/**
 * Populate bucketed parameter configs with actual bucket boundaries.
 * Call once after computing buckets from the apartment data.
 */
export function hydrateParameterConfigs(
  bucketMap: import("../types").BucketMap,
  apartments: import("../types").Apartment[]
): ParameterConfig[] {
  return PARAMETER_CONFIGS.map((config) => {
    if (config.kind === "bucketed" && bucketMap[config.id]) {
      const buckets = bucketMap[config.id]!;
      return {
        ...config,
        values: buckets.map((_, i) => String(i)),
        valueLabels: Object.fromEntries(
          buckets.map((b, i) => [
            String(i),
            { en: b.label, he: b.labelHe },
          ])
        ),
      };
    }

    // Populate type values dynamically from data
    if (config.id === "type") {
      const types = [...new Set(apartments.map((a) => a.type))].sort();
      return {
        ...config,
        values: types,
        valueLabels: Object.fromEntries(
          types.map((t) => [t, { en: t, he: t }])
        ),
      };
    }

    return config;
  });
}
