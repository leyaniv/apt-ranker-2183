/* ──────────────────────────────────────────────
 *  Core domain types for the Eshel Apartment
 *  Priority App.
 * ────────────────────────────────────────────── */

/** Raw apartment record as loaded from apartments.json.
 *
 * Most fields are present on lottery apartments. Open-market
 * ("שיווק חופשי") units come from the WordPress REST API only and lack
 * the detail-page fields (price, area, type, building number, parking,
 * storage, PDFs). Those are marked optional. For open-market units the
 * scraper writes the API's `apartment_number_from_api` field instead of
 * `apartment_number`; that field is the building number, not the apt
 * number, and is the only thing tying the record to a building. */
export interface RawApartment {
  property_slug: string;
  rooms: string;
  floor: string;
  type?: string;
  price?: number;
  area_sqm?: number;
  balcony_area_sqm?: number;
  storage_area_sqm?: number;
  storage_id?: string;
  parking_count?: number;
  /**
   * Assigned covered-parking spot numbers from the contractor's per-lot
   * parking PDFs (section 6.2). The two fields mirror the source's column
   * names: `parking_spot_1` ⇄ `מס׳ חניה 1`, `parking_spot_2` ⇄ `מס׳ חניה 2`.
   * Both are absent for open-market units and for any apartment whose
   * parking allocation hasn't been transcribed yet (see `data/parking.json`).
   */
  parking_spot_1?: number;
  parking_spot_2?: number;
  building?: number;
  apartment_number?: number;
  /** Building number as returned by the WP REST API. Present on
   * open-market units (where `building` is missing). Despite the name,
   * this is the *building* number, not the apartment number. */
  apartment_number_from_api?: string;
  air_direction: string;
  status: string;
  lot: string;
  price_per_sqm?: number | null;
  detail_url: string;
  pdf_apartment_plan?: string;
  pdf_floor_plan?: string;
  pdf_parking_storage?: string;
  pdf_development?: string;
  pdf_other?: string[];
  pdf_apartment_plan_url?: string;
  pdf_floor_plan_url?: string;
  pdf_parking_storage_url?: string;
  pdf_development_url?: string;
  pdf_other_urls?: string[];
  remarks: string;
  /** Date the status changed (e.g. when marked sold), ISO format YYYY-MM-DD */
  status_changed_date?: string;
}

/** Base direction extracted from composite air_direction strings */
export type BaseDirection = "N" | "E" | "S" | "W";

/** Cleaned apartment with derived fields ready for scoring.
 *
 *  Fields that are optional on `RawApartment` (because open-market units
 *  arrive without them) are narrowed back to required here — `cleanApartments`
 *  fills concrete defaults so consumers can rely on these being present at
 *  runtime. Open-market units carry zero / empty values for those fields. */
export interface Apartment extends RawApartment {
  // Narrowed from RawApartment optionals — defaults filled by cleanApartments.
  type: string;
  price: number;
  area_sqm: number;
  balcony_area_sqm: number;
  storage_area_sqm: number;
  storage_id: string;
  parking_count: number;
  building: number;
  apartment_number: number;
  price_per_sqm: number;
  pdf_other: string[];

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
  layout:
    | "regular"
    | "garden"
    | "garden_duplex"
    | "roof_duplex"
    | "upper_duplex"
    | "double_height_duplex";
  /** True if the apartment is considered sold (scraped status "נמכר" or user-marked) */
  isSold: boolean;
  /** True if the user manually marked this apartment as sold (cross-profile, persisted) */
  userMarkedSold: boolean;
  /** True for open-market ("שיווק חופשי") units. Excluded from ranking and
   *  from the list / compare / print views; only the Buildings view shows them. */
  isFreeMarketing: boolean;
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
  /**
   * Per-profile manual exclusion list: apartments the user has marked as
   * excluded for this profile. Excluded apartments are still ranked, but
   * are hidden from the results table by default and badged when shown.
   * Stored as a deduplicated list of property_slug values.
   */
  excludedSlugs?: string[];
}

/** Ranked apartment with computed score */
export interface RankedApartment {
  apartment: Apartment;
  totalScore: number;
  /** Sum of effective importance weights actually used in scoring (matches breakdown keys). */
  totalWeight: number;
  /** Per-parameter breakdown: paramId → weighted contribution */
  breakdown: Record<string, number>;
  /**
   * True when this apartment was excluded by the active profile's scoring
   * (at least one contributing parameter scored 0). Only set when the
   * caller of `rankApartments` opted in via `includeExcluded`. Excluded
   * entries are scored with 0→1 substitution (so they have a real number)
   * and are excluded from the min/max used for 1–5 normalization.
   */
  excluded?: boolean;
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
