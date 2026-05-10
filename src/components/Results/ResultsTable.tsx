import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { List, useDynamicRowHeight, useListRef, type RowComponentProps } from "react-window";
import { useTranslation } from "react-i18next";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useApp } from "../../context/AppContext";
import { ApartmentRow } from "./ApartmentRow";
import { TabHeader } from "../Layout/TabHeader";
import { ConfirmDialog } from "../Layout/ConfirmDialog";
import { MultiSelectPopover } from "../Layout/MultiSelectPopover";
import { PrintModal } from "../Print/PrintModal";
import { CompareApartmentsModal } from "../Compare/CompareApartmentsModal";
import { track } from "../../utils/analytics";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useTableTier, TIER_LAYOUTS, type TableTier } from "../../hooks/useTableTier";
import type { ImportanceWeights, RankedApartment } from "../../types";

/** Per-row props supplied to every virtualized row via `List.rowProps`. */
interface RowData {
  displayed: RankedApartment[];
  openSlugs: Set<string>;
  toggleOpen: (slug: string) => void;
  isDesktop: boolean;
  tier: TableTier;
  notes: Record<string, string>;
  setNote: (slug: string, text: string) => void;
  /** Active profile's importance weights — used by `ApartmentRow` to color
   *  each scored cell's chip by the user's value score. */
  weights: ImportanceWeights;
  /** When true, render each scored cell as a colored chip; when false fall
   *  back to plain text. Driven by the `colorByValueScore` user setting and
   *  toggled by the swatch button next to the print action. */
  colorByValueScore: boolean;
  manualAdjustments: Record<string, number>;
  manualOrder: string[] | null;
  scoreRankMap: Map<string, number | null>;
  rankLabelMap: Map<string, number | null>;
  userExcludedSet: Set<string>;
  /** True if any visible row has been manually reordered. Drives the
   *  desktop layout's optional `(originalRank)` column. */
  anyManualReorder: boolean;
  dropTargetSlug: string | null;  onDragStart: (slug: string) => void;
  onDragOver: (slug: string) => void;
  onDrop: (slug: string) => void;
  /** When true, the table is in compare-selection mode: rows render
   *  checkboxes (desktop swaps the drag grip; mobile prepends one) and
   *  taps toggle membership in `compareSelected` instead of expanding
   *  the apartment detail. */
  compareMode: boolean;
  /** Slugs currently selected for comparison. Wrapped here so per-row
   *  selection lookup is O(1). */
  compareSelected: Set<string>;
  onToggleCompareSelect: (slug: string) => void;
  /** True when `compareSelected.size === maxCompare` — used to disable
   *  per-row checkboxes for not-yet-selected rows so the cap can't be
   *  exceeded. Selected rows stay toggleable for deselection. */
  compareAtMax: boolean;
}

const VirtualRow = function VirtualRow({
  index, style, displayed, openSlugs, toggleOpen, isDesktop, tier,
  notes, setNote, weights, colorByValueScore, manualAdjustments, manualOrder, scoreRankMap, rankLabelMap, userExcludedSet,
  anyManualReorder, dropTargetSlug,
  onDragStart, onDragOver, onDrop,
  compareMode, compareSelected, onToggleCompareSelect, compareAtMax,
}: RowComponentProps<RowData>) {
  const ranked = displayed[index];
  if (!ranked) return null;
  const slug = ranked.apartment.property_slug;
  const rankValue = rankLabelMap.get(slug);
  const rank: number | null = rankValue === undefined ? index + 1 : rankValue;
  const scoreRank = manualOrder ? scoreRankMap.get(slug) : undefined;
  const excludedReason: "manual" | "scoring" | null = userExcludedSet.has(slug)
    ? "manual"
    : ranked.excluded
      ? "scoring"
      : null;
  return (
    <div
      style={style}
      data-tour-id={index === 0 ? "apartment-row" : undefined}
    >
      <ApartmentRow
        ranked={ranked}
        rank={rank}
        isOpen={openSlugs.has(slug)}
        onToggle={toggleOpen}
        isDesktop={isDesktop}
        tier={tier}
        hasNote={!!notes[slug]}
        note={notes[slug]}
        onNoteChange={setNote}
        weights={weights}
        colorByValueScore={colorByValueScore}
        adjustment={manualAdjustments[slug] ?? 0}
        originalRank={scoreRank ?? undefined}
        anyManualReorder={anyManualReorder}
        excludedReason={excludedReason}
        dropTargetSlug={dropTargetSlug}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        compareMode={compareMode}
        isSelectedForCompare={compareSelected.has(slug)}
        onToggleCompareSelect={onToggleCompareSelect}
        compareAtMax={compareAtMax}
      />
    </div>
  );
};

/**
 * Main results table with quick-filters, ranked apartment rows,
 * and native HTML5 drag-and-drop manual reordering.
 */
