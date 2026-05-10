/**
 * Pure-data layout pipeline for the Buildings view (Results tab).
 *
 * Takes the active profile's ranked apartments plus the open-market
 * ("שיווק חופשי") apartments and produces, per building, an ordered list
 * of *floor groups* — each group is a contiguous range of floors that
 * share the same set of direction-tuple columns and renders as its own
 * mini-table (header row + body rows).
 *
 * Why floor groups instead of one table per building:
 *   Different floors in the same building often have different air-
 *   direction layouts. Forcing a single column set per building means
 *   either (a) lots of n/a cells or (b) misleading column labels.
 *   Grouping consecutive floors with the same tuple-set keeps each
 *   sub-table compact and accurate — and we just reprint the header
 *   when the layout changes.
 *
 * Multi-floor apts (roof / garden duplexes) are kept inside a single
 * group: if an apt spans floors that fall into different initial
 * groups, those groups are merged so the rowspan is well-defined.
 *
 * Pure and side-effect free — meant to be called from a `useMemo` in
 * the Buildings view component and unit-tested in isolation.
 */

import type { Apartment, BaseDirection, RankedApartment } from "../types";

/** Priority used to order directions inside a tuple and tuples in the
 *  column header row. Lower index = higher priority. */
const DIRECTION_PRIORITY: Record<BaseDirection, number> = {
  N: 0,
  E: 1,
  S: 2,
  W: 3,
};

/** A column in a floor-group grid: one specific direction tuple. */
export interface DirectionColumn {
  /** Canonical key — directions joined by "-" in priority order, e.g. "N-E-S". */
  key: string;
  /** Directions in priority order. */
  directions: BaseDirection[];
}

/** Apt placement inside a cell. Either a ranked (lottery) apartment or a
 *  free-marketing (open-market) one — they render differently. */
export type AptPlacement =
  | { kind: "ranked"; ranked: RankedApartment }
  | { kind: "freeMarketing"; apartment: Apartment };

/** A grid cell. Empty cells render as n/a. Continuation cells are skipped
 *  during render because they're covered by a rowspan from an apt cell
 *  anchored above them. */
export type LayoutCell =
  | { kind: "empty" }
  | {
      kind: "apt";
      apartments: AptPlacement[];
      /** rowSpan within the *current* floor group. Equal to the number of
       *  apt floors that fall inside this group, which may be less than
       *  the apt's full floor span when a duplex straddles a group
       *  boundary. */
      rowSpan: number;
      /** Floors covered by this specific cell (subset of the apt's floors
       *  that lie inside the current group). */
      floors: number[];
      /** All floors the apt occupies, including any outside this group.
       *  Used to render the duplex label ("5–4") consistently in every
       *  group the apt appears in. */
      aptFloors: number[];
    }
  | { kind: "continuation" };

/** A row in the grid — one floor. Rows are sorted top-floor-first. */
export interface LayoutRow {
  floor: number;
}

/** A contiguous slice of floors that share the same column set and is
 *  rendered as one mini-table inside the building card. */
export interface FloorGroup {
  /** Stable id for React keys. */
  id: string;
  columns: DirectionColumn[];
  rows: LayoutRow[];
  /** [rowIndex][colIndex] grid. Same dimensions as `rows × columns`. */
  cells: LayoutCell[][];
}

/** Counts surfaced in the building card header. */
export interface BuildingCounts {
  /** Ranked, not sold. */
  available: number;
  /** Ranked, sold (scrape or user-marked). */
  sold: number;
  /** Sold with status_changed_date equal to the global highlight date
   *  (today, or the most-recent date within `RECENT_WINDOW_DAYS`).
   *  Always 0 when no global highlight applies. */
  soldHighlight: number;
  /** Open-market units (any state). */
  freeMarketing: number;
  /** Sum of all (ranked + free-marketing). */
  total: number;
}

/** Full layout for one building. */
export interface BuildingLayout {
  buildingKey: string;
  lot: string;
  building: number;
  /** Highest totalScore among non-sold ranked apartments in this building,
   *  or null if there are none. Used for the "top score" pill. */
  topScore: number | null;
  counts: BuildingCounts;
  /** Ordered top-to-bottom — the first group is the highest-floor slice. */
  groups: FloorGroup[];
  /** Total floor count across all groups (for the building summary). */
  floorCount: number;
  /** Global most-recent `status_changed_date` among all sold ranked apts
   *  (not just this building), in YYYY-MM-DD form. `null` when no sold
   *  apt has a date or the most-recent date is older than the recent
   *  window. Same value on every building in the result. */
  highlightDate: string | null;
  /** "today" if `highlightDate === today`, "recently" if it's an earlier
   *  date inside the recent window, `null` when there's nothing to
   *  highlight. */
  highlightKind: "today" | "recently" | null;
}

