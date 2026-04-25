/* ──────────────────────────────────────────────
 *  Core domain types for the Eshel Apartment
 *  Priority App.
 * ────────────────────────────────────────────── */

/** Raw apartment record as loaded from apartments.json */
export interface RawApartment {
  property_slug: string;
  rooms: string;
  floor: string;
  type: string;
  price: number;
  area_sqm: number;
  balcony_area_sqm: number;
  storage_area_sqm: number;
  storage_id: string;
  parking_count: number;
  building: number;
  apartment_number: number;
  air_direction: string;
  status: string;
  lot: string;
  price_per_sqm: number;
  detail_url: string;
  pdf_apartment_plan?: string;
  pdf_floor_plan?: string;
  pdf_parking_storage?: string;
  pdf_development?: string;
  pdf_apartment_plan_url?: string;
  pdf_floor_plan_url?: string;
  pdf_parking_storage_url?: string;
  pdf_development_url?: string;
  pdf_other_urls: string[];
  pdf_other: string[];
  remarks: string;
}

/** Base direction extracted from composite air_direction strings */
export type BaseDirection = "N" | "E" | "S" | "W";

/** Cleaned apartment with derived fields ready for scoring */
export interface Apartment extends RawApartment {
  /** Composite key: "{lot}/{building}" — e.g. "207/1" */
  buildingKey: string;
  /** Parsed base directions from the Hebrew composite string */
  directions: BaseDirection[];
  /** How many directions the apartment faces (1, 2, or 3) */
  directionCount: number;
  /** Numeric rooms value */
  roomsNum: number;
  /** Primary floor number (lowest if multi-floor) */
  floorPrimary: number;
  /** Floor bucket label */
  floorBucket: string;
  /** Layout category derived from remarks + floor data */
  layout: "regular" | "garden" | "garden_duplex" | "roof_duplex";
}

/* ─── Scoring ─────────────────────────────────── */

/** All parameter IDs the user can score */
export type ParameterId =
  | "rooms"
  | "air_direction"
  | "air_direction_count"
  | "building"
  | "floor"
  | "layout"
  | "price"
  | "area_sqm"
  | "balcony_area_sqm"
  | "storage_area_sqm"
  | "type";

/** How a parameter is scored: categorical (fixed values) or bucketed (ranges) */
export type ParameterKind = "categorical" | "bucketed";

/** Configuration for a scorable parameter */
export interface ParameterConfig {
  id: ParameterId;
  kind: ParameterKind;
  /** Display-friendly labels keyed by locale: { en: "...", he: "..." } */
  label: { en: string; he: string };
  /**
   * For categorical: the possible value keys (e.g. ["3", "4", "4.5", "5", "6"] for rooms).
   * For bucketed: the bucket labels (e.g. ["₪1.08M–1.30M", ...]).
   */
  values: string[];
  /** Human-readable labels per value, keyed by locale */
  valueLabels: Record<string, { en: string; he: string }>;
  /** Whether this parameter is optional/advanced (collapsed by default) */
  advanced?: boolean;
}

/** A single bucket definition for numeric parameters */
export interface BucketDef {
  label: string;
  labelHe: string;
  min: number;
  max: number;
}

/** Map from parameter ID to its bucket definitions */
export type BucketMap = Partial<Record<ParameterId, BucketDef[]>>;

/** User-assigned scores: paramId → valueKey → score (1–5) */
export type ValueScores = Record<string, Record<string, number>>;

/** User-assigned importance weights: paramId → weight (1–5) */
export type ImportanceWeights = Record<string, number>;

/* ─── Profiles ────────────────────────────────── */

/** A named user profile containing scores and weights */
export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  scores: ValueScores;
  weights: ImportanceWeights;
  /** Optional manual ordering override (array of property_slugs) */
  manualOrder?: string[];
  /** Free-text notes per apartment: property_slug → note text */
  notes?: Record<string, string>;
}

/** Ranked apartment with computed score */
export interface RankedApartment {
  apartment: Apartment;
  totalScore: number;
  /** Per-parameter breakdown: paramId → weighted contribution */
  breakdown: Record<string, number>;
}

/* ─── Change History ──────────────────────────── */

/** Action types tracked by the history / undo-redo system */
export type ActionType = "set-score" | "set-weight" | "reset-scores" | "randomize-scores" | "round-scores" | "set-manual-order" | "reset-manual-order";

/** Describes a single undoable action with before/after state */
export interface UndoAction {
  type: ActionType;
  /** Which profile this action belongs to */
  profileId: string;
  /** State before the action (for undo) */
  prev: unknown;
  /** State after the action (for redo) */
  next: unknown;
}

/** A single entry in the change history log */
export interface ChangeHistoryEntry {
  id: string;
  timestamp: number;
  type: string;
  profileId: string;
  description: { en: string; he: string };
  /** Full profile snapshot at this point (for restoring) */
  snapshot: {
    scores: ValueScores;
    weights: ImportanceWeights;
    manualOrder?: string[];
  };
}