export function ResultsTable() {
  const { t } = useTranslation();
  const {
    rankedApartments, activeProfile, addProfile,
    selectProfile, saveProfile, commitManualOrderToHistory, registerManualOrderSetter,
    settings, setHasUnsavedManualOrder, registerManualOrderActions,
    notes, setNote, updateSettings,
    userExcludedSet,
    weights,
    manualAdjustments,
  } = useApp();

  // Filter state. Categorical filters hold an array of selected values
  // (empty array = "no constraint, show all"). Empty array semantics keep
  // parity with the previous empty-string behavior.
  const [filterRooms, setFilterRooms] = useState<string[]>([]);
  const [filterBuilding, setFilterBuilding] = useState<string[]>([]);
  const [filterLayout, setFilterLayout] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string[]>([]);
  const [filterDirections, setFilterDirections] = useState<string[]>([]);
  const [filterMinPrice, setFilterMinPrice] = useState<string>("");
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>("");

  // Manual reorder state: null = using scored order, string[] = manually ordered slugs
  // Initialize from the active profile's saved manual order (if any)
  const [manualOrder, setManualOrder] = useState<string[] | null>(
    activeProfile?.manualOrder ?? null
  );

  // Register the setter so AppContext can drive it on undo/redo
  useEffect(() => {
    registerManualOrderSetter(setManualOrder);
    return () => registerManualOrderSetter(null);
  }, [registerManualOrderSetter]);

  // Compare-selection state. `compareMode` toggles the rows from drag/expand
  // affordances to checkboxes; `compareSelected` holds the slugs the user
  // has picked. The viewport-dependent cap and helpers that close over it
  // are declared further below, after `isDesktop`.
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState<Set<string>>(() => new Set());
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Sync manualOrder when switching profiles. Compare selection is also
  // tied to the active profile (its breakdown / scores power the popup),
  // so reset both the selection and selection-mode on profile switch.
  const prevProfileId = useRef(activeProfile?.id);
  if (activeProfile?.id !== prevProfileId.current) {
    prevProfileId.current = activeProfile?.id;
    setManualOrder(activeProfile?.manualOrder ?? null);
    setCompareMode(false);
    setCompareSelected(new Set());
    setShowCompareModal(false);
  }

  // Native drag state — stored in refs to avoid re-renders during drag
  const dragSlugRef = useRef<string | null>(null);
  const [dropTargetSlug, setDropTargetSlug] = useState<string | null>(null);
  const rowsContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollSpeedRef = useRef(0);
  const [confirmResetOrderOpen, setConfirmResetOrderOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Virtualization state
  const isDesktop = useIsDesktop();

  // Compare-mode cap and helpers (see compare state declarations above).
  // Cap is per-viewport because the popup table grows by 2 columns per
  // selected apartment — desktop comfortably fits 4 apts; mobile only 2.
  const maxCompare = isDesktop ? 4 : 2;

  // When the device shrinks below the desktop breakpoint, trim the
  // selection so we don't blow past the new (lower) cap. Mirrors the
  // breakpoint-trim effect in `CompareView`. The setState-in-effect lint
  // is silenced here because (a) breakpoint changes are user-initiated
  // and rare, so cascading-render risk is negligible, and (b) deriving
  // a clamped view in render would mean `compareSelected` (the source of
  // truth) and what's actually used downstream could disagree, which
  // would surface as stale checkboxes after a viewport shrink.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompareSelected((prev) => {
      if (prev.size <= maxCompare) return prev;
      const next = new Set<string>();
      for (const s of prev) {
        if (next.size >= maxCompare) break;
        next.add(s);
      }
      return next;
    });
  }, [maxCompare]);

  const toggleCompareSelect = useCallback(
    (slug: string) => {
      setCompareSelected((prev) => {
        const next = new Set(prev);
        if (next.has(slug)) {
          next.delete(slug);
        } else if (next.size < maxCompare) {
          next.add(slug);
        }
        return next;
      });
    },
    [maxCompare],
  );

  const exitCompareMode = useCallback(() => {
    setCompareMode(false);
    setCompareSelected(new Set());
    setShowCompareModal(false);
  }, []);

  const toggleCompareMode = useCallback(() => {
    setCompareMode((prev) => {
      const next = !prev;
      if (!next) {
        // Leaving compare mode also clears the working selection so users
        // get a clean slate next time they enter it.
        setCompareSelected(new Set());
        setShowCompareModal(false);
      } else {
        track("compare_apts_mode_entered", {});
      }
      return next;
    });
  }, []);

  const openCompareModal = useCallback(() => {
    if (compareSelected.size < 2) return;
    track("compare_apts_opened", { count: compareSelected.size });
    setShowCompareModal(true);
  }, [compareSelected]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Measure the parent's width (the tab panel) since the wrapper itself uses
  // `sm:w-fit` and would shrink-wrap to the table's fixed-px columns.
  const tier = useTableTier(containerRef, { useParent: true });
  const [openSlugs, setOpenSlugs] = useState<Set<string>>(() => new Set());
  const listRef = useListRef(null);
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: isDesktop ? 45 : 40 });

  const toggleOpen = useCallback((slug: string) => {
    setOpenSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    autoScrollSpeedRef.current = 0;
  }, []);

  const runAutoScroll = useCallback(() => {
    const el = listRef.current?.element ?? rowsContainerRef.current;
    if (!el || autoScrollSpeedRef.current === 0) {
      autoScrollRafRef.current = null;
      return;
    }
    el.scrollTop += autoScrollSpeedRef.current;
    autoScrollRafRef.current = requestAnimationFrame(runAutoScroll);
  }, [listRef]);

  const handleContainerDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const el = rowsContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Edge zone scales with container height so mobile (small viewport)
      // gets a larger relative trigger area. Clamped to a sensible range.
      const edge = Math.min(160, Math.max(100, rect.height * 0.25));
      const maxSpeed = 24; // px per frame
      let speed = 0;
      const distTop = e.clientY - rect.top;
      const distBottom = rect.bottom - e.clientY;
      if (distTop < edge && distTop >= 0) {
        speed = -Math.ceil(((edge - distTop) / edge) * maxSpeed);
      } else if (distBottom < edge && distBottom >= 0) {
        speed = Math.ceil(((edge - distBottom) / edge) * maxSpeed);
      }
      autoScrollSpeedRef.current = speed;
      if (speed !== 0 && autoScrollRafRef.current == null) {
        autoScrollRafRef.current = requestAnimationFrame(runAutoScroll);
      }
    },
    [runAutoScroll]
  );

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  // Local undo/redo stack for drag reorder session
  const [dragPast, setDragPast] = useState<(string[] | null)[]>([]);
  const [dragFuture, setDragFuture] = useState<(string[] | null)[]>([]);

  const clearDragHistory = () => {
    setDragPast([]);
    setDragFuture([]);
  };

  const dragUndo = useCallback(() => {
    setDragPast((past) => {
      if (past.length === 0) return past;
      const prev = past[past.length - 1];
      setDragFuture((f) => [...f, manualOrder]);
      setManualOrder(prev);
      return past.slice(0, -1);
    });
  }, [manualOrder]);

  const dragRedo = useCallback(() => {
    setDragFuture((future) => {
      if (future.length === 0) return future;
      const next = future[future.length - 1];
      setDragPast((p) => [...p, manualOrder]);
      setManualOrder(next);
      return future.slice(0, -1);
    });
  }, [manualOrder]);

  // Number of apartments currently flagged sold (scraped or user-marked).
  // Surfaced next to the "Hide sold" toggle so the user can see how many
  // rows the toggle would hide without flipping it.
  const soldCount = useMemo(
    () => rankedApartments.reduce((n, r) => n + (r.apartment.isSold ? 1 : 0), 0),
    [rankedApartments]
  );

  // Combined excluded count: manual exclusions + scoring exclusions, with
  // de-duplication (a slug can be in both sets, e.g. user marked it AND a
  // scoring veto applies). Surfaced next to the "Show excluded" toggle and
  // used as the basis for the "{n} excluded hidden" hint.
  const excludedCount = useMemo(() => {
    const set = new Set<string>(userExcludedSet);
    for (const r of rankedApartments) {
      if (r.excluded) set.add(r.apartment.property_slug);
    }
    return set.size;
  }, [rankedApartments, userExcludedSet]);

  // Number of apartments hidden from the visible list by the sold/excluded
  // toggles combined. Sold-and-excluded apartments are counted once.
  const hiddenCount = useMemo(() => {
    let n = 0;
    for (const r of rankedApartments) {
      const isExcluded =
        userExcludedSet.has(r.apartment.property_slug) || r.excluded === true;
      const hiddenBySold = !settings.showSold && r.apartment.isSold;
      const hiddenByExcluded = !settings.showExcluded && isExcluded;
      if (hiddenBySold || hiddenByExcluded) n += 1;
    }
    return n;
  }, [rankedApartments, userExcludedSet, settings.showSold, settings.showExcluded]);

  // Derive unique values for filter dropdowns
  const uniqueRooms = useMemo(
    () =>
      [...new Set(rankedApartments.map((r) => r.apartment.rooms))].sort(
        (a, b) => parseFloat(a) - parseFloat(b)
      ),
    [rankedApartments]
  );

  const uniqueBuildings = useMemo(
    () =>
      [...new Set(rankedApartments.map((r) => r.apartment.buildingKey))].sort(),
    [rankedApartments]
  );

  const uniqueLayouts = useMemo(
    () =>
      [...new Set(rankedApartments.map((r) => r.apartment.layout))].sort(),
    [rankedApartments]
  );

  const uniqueTypes = useMemo(
    () =>
      [...new Set(rankedApartments.map((r) => r.apartment.type))].sort(),
    [rankedApartments]
  );

  // Air directions — fixed compass order (N, E, S, W) rather than alphabetical.
  // Restricted to directions that actually appear in the data so the dropdown
  // never shows an option that would match nothing.
  const uniqueDirections = useMemo(() => {
    const present = new Set<string>();
    for (const r of rankedApartments) {
      for (const d of r.apartment.directions) present.add(d);
    }
    return (["N", "E", "S", "W"] as const).filter((d) => present.has(d));
  }, [rankedApartments]);

  // The full ranked list with the persistent "Show sold" / "Show excluded"
  // toggles applied (but no quick-filters and no maxResults). Used as the
  // "All" scope for printing so the printed view matches what the user is
  // willing to see — toggling those off should hide those apts from print
  // too.
  const rankedAfterToggles = useMemo(() => {
    return rankedApartments.filter((r) => {
      if (!settings.showSold && r.apartment.isSold) return false;
      const isExcluded =
        userExcludedSet.has(r.apartment.property_slug) || r.excluded === true;
      if (!settings.showExcluded && isExcluded) return false;
      return true;
    });
  }, [rankedApartments, settings.showSold, settings.showExcluded, userExcludedSet]);

  // Memoized Sets for O(1) membership checks inside the per-row predicate.
  // The predicate runs once per ranked apartment on every filter change, so
  // we avoid rebuilding these sets per row.
  const roomsFilterSet = useMemo(() => new Set(filterRooms), [filterRooms]);
  const buildingFilterSet = useMemo(() => new Set(filterBuilding), [filterBuilding]);
  const layoutFilterSet = useMemo(() => new Set(filterLayout), [filterLayout]);
  const typeFilterSet = useMemo(() => new Set(filterType), [filterType]);
  const directionsFilterSet = useMemo(() => new Set(filterDirections), [filterDirections]);

  // Apply filters
  const filtered = useMemo(() => {
    const filterFn = (r: RankedApartment) => {
      const apt = r.apartment;
      if (!settings.showSold && apt.isSold) return false;
      // Hide both manually-excluded and scoring-excluded apts unless
      // "Show excluded" is on. The two sources are surfaced uniformly so
      // the user sees a single "excluded" experience.
      const isExcluded = userExcludedSet.has(apt.property_slug) || r.excluded === true;
      if (!settings.showExcluded && isExcluded) return false;
      // Empty filter set = no constraint (show all).
      if (roomsFilterSet.size > 0 && !roomsFilterSet.has(apt.rooms)) return false;
      if (buildingFilterSet.size > 0 && !buildingFilterSet.has(apt.buildingKey)) return false;
      if (layoutFilterSet.size > 0 && !layoutFilterSet.has(apt.layout)) return false;
      if (typeFilterSet.size > 0 && !typeFilterSet.has(apt.type)) return false;
      // Air-direction match is OR-within-filter: an apartment matches if any
      // of its directions is in the selected set. So selecting N + E shows
      // apts facing N, apts facing E, and apts facing both.
      if (
        directionsFilterSet.size > 0 &&
        !apt.directions.some((d) => directionsFilterSet.has(d))
      ) {
        return false;
      }
      if (filterMinPrice && apt.price < parseInt(filterMinPrice)) return false;
      if (filterMaxPrice && apt.price > parseInt(filterMaxPrice)) return false;
      return true;
    };

    if (manualOrder) {
      // Build a slug→RankedApartment lookup
      const slugMap = new Map(rankedApartments.map((r) => [r.apartment.property_slug, r]));
      // Re-derive the list in manual order, filtering as we go
      const ordered: RankedApartment[] = [];
      for (const slug of manualOrder) {
        const r = slugMap.get(slug);
        if (r && filterFn(r)) ordered.push(r);
      }
      // Append any new apartments not in manualOrder (e.g., data changed)
      for (const r of rankedApartments) {
        if (!manualOrder.includes(r.apartment.property_slug) && filterFn(r)) {
          ordered.push(r);
        }
      }
      return ordered;
    }

    return rankedApartments.filter(filterFn);
  }, [rankedApartments, roomsFilterSet, buildingFilterSet, layoutFilterSet, typeFilterSet, directionsFilterSet, filterMinPrice, filterMaxPrice, manualOrder, settings.showSold, settings.showExcluded, userExcludedSet]);

  // Score-based rank lookup: counts only non-sold, non-excluded apartments.
  // Sold or excluded apts get `null`. Used to render the (parens) "original
  // rank" hint when a manual order diverges from the scored order.
  const scoreRankMap = useMemo(() => {
    const map = new Map<string, number | null>();
    let counter = 0;
    for (const r of rankedApartments) {
      const isExcluded = userExcludedSet.has(r.apartment.property_slug) || r.excluded === true;
      if (r.apartment.isSold || isExcluded) {
        map.set(r.apartment.property_slug, null);
      } else {
        counter += 1;
        map.set(r.apartment.property_slug, counter);
      }
    }
    return map;
  }, [rankedApartments, userExcludedSet]);

  // Apply maxResults limit (raffle position)
  const displayed = useMemo(() => {
    if (settings.maxResults != null && settings.maxResults < filtered.length) {
      return filtered.slice(0, settings.maxResults);
    }
    return filtered;
  }, [filtered, settings.maxResults]);

  // Display rank for the currently-shown rows: sequential among non-sold,
  // non-excluded entries in `displayed` (so manual-order mode still shows a
  // sensible 1, 2, 3… numbering). Sold or excluded rows get `null`.
  const rankLabelMap = useMemo(() => {
    const map = new Map<string, number | null>();
    let counter = 0;
    for (const r of displayed) {
      const isExcluded = userExcludedSet.has(r.apartment.property_slug) || r.excluded === true;
      if (r.apartment.isSold || isExcluded) {
        map.set(r.apartment.property_slug, null);
      } else {
        counter += 1;
        map.set(r.apartment.property_slug, counter);
      }
    }
    return map;
  }, [displayed, userExcludedSet]);

  // Whether at least one visible row has been manually reordered (display
  // rank ≠ original score rank). Drives the desktop layout's optional
  // `(originalRank)` column on both the header and each row, and the
  // tighter horizontal padding that goes with it. Skipped entirely when
  // the user hasn't touched the order — no need to scan in the common
  // case where rows trivially match the scored sequence.
  const anyManualReorder = useMemo(() => {
    if (!manualOrder) return false;
    for (const r of displayed) {
      const slug = r.apartment.property_slug;
      const displayRank = rankLabelMap.get(slug);
      const scoreRank = scoreRankMap.get(slug);
      if (displayRank != null && scoreRank != null && displayRank !== scoreRank) {
        return true;
      }
    }
    return false;
  }, [displayed, manualOrder, rankLabelMap, scoreRankMap]);

  // After a manual adjustment edit (slider in the apartment detail), follow
  // the apartment to its new position so the user can see where their nudge
  // landed. We only scroll when exactly one slug's value changed — multi-slug
  // changes (profile switches, imports) shouldn't yank the viewport. The
  // virtualizer remeasures heights asynchronously after the re-rank, so we
  // defer the scroll to the next frame to avoid landing on a stale offset.
  const prevAdjustmentsRef = useRef<Record<string, number>>(manualAdjustments);
  const prevProfileIdForScrollRef = useRef(activeProfile?.id);
  useEffect(() => {
    const prev = prevAdjustmentsRef.current;
    const curr = manualAdjustments;
    prevAdjustmentsRef.current = curr;

    // Skip on profile switches — those swap the entire map at once.
    if (activeProfile?.id !== prevProfileIdForScrollRef.current) {
      prevProfileIdForScrollRef.current = activeProfile?.id;
      return;
    }

    const allSlugs = new Set<string>([...Object.keys(prev), ...Object.keys(curr)]);
    const changed: string[] = [];
    for (const slug of allSlugs) {
      if ((prev[slug] ?? 0) !== (curr[slug] ?? 0)) changed.push(slug);
    }
    if (changed.length !== 1) return;
    const slug = changed[0];
    const idx = displayed.findIndex((r) => r.apartment.property_slug === slug);
    if (idx < 0) return;

    const raf = requestAnimationFrame(() => {
      listRef.current?.scrollToRow({ index: idx, align: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [manualAdjustments, displayed, activeProfile?.id, listRef]);

  // Number of active filter *fields* — categorical fields with at least one
  // selection plus min/max price counted independently. Mirrors the previous
  // single-select semantics (a field is "active" if it constrains results).
  const activeFilterFieldCount =
    (filterRooms.length > 0 ? 1 : 0) +
    (filterBuilding.length > 0 ? 1 : 0) +
    (filterLayout.length > 0 ? 1 : 0) +
    (filterType.length > 0 ? 1 : 0) +
    (filterDirections.length > 0 ? 1 : 0) +
    (filterMinPrice ? 1 : 0) +
    (filterMaxPrice ? 1 : 0);
  const hasFilters = activeFilterFieldCount > 0;

  const clearFilters = () => {
    setFilterRooms([]);
    setFilterBuilding([]);
    setFilterLayout([]);
    setFilterType([]);
    setFilterDirections([]);
    setFilterMinPrice("");
    setFilterMaxPrice("");
  };

  // Shuffle into a random manual order (dev tools only)
  const randomizeOrder = useCallback(() => {
    const slugs = rankedApartments.map((r) => r.apartment.property_slug);
    // Fisher-Yates shuffle
    for (let i = slugs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slugs[i], slugs[j]] = [slugs[j], slugs[i]];
    }
    setDragPast((p) => [...p, manualOrder]);
    setDragFuture([]);
    setManualOrder(slugs);
  }, [rankedApartments, manualOrder]);

  // Native drag handlers — no React re-renders during drag
  const handleDragStart = useCallback((slug: string) => {
    dragSlugRef.current = slug;
  }, []);

  const handleDragOver = useCallback((slug: string) => {
    setDropTargetSlug((prev) => (prev === slug ? prev : slug));
  }, []);

  const handleDrop = useCallback(
    (targetSlug: string) => {
      const sourceSlug = dragSlugRef.current;
      dragSlugRef.current = null;
      setDropTargetSlug(null);
      stopAutoScroll();
      if (!sourceSlug || sourceSlug === targetSlug) return;

      // Initialize from the full ranked list if this is the first reorder
      const baseSlugs = manualOrder ?? rankedApartments.map((r) => r.apartment.property_slug);
      const fullOldIndex = baseSlugs.indexOf(sourceSlug);
      const fullNewIndex = baseSlugs.indexOf(targetSlug);
      if (fullOldIndex === -1 || fullNewIndex === -1) return;

      const newOrder = [...baseSlugs];
      const [moved] = newOrder.splice(fullOldIndex, 1);
      newOrder.splice(fullNewIndex, 0, moved);
      setDragPast((p) => [...p, manualOrder]);
      setDragFuture([]);
      setManualOrder(newOrder);
    },
    [manualOrder, rankedApartments]
  );

  // Whether the current manual order matches what's saved in the profile
  const orderIsSaved = useMemo(() => {
    if (!manualOrder) return true;
    const saved = activeProfile?.manualOrder;
    if (!saved) return false;
    if (saved.length !== manualOrder.length) return false;
    return saved.every((s, i) => s === manualOrder[i]);
  }, [manualOrder, activeProfile?.manualOrder]);

  // Sync unsaved state to context so App.tsx can guard tab switches
  useEffect(() => {
    setHasUnsavedManualOrder(!orderIsSaved);
  }, [orderIsSaved, setHasUnsavedManualOrder]);

  // Reset manual order (also clears it from the profile)
  const resetManualOrder = () => {
    const hasSaved = !!activeProfile?.manualOrder;
    if (hasSaved) {
      setConfirmResetOrderOpen(true);
      return;
    }
    setManualOrder(null);
    clearDragHistory();
  };

  // Actually perform the reset once confirmed
  const performResetManualOrder = () => {
    commitManualOrderToHistory(undefined);
    setManualOrder(null);
    clearDragHistory();
    saveProfile({ ...activeProfile!, manualOrder: undefined });
    setConfirmResetOrderOpen(false);
  };

  // Save current manual order to the active profile
  const saveToCurrentProfile = () => {
    if (!activeProfile || !manualOrder) return;
    saveProfile({ ...activeProfile, manualOrder });
    commitManualOrderToHistory(manualOrder);
    clearDragHistory();
  };

  // Register save/discard actions for the tab guard
  useEffect(() => {
    registerManualOrderActions({
      save: () => {
        if (activeProfile && manualOrder) {
          saveProfile({ ...activeProfile, manualOrder });
          commitManualOrderToHistory(manualOrder);
          clearDragHistory();
        }
      },
      discard: () => {
        setManualOrder(activeProfile?.manualOrder ?? null);
        clearDragHistory();
      },
    });
    return () => registerManualOrderActions(null);
  }, [activeProfile, manualOrder, saveProfile, commitManualOrderToHistory, registerManualOrderActions]);

  // Print modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Save manual order as a new profile (copies current scores/weights)
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const saveAsInputRef = useRef<HTMLInputElement>(null);

  const openSaveAsModal = () => {
    setSaveAsName(activeProfile ? `${activeProfile.name} (manual)` : "");
    setShowSaveAsModal(true);
    setTimeout(() => saveAsInputRef.current?.focus(), 0);
  };

  const confirmSaveAs = () => {
    if (!activeProfile || !saveAsName.trim()) return;
    const newProfile = addProfile(saveAsName.trim());
    saveProfile({
      ...newProfile,
      scores: { ...activeProfile.scores },
      weights: { ...activeProfile.weights },
    });
    selectProfile(newProfile.id);
    setManualOrder(null);
    setShowSaveAsModal(false);
  };

  if (!activeProfile) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 mb-3">{t("profile.select")}</p>
        <button
          onClick={() => addProfile(t("profile.defaultName"))}
          className="px-4 py-2 bg-blue-600 text-white rounded-md
                     hover:bg-blue-700 transition-colors text-sm"
        >
          {t("profile.create")}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full sm:w-fit max-w-full flex flex-col h-full min-h-0 px-2 sm:px-0 pb-18 sm:pb-6"
      onDragEnd={() => { dragSlugRef.current = null; setDropTargetSlug(null); stopAutoScroll(); }}
    >
      <div className="px-4 sm:px-6 pt-2 sm:pt-6 mb-2 flex-shrink-0 flex items-center gap-2">
        <TabHeader title={t("results.title")} titleShort={t("results.titleShort")} tooltip={t("results.howToUse")} />
        {/* Toggle: paint each scored cell with a color matching the user's
            value score. Desktop-only — the chips only render in the
            desktop row layout, and the mobile row is too tight for an
            extra header control. Active state mirrors the showSold /
            showExcluded toggles' "blue tint" so all on/off chrome looks
            consistent. */}
        {isDesktop && (
          <button
            type="button"
            role="switch"
            aria-checked={settings.colorByValueScore}
            onClick={() => updateSettings({ colorByValueScore: !settings.colorByValueScore })}
            title={t("results.colorByScoreTooltip")}
            aria-label={t("results.colorByScore")}
            className={`ms-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md border transition-colors ${
              settings.colorByValueScore
                ? "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
              <path d="M4.25 2A2.25 2.25 0 0 0 2 4.25v2.5A2.25 2.25 0 0 0 4.25 9h2.5A2.25 2.25 0 0 0 9 6.75v-2.5A2.25 2.25 0 0 0 6.75 2h-2.5ZM4.25 11A2.25 2.25 0 0 0 2 13.25v2.5A2.25 2.25 0 0 0 4.25 18h2.5A2.25 2.25 0 0 0 9 15.75v-2.5A2.25 2.25 0 0 0 6.75 11h-2.5ZM11 4.25A2.25 2.25 0 0 1 13.25 2h2.5A2.25 2.25 0 0 1 18 4.25v2.5A2.25 2.25 0 0 1 15.75 9h-2.5A2.25 2.25 0 0 1 11 6.75v-2.5ZM13.25 11A2.25 2.25 0 0 0 11 13.25v2.5A2.25 2.25 0 0 0 13.25 18h2.5A2.25 2.25 0 0 0 18 15.75v-2.5A2.25 2.25 0 0 0 15.75 11h-2.5Z" />
            </svg>
            <span>{t("results.colorByScore")}</span>
          </button>
        )}
        {/* Compare-mode toggle. Active state mirrors the blue tint used by
            the existing `colorByValueScore` / `showSold` toggles so all
            on/off chrome reads consistently. Clicking it again exits the
            mode (and clears the working selection via `toggleCompareMode`).
            On mobile this picks up `ms-auto` since `colorByScore` is
            desktop-only and Compare is the first action button on the row. */}
        <button
          type="button"
          role="switch"
          aria-checked={compareMode}
          onClick={toggleCompareMode}
          title={t("results.compareTooltip")}
          aria-label={t("results.compare")}
          data-tour-id="compare-button"
          className={`${isDesktop ? "" : "ms-auto "}inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md border transition-colors ${
            compareMode
              ? "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
            <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 2 4.75ZM2 10a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 2 15.25ZM12.5 4a.75.75 0 0 1 .75.75v.25h.25a.75.75 0 0 1 0 1.5h-.25v.25a.75.75 0 0 1-1.5 0v-.25h-.25a.75.75 0 0 1 0-1.5h.25v-.25A.75.75 0 0 1 12.5 4Zm4 5.25a.75.75 0 0 1 .75.75v.25h.25a.75.75 0 0 1 0 1.5h-.25v.25a.75.75 0 0 1-1.5 0V11.75h-.25a.75.75 0 0 1 0-1.5h.25V10a.75.75 0 0 1 .75-.75Zm-2 5.25a.75.75 0 0 1 .75.75v.25h.25a.75.75 0 0 1 0 1.5h-.25v.25a.75.75 0 0 1-1.5 0v-.25h-.25a.75.75 0 0 1 0-1.5h.25v-.25a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
          </svg>
          <span>{t("results.compare")}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowPrintModal(true)}
          title={t("print.buttonTip")}
          aria-label={t("print.buttonAria")}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm text-gray-700
                     bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-500">
            <path fillRule="evenodd" d="M5 2.75A2.75 2.75 0 0 1 7.75 0h4.5A2.75 2.75 0 0 1 15 2.75V5h.75A2.25 2.25 0 0 1 18 7.25v5.5A2.25 2.25 0 0 1 15.75 15H15v2.25A2.75 2.75 0 0 1 12.25 20h-4.5A2.75 2.75 0 0 1 5 17.25V15h-.75A2.25 2.25 0 0 1 2 12.75v-5.5A2.25 2.25 0 0 1 4.25 5H5V2.75ZM6.5 5h7V2.75c0-.69-.56-1.25-1.25-1.25h-4.5c-.69 0-1.25.56-1.25 1.25V5Zm0 9.5v2.75c0 .69.56 1.25 1.25 1.25h4.5c.69 0 1.25-.56 1.25-1.25V14.5h-7Zm9-7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" clipRule="evenodd" />
          </svg>
          <span>{t("print.button")}</span>
        </button>
      </div>
      {/* Manual reorder banner */}
      {manualOrder && (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 bg-amber-50 border-b border-amber-200">
          <span className="text-sm font-medium text-amber-700 flex-shrink-0">
            ⚠ {t("results.manuallyReordered")}
          </span>
          {/* Drag session undo/redo — only visible when there are unsaved drags */}
          {!orderIsSaved && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={dragUndo}
                disabled={dragPast.length === 0}
                title={t("common.undo")}
                aria-label={t("common.undo")}
                className={`p-1 rounded transition-colors ${
                  dragPast.length > 0
                    ? "text-amber-700 hover:bg-amber-100"
                    : "text-amber-300 cursor-default"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={dragRedo}
                disabled={dragFuture.length === 0}
                title={t("common.redo")}
                aria-label={t("common.redo")}
                className={`p-1 rounded transition-colors ${
                  dragFuture.length > 0
                    ? "text-amber-700 hover:bg-amber-100"
                    : "text-amber-300 cursor-default"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M12.207 2.232a.75.75 0 0 0 .025 1.06l4.146 3.958H6.375a5.375 5.375 0 0 0 0 10.75H9.25a.75.75 0 0 0 0-1.5H6.375a3.875 3.875 0 0 1 0-7.75h10.003l-4.146 3.957a.75.75 0 0 0 1.036 1.085l5.5-5.25a.75.75 0 0 0 0-1.085l-5.5-5.25a.75.75 0 0 0-1.06.025Z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2 ms-auto">
            <button
              onClick={resetManualOrder}
              title={t("results.resetOrderTip")}
              className="px-3 py-1 text-xs font-medium text-gray-600 bg-white
                         border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              {t("results.resetOrder")}
            </button>
            <button
              onClick={saveToCurrentProfile}
              disabled={orderIsSaved}
              title={t("results.saveToProfileTip")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                orderIsSaved
                  ? "bg-gray-200 text-gray-400 cursor-default"
                  : "text-white bg-green-600 hover:bg-green-700"
              }`}
            >
              {t("results.saveToProfile")}
            </button>
            <button
              onClick={openSaveAsModal}
              title={t("results.saveAsProfileTip")}
              className="px-3 py-1 text-xs font-medium text-gray-600 bg-white
                         border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              {t("results.saveAsProfile")}
            </button>
          </div>
        </div>
      )}

      {/* Filters + table wrapper */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Filters */}
      <Collapsible.Root
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        data-tour-id="results-filters"
        className="flex-shrink-0 bg-white border-b border-gray-200"
      >
        {/* Always-visible toolbar: additional-filters trigger + hide-sold + count.
            On mobile this wraps to two rows:
              row 1: hide-sold (start) + count (end via ms-auto)
              row 2: show-excluded (start) + additional-filters trigger (end
                     via me-auto on show-excluded). When the active profile
                     has no exclusions the show-excluded button is hidden and
                     the trigger sits alone at the row's start.
            On desktop the trigger is re-ordered back to the start with
            `sm:order-first`. RTL mirrors naturally via logical `ms-auto`. */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-3 px-3 sm:px-6 py-2">
          {/* Show-sold toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={settings.showSold}
            onClick={() => updateSettings({ showSold: !settings.showSold })}
            title={t("results.showSoldTooltip")}
            className={`order-1 sm:order-none inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md border transition-colors ${
              settings.showSold
                ? "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span
              className={`inline-block w-3.5 h-3.5 rounded-sm border ${
                settings.showSold ? "bg-blue-600 border-blue-600" : "bg-white border-gray-400"
              } flex items-center justify-center`}
            >
              {settings.showSold && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              )}
            </span>
            <span>{t("results.showSold")}{soldCount > 0 ? ` (${soldCount})` : ""}</span>
          </button>

          {/* Show-excluded toggle. Always rendered so users discover that
              both manually-excluded apartments and scoring-excluded ones
              (apt has at least one parameter scored ✕) can be revealed.
              On mobile sits at the start of row 2 with `me-auto` to push
              the additional-filters trigger to the row's end. */}
          <button
            type="button"
            role="switch"
            aria-checked={settings.showExcluded}
            onClick={() => updateSettings({ showExcluded: !settings.showExcluded })}
            title={t("results.showExcludedTooltip")}
            className={`order-4 sm:order-none me-auto sm:me-0 inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-sm rounded-md border transition-colors whitespace-nowrap ${
              settings.showExcluded
                ? "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span
              className={`inline-block w-3.5 h-3.5 rounded-sm border ${
                settings.showExcluded ? "bg-blue-600 border-blue-600" : "bg-white border-gray-400"
              } flex items-center justify-center`}
            >
              {settings.showExcluded && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              )}
            </span>
            <span>{t("results.showExcluded")}{excludedCount > 0 ? ` (${excludedCount})` : ""}</span>
          </button>

          <span className="order-2 sm:order-none ms-auto text-xs text-gray-400">
            {t("results.showingOf", { shown: displayed.length, total: rankedApartments.length })}
            {hiddenCount > 0 && (
              <span
                className="ms-2 text-red-500"
                title={t("results.hiddenByExclusionsTip")}
              >
                · {t("results.hiddenByExclusions", { count: hiddenCount })}
              </span>
            )}
          </span>

          {settings.developerTools && (
            <button
              onClick={randomizeOrder}
              className="order-2 sm:order-none p-1 text-base leading-none rounded hover:bg-purple-100 transition-colors"
              title={t("results.randomOrder")}
              aria-label={t("results.randomOrder")}
            >
              🎲
            </button>
          )}

          {/* Mobile-only forced row break: pushes the show-excluded toggle and
              the additional-filters trigger onto their own row. Hidden on
              desktop so everything stays on a single line. */}
          <div className="order-3 basis-full h-0 sm:hidden" aria-hidden="true" />

          <Collapsible.Trigger className="order-5 sm:order-first inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-50 transition-colors whitespace-nowrap">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-4 h-4 shrink-0 transition-colors ${
                hasFilters ? "text-blue-600" : "text-gray-500"
              }`}
              aria-hidden
            >
              <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z" clipRule="evenodd" />
            </svg>
            <span>{t("results.additionalFilters")}</span>
            {hasFilters && (
              <span className="hidden sm:inline text-xs text-blue-600 font-normal">
                ({t("results.filtersActive", { count: activeFilterFieldCount })})
              </span>
            )}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
            </svg>
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content className="data-[state=open]:block border-t border-gray-100">
      <div
        className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3"
      >
        {/* Rooms filter — popover, no search needed for ≤6 values */}
        <MultiSelectPopover
          label={t("results.filterRooms")}
          options={uniqueRooms}
          value={filterRooms}
          onChange={setFilterRooms}
        />

        {/* Building filter — popover, no search needed for ≤6 values */}
        <MultiSelectPopover
          label={t("results.filterBuilding")}
          options={uniqueBuildings}
          value={filterBuilding}
          onChange={setFilterBuilding}
        />

        {/* Layout filter — popover, no search; values are translated via i18n */}
        <MultiSelectPopover
          label={t("results.filterLayout")}
          options={uniqueLayouts}
          value={filterLayout}
          onChange={setFilterLayout}
          renderOption={(l) => t(`results.layout_${l}`)}
        />

        {/* Air direction filter — N/E/S/W in compass order. Multi-direction
            apartments match if ANY of their directions is selected. */}
        <MultiSelectPopover
          label={t("results.filterAirDirection")}
          options={uniqueDirections}
          value={filterDirections}
          onChange={setFilterDirections}
          renderOption={(d) => t(`results.directionFull_${d}`)}
        />

        {/* Type filter — searchable popover grouped by leading letter
            since there are ~45 distinct values. */}
        <MultiSelectPopover
          label={t("results.filterType")}
          options={uniqueTypes}
          value={filterType}
          onChange={setFilterType}
          searchable
          groupByFirstLetter
        />

        {/* Price range */}
        <div className="flex items-center gap-1">
          <input
            type="number"
            placeholder="Min ₪"
            value={filterMinPrice}
            onChange={(e) => setFilterMinPrice(e.target.value)}
            aria-label={t("results.filterPrice") + " Min"}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm w-24"
          />
          <span className="text-gray-400">–</span>
          <input
            type="number"
            placeholder="Max ₪"
            value={filterMaxPrice}
            onChange={(e) => setFilterMaxPrice(e.target.value)}
            aria-label={t("results.filterPrice") + " Max"}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm w-24"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {t("results.clearFilters")}
          </button>
        )}
      </div>
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Table header (desktop only). Rendered conditionally on `isDesktop`
          so it stays in lockstep with the row layout — preventing the header
          from showing while rows have already collapsed to the compact layout.

          The extra `paddingInlineEnd` reserves space for the virtualized
          List's vertical scrollbar (~15px). Because the outer wrapper uses
          `sm:w-fit`, it shrink-wraps to the header's natural width — so this
          padding pushes the wrapper wide enough that the List can host both
          the rows (fixed-px grid) AND its own scrollbar without overflow. */}
      {isDesktop && (
      <div
        className={`flex-shrink-0 grid ${
          anyManualReorder ? TIER_LAYOUTS[tier].gridWithReorder : TIER_LAYOUTS[tier].grid
        } ${
          anyManualReorder ? TIER_LAYOUTS[tier].padXWithReorder : TIER_LAYOUTS[tier].padX
        } items-center gap-1 py-2 bg-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider`}
        style={{ paddingInlineEnd: "calc(0.5rem + 16px)" }}
      >
        <span></span>
        <span>{t("results.rank")}</span>
        {/* Empty header cell for the optional `(originalRank)` column —
            the parens on each row make its meaning obvious, and labelling
            it "Score rank" would crowd the rank header next door. */}
        {anyManualReorder && <span></span>}
        <span className="text-center">{t("results.building")}</span>
        <span className="text-center">{t("results.apt")}</span>
        <span className="text-center">{t("results.rooms")}</span>
        <span className="text-center">{t("results.floor")}</span>
        {TIER_LAYOUTS[tier].showDirections && (
          <span className="text-center">{t("results.airDirection")}</span>
        )}
        <span className="text-center">{t("results.layout")}</span>
        <span className="text-center">{t("results.type")}</span>
        <span className="text-center">{t("results.area")}</span>
        {TIER_LAYOUTS[tier].showBalcony && (
          <span className="text-center">{t("results.balcony")}</span>
        )}
        <span className="text-center">{t("results.price")}</span>
        <span className="text-center">{t("results.score")}</span>
      </div>
      )}

      {/* Rows */}
      <div
        ref={rowsContainerRef}
        onDragOver={handleContainerDragOver}
        onDragLeave={stopAutoScroll}
        className="flex-1 min-h-0 relative"
      >
        {displayed.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            {t("results.noResults")}
          </div>
        ) : (
          <List
            listRef={listRef}
            rowCount={displayed.length}
            rowHeight={rowHeight}
            rowComponent={VirtualRow}
            rowProps={{
              displayed,
              openSlugs,
              toggleOpen,
              isDesktop,
              tier,
              notes,
              setNote,
              weights,
              colorByValueScore: settings.colorByValueScore,
              manualAdjustments,
              manualOrder,
              scoreRankMap,
              rankLabelMap,
              userExcludedSet,
              anyManualReorder,
              dropTargetSlug,
              onDragStart: handleDragStart,
              onDragOver: handleDragOver,
              onDrop: handleDrop,
              compareMode,
              compareSelected,
              onToggleCompareSelect: toggleCompareSelect,
              compareAtMax: compareSelected.size >= maxCompare,
            }}
            overscanCount={5}
            style={{ height: "100%", width: "100%" }}
            defaultHeight={600}
          />
        )}
      </div>
      </div>

      {/* Compare-mode action banner. Sits below the table so it doesn't
          push the rows down when the user toggles selection mode (the
          rows-list is the focal area; chrome above it would also fight
          the manual-reorder banner that lives at the top). The Compare
          button is disabled until ≥2 apartments are checked; Cancel exits
          selection mode and clears the working set. */}
      {compareMode && (
        <div className="flex-shrink-0 mt-2 flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-blue-50 border border-blue-200 rounded-md">
          <span className="text-sm font-medium text-blue-700 flex-shrink-0">
            {t("results.compareSelectedCount", { count: compareSelected.size })}
          </span>
          <span className="text-xs text-blue-600/80 flex-shrink-0">
            {t("results.compareMaxHint", { max: maxCompare })}
          </span>
          {compareSelected.size < 2 && (
            <span className="text-xs text-blue-500/70 hidden sm:inline">
              · {t("results.compareDisabledHint")}
            </span>
          )}
          <div className="flex flex-wrap gap-2 ms-auto">
            <button
              onClick={exitCompareMode}
              className="px-3 py-1 text-xs font-medium text-gray-600 bg-white
                         border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              {t("results.compareCancel")}
            </button>
            <button
              onClick={openCompareModal}
              disabled={compareSelected.size < 2}
              title={
                compareSelected.size < 2
                  ? t("results.compareDisabledHint")
                  : undefined
              }
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                compareSelected.size < 2
                  ? "bg-gray-200 text-gray-400 cursor-default"
                  : "text-white bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {t("results.compareOpen")}
            </button>
          </div>
        </div>
      )}

      {/* Save as new profile modal */}
      {showSaveAsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowSaveAsModal(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowSaveAsModal(false);
            if (e.key === "Enter") confirmSaveAs();
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t("results.saveAsProfile")}
            </h2>
            <div className="space-y-2">
              <label
                htmlFor="saveAsName"
                className="block text-sm font-medium text-gray-700"
              >
                {t("profile.namePrompt")}
              </label>
              <input
                ref={saveAsInputRef}
                id="saveAsName"
                type="text"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowSaveAsModal(false);
                  if (e.key === "Enter") confirmSaveAs();
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                           focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowSaveAsModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800
                           border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmSaveAs}
                disabled={!saveAsName.trim()}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md
                           hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmResetOrderOpen && (
        <ConfirmDialog
          title={t("results.resetOrder")}
          message={t("results.confirmResetOrder")}
          confirmLabel={t("results.resetOrder")}
          danger
          onConfirm={performResetManualOrder}
          onCancel={() => setConfirmResetOrderOpen(false)}
        />
      )}

      {showPrintModal && (
        <PrintModal
          ranked={rankedAfterToggles}
          visible={displayed}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Compare-apartments popup. Only mounts when the user has explicitly
          opened it AND has at least 2 selections — the open button in the
          banner enforces the minimum, but we double-check here so any
          stale state never renders an empty/single-column table. The slug
          set is intersected with `rankedApartments` so apartments hidden
          by filters or sold/excluded toggles still appear (they remain
          ranked under the active profile), while slugs that have been
          deleted entirely just drop out. */}
      {showCompareModal && compareSelected.size >= 2 && (
        <CompareApartmentsModal
          selected={(() => {
            const slugMap = new Map(
              rankedApartments.map((r) => [r.apartment.property_slug, r]),
            );
            const ordered: RankedApartment[] = [];
            for (const slug of compareSelected) {
              const r = slugMap.get(slug);
              if (r) ordered.push(r);
            }
            return ordered;
          })()}
          ranks={rankLabelMap}
          weights={weights}
          manualAdjustments={manualAdjustments}
          notes={notes}
          onClose={() => setShowCompareModal(false)}
        />
      )}
    </div>
  );
}