/** Days inside which a past most-recent status change is still labeled
 *  "recently"; older max dates are suppressed (no highlight). */
export const RECENT_WINDOW_DAYS = 7;

/* ─── helpers ─────────────────────────────────────────────────────────── */

/** Parse a floor string like "5", "0,-1", "6,7" into the list of integer
 *  floors the apartment occupies. */
function parseFloors(floor: string): number[] {
  if (!floor) return [];
  return floor
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

/** Canonicalize a directions array: dedupe + sort by priority. */
function canonicalDirections(dirs: BaseDirection[]): BaseDirection[] {
  return [...new Set(dirs)].sort(
    (a, b) => DIRECTION_PRIORITY[a] - DIRECTION_PRIORITY[b]
  );
}

/** Stable string key for a direction tuple. */
function tupleKey(dirs: BaseDirection[]): string {
  return canonicalDirections(dirs).join("-");
}

/** Sort comparator for column keys: by length asc, then by priority order. */
function compareTupleKeys(a: string, b: string): number {
  const al = a.split("-") as BaseDirection[];
  const bl = b.split("-") as BaseDirection[];
  if (al.length !== bl.length) return al.length - bl.length;
  for (let i = 0; i < al.length; i++) {
    const pa = DIRECTION_PRIORITY[al[i]];
    const pb = DIRECTION_PRIORITY[bl[i]];
    if (pa !== pb) return pa - pb;
  }
  return 0;
}

/** Compare two buildingKeys ("207/3" vs "208/10") numerically by lot then
 *  by building number. */
function compareBuildingKey(a: string, b: string): number {
  const [aLot, aBld] = a.split("/").map((s) => parseInt(s, 10));
  const [bLot, bBld] = b.split("/").map((s) => parseInt(s, 10));
  if (aLot !== bLot) return aLot - bLot;
  return aBld - bBld;
}

/** Today as YYYY-MM-DD in UTC — matches how `status_changed_date` is
 *  written by the scraper and the existing comparisons in this file. */
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO date `n` days before today (UTC). */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Find the global most-recent `status_changed_date` among sold ranked
 *  apartments. Returns `{ date, kind }` describing the highlight to apply,
 *  or `null` when there is none (no sold apt has a date, or the max is
 *  older than the recent window). User-marked sold apts that lack a
 *  `status_changed_date` are intentionally ignored.
 *
 * Exported so the Ranking table can reuse the same definition as the
 * Buildings grid (darker hatch + sold chip for that batch). */
export function computeSoldHighlight(
  ranked: RankedApartment[]
): { date: string; kind: "today" | "recently" } | null {
  let max: string | null = null;
  for (const r of ranked) {
    const apt = r.apartment;
    if (!apt.isSold) continue;
    const d = apt.status_changed_date;
    if (!d) continue;
    if (max === null || d > max) max = d;
  }
  if (max === null) return null;
  const today = isoToday();
  const cutoff = isoDaysAgo(RECENT_WINDOW_DAYS);
  if (max < cutoff) return null;
  return { date: max, kind: max === today ? "today" : "recently" };
}

/* ─── main ────────────────────────────────────────────────────────────── */

interface RawAptRecord {
  floors: number[];
  tuple: BaseDirection[];
  tupleK: string;
  placement: AptPlacement;
  isSold: boolean;
}

/** Build per-building grids from the active profile's ranked apartments and
 *  the global open-market list. Pure — safe to memoize on its inputs. */
export function buildBuildingsLayout(
  ranked: RankedApartment[],
  freeMarketing: Apartment[]
): BuildingLayout[] {
  const buildingsMap = new Map<
    string,
    { lot: string; building: number; records: RawAptRecord[] }
  >();

  const ensure = (key: string, lot: string, building: number) => {
    let g = buildingsMap.get(key);
    if (!g) {
      g = { lot, building, records: [] };
      buildingsMap.set(key, g);
    }
    return g;
  };

  for (const r of ranked) {
    const apt = r.apartment;
    const floors = parseFloors(apt.floor);
    if (floors.length === 0) continue;
    const tuple = canonicalDirections(apt.directions);
    if (tuple.length === 0) continue;
    const g = ensure(apt.buildingKey, apt.lot, apt.building);
    g.records.push({
      floors,
      tuple,
      tupleK: tuple.join("-"),
      placement: { kind: "ranked", ranked: r },
      isSold: apt.isSold,
    });
  }

  for (const apt of freeMarketing) {
    const floors = parseFloors(apt.floor);
    if (floors.length === 0) continue;
    const tuple = canonicalDirections(apt.directions);
    if (tuple.length === 0) continue;
    const g = ensure(apt.buildingKey, apt.lot, apt.building);
    g.records.push({
      floors,
      tuple,
      tupleK: tuple.join("-"),
      placement: { kind: "freeMarketing", apartment: apt },
      isSold: false,
    });
  }

  const buildings: BuildingLayout[] = [];

  // Compute the global highlight once, before per-building accounting,
  // so every building shares the same `highlightDate` / `highlightKind`.
  const highlight = computeSoldHighlight(ranked);

  for (const [buildingKey, g] of buildingsMap) {
    if (g.records.length === 0) continue;

    // ─ Floors (contiguous high → low) ──────────────────────────────────
    const floorSet = new Set<number>();
    for (const rec of g.records) for (const f of rec.floors) floorSet.add(f);
    const minF = Math.min(...floorSet);
    const maxF = Math.max(...floorSet);
    const allFloors: number[] = [];
    for (let f = maxF; f >= minF; f--) allFloors.push(f);

    // ─ Tuple set per floor ─────────────────────────────────────────────
    // Each floor's signature = sorted list of tuple keys present at that
    // floor. Single-floor apts only contribute to their floor; multi-
    // floor apts contribute to every floor they span.
    const floorTuples = new Map<number, Set<string>>();
    for (const f of allFloors) floorTuples.set(f, new Set());
    for (const rec of g.records) {
      for (const f of rec.floors) {
        floorTuples.get(f)?.add(rec.tupleK);
      }
    }

    // ─ Floor-group runs (top-down subset only) ─────────────────────────
    // Walking top→bottom, the topmost floor of a group fixes its column
    // set. A neighbouring lower floor joins the current group only when
    // its tuple set is a subset of that fixed set — tuples it lacks
    // render as n/a. A floor that introduces a *new* tuple starts a
    // fresh sub-table (with its own header) so we never grow columns
    // mid-group, even if the new tuple is a superset of the running set.
    //
    // Stored as [start, end] indices into allFloors (inclusive, top→bottom).
    const isSubset = (a: Set<string>, b: Set<string>): boolean => {
      if (a.size > b.size) return false;
      for (const k of a) if (!b.has(k)) return false;
      return true;
    };

    const mergedRanges: { start: number; end: number }[] = [];
    {
      let i = 0;
      while (i < allFloors.length) {
        const top = floorTuples.get(allFloors[i]) ?? new Set<string>();
        let j = i;
        while (j + 1 < allFloors.length) {
          const next = floorTuples.get(allFloors[j + 1]) ?? new Set<string>();
          if (!isSubset(next, top)) break;
          j++;
        }
        mergedRanges.push({ start: i, end: j });
        i = j + 1;
      }
    }

    // ─ Build each group's grid ─────────────────────────────────────────
    // Column ordering aligns shared tuples with the previous group: walk
    // the previous group's column order; tuples still present in this
    // group keep their slot, tuples no longer here leave a gap. New
    // tuples (sorted canonically) fill the gaps left-to-right, then any
    // leftover new tuples are appended at the end. The very first group
    // is sorted purely by `compareTupleKeys`. This keeps a tuple in the
    // same column across consecutive sub-tables when possible, which
    // makes the building read top-to-bottom as a coherent grid.
    const groups: FloorGroup[] = [];
    let prevColumnKeys: string[] = [];
    for (const range of mergedRanges) {
      const groupFloors = allFloors.slice(range.start, range.end + 1);
      const rows: LayoutRow[] = groupFloors.map((floor) => ({ floor }));
      const floorIndex = new Map<number, number>();
      rows.forEach((row, idx) => floorIndex.set(row.floor, idx));

      // Group columns = union of tuple keys across this group's floors.
      const tupleKeys = new Set<string>();
      for (const f of groupFloors) {
        for (const k of floorTuples.get(f) ?? []) tupleKeys.add(k);
      }

      let orderedKeys: string[];
      if (prevColumnKeys.length === 0) {
        orderedKeys = [...tupleKeys].sort(compareTupleKeys);
      } else {
        const remaining = new Set(tupleKeys);
        const newKeys = [...tupleKeys]
          .filter((k) => !prevColumnKeys.includes(k))
          .sort(compareTupleKeys);
        const slotted: (string | null)[] = prevColumnKeys.map((k) => {
          if (remaining.has(k)) {
            remaining.delete(k);
            return k;
          }
          return null;
        });
        // Fill gaps in left-to-right order with new tuples.
        for (let i = 0; i < slotted.length && newKeys.length > 0; i++) {
          if (slotted[i] === null) slotted[i] = newKeys.shift()!;
        }
        // Drop unfilled gaps (tuples gone with no replacement) and append
        // any leftover new tuples at the end.
        orderedKeys = slotted.filter((k): k is string => k !== null);
        orderedKeys.push(...newKeys);
      }

      const columns: DirectionColumn[] = orderedKeys.map((key) => ({
        key,
        directions: key.split("-") as BaseDirection[],
      }));
      const colIndex = new Map<string, number>();
      columns.forEach((c, idx) => colIndex.set(c.key, idx));
      prevColumnKeys = orderedKeys;

      const cells: LayoutCell[][] = rows.map(() =>
        columns.map(() => ({ kind: "empty" }) as LayoutCell)
      );

      // Place every record, restricting each placement to the floors of
      // this group. Apartments whose floors all fall inside this group
      // render normally; duplexes that straddle a group boundary render
      // in *every* group their floors touch, with the in-group portion
      // determining the rowspan and `aptFloors` carrying the full range.
      for (const rec of g.records) {
        const inGroupFloors = rec.floors.filter((f) => floorIndex.has(f));
        if (inGroupFloors.length === 0) continue;
        const colIdx = colIndex.get(rec.tupleK);
        if (colIdx === undefined) continue;
        const highest = Math.max(...inGroupFloors);
        const span = inGroupFloors.length;
        const anchor = floorIndex.get(highest);
        if (anchor === undefined) continue;

        const existing = cells[anchor][colIdx];
        if (existing.kind === "apt") {
          // Conflict (two apts at the same anchor + column). Stack them
          // and keep the larger rowSpan so continuation marking holds.
          existing.apartments.push(rec.placement);
          if (span > existing.rowSpan) existing.rowSpan = span;
          for (const f of inGroupFloors) {
            if (!existing.floors.includes(f)) existing.floors.push(f);
          }
          for (const f of rec.floors) {
            if (!existing.aptFloors.includes(f)) existing.aptFloors.push(f);
          }
        } else {
          cells[anchor][colIdx] = {
            kind: "apt",
            apartments: [rec.placement],
            rowSpan: span,
            floors: [...inGroupFloors],
            aptFloors: [...rec.floors],
          };
        }

        for (let i = 1; i < span; i++) {
          const r = anchor + i;
          if (r >= cells.length) break;
          if (cells[r][colIdx].kind === "empty") {
            cells[r][colIdx] = { kind: "continuation" };
          }
        }
      }

      groups.push({
        id: `${groupFloors[0]}-${groupFloors[groupFloors.length - 1]}`,
        columns,
        rows,
        cells,
      });
    }

    // ─ Canonical column ordering ───────────────────────────────────────
    // Pick the sub-table with the most columns (ties → topmost) as the
    // canonical one and sort *its* columns by ascending min apartment
    // number. Then propagate that ordering outward (down, then up): each
    // adjacent sub-table inherits column positions for tuples it shares
    // with the neighbour directly above/below that's already been placed,
    // so a column with the same direction tuple appears in the same slot
    // in stacked sub-tables. Tuples not pinned by a neighbour fill the
    // remaining slots in min-apt-number order (gaps left-to-right first,
    // then appended at the end).
    if (groups.length > 0) {
      let canonicalIdx = 0;
      for (let i = 1; i < groups.length; i++) {
        if (groups[i].columns.length > groups[canonicalIdx].columns.length) {
          canonicalIdx = i;
        }
      }

      /** Smallest numeric apartment_number anywhere in the column. */
      const minAptNum = (g: FloorGroup, colIdx: number): number => {
        let m = Infinity;
        for (const row of g.cells) {
          const cell = row[colIdx];
          if (cell.kind !== "apt") continue;
          for (const p of cell.apartments) {
            const raw =
              p.kind === "ranked"
                ? p.ranked.apartment.apartment_number
                : p.apartment.apartment_number;
            const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
            if (Number.isFinite(n) && n < m) m = n;
          }
        }
        return m;
      };

      const reorderGroup = (g: FloorGroup, perm: number[]) => {
        g.columns = perm.map((i) => g.columns[i]);
        g.cells = g.cells.map((row) => perm.map((i) => row[i]));
      };

      // 1. Canonical group: sort by min apt number asc.
      const canonical = groups[canonicalIdx];
      const canonicalPerm = canonical.columns
        .map((c, i) => ({ key: c.key, i, k: minAptNum(canonical, i) }))
        .sort((a, b) => a.k - b.k || compareTupleKeys(a.key, b.key))
        .map((x) => x.i);
      reorderGroup(canonical, canonicalPerm);

      // 2. Propagate to neighbours: align shared tuples with the already-
      //    placed adjacent group, slot the rest by min apt number.
      const reorderAgainst = (g: FloorGroup, anchorKeys: string[]) => {
        const remaining = new Map(g.columns.map((c, i) => [c.key, i]));
        // Slots driven by anchor: shared tuple → its anchor position; others null.
        const slots: (number | null)[] = anchorKeys.map((k) => {
          const i = remaining.get(k);
          if (i !== undefined) {
            remaining.delete(k);
            return i;
          }
          return null;
        });
        const leftovers = [...remaining.entries()]
          .map(([k, i]) => ({ k, i, sortKey: minAptNum(g, i) }))
          .sort((a, b) => a.sortKey - b.sortKey || compareTupleKeys(a.k, b.k));
        // Fill gaps left-to-right with leftovers, then append the rest.
        for (let s = 0; s < slots.length && leftovers.length > 0; s++) {
          if (slots[s] === null) slots[s] = leftovers.shift()!.i;
        }
        const perm = slots.filter((x): x is number => x !== null);
        for (const x of leftovers) perm.push(x.i);
        reorderGroup(g, perm);
      };

      // Walk down from canonical, anchoring to the group directly above.
      for (let i = canonicalIdx + 1; i < groups.length; i++) {
        const above = groups[i - 1];
        reorderAgainst(groups[i], above.columns.map((c) => c.key));
      }
      // Walk up from canonical, anchoring to the group directly below.
      for (let i = canonicalIdx - 1; i >= 0; i--) {
        const below = groups[i + 1];
        reorderAgainst(groups[i], below.columns.map((c) => c.key));
      }
    }


    // ─ Header counts + top score ───────────────────────────────────────
    let available = 0;
    let sold = 0;
    let soldHighlight = 0;
    let freeMarketingCount = 0;
    let topScore: number | null = null;
    for (const rec of g.records) {
      if (rec.placement.kind === "freeMarketing") {
        freeMarketingCount += 1;
        continue;
      }
      if (rec.isSold) {
        sold += 1;
        if (
          highlight !== null &&
          rec.placement.ranked.apartment.status_changed_date === highlight.date
        ) {
          soldHighlight += 1;
        }
      } else {
        available += 1;
      }
      const s = rec.placement.ranked.totalScore;
      if (!rec.isSold && (topScore === null || s > topScore)) topScore = s;
    }

    buildings.push({
      buildingKey,
      lot: g.lot,
      building: g.building,
      topScore,
      counts: {
        available,
        sold,
        soldHighlight,
        freeMarketing: freeMarketingCount,
        total: available + sold + freeMarketingCount,
      },
      groups,
      floorCount: allFloors.length,
      highlightDate: highlight?.date ?? null,
      highlightKind: highlight?.kind ?? null,
    });
  }

  buildings.sort((a, b) => compareBuildingKey(a.buildingKey, b.buildingKey));
  return buildings;
}

/* ─── exports for tests ───────────────────────────────────────────────── */

export const _internals = {
  parseFloors,
  canonicalDirections,
  tupleKey,
  compareTupleKeys,
  compareBuildingKey,
};
