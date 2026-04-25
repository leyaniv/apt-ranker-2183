import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { List, useDynamicRowHeight, useListRef, type RowComponentProps } from "react-window";
import { useTranslation } from "react-i18next";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useApp } from "../../context/AppContext";
import { ApartmentRow } from "./ApartmentRow";
import { TabHeader } from "../Layout/TabHeader";
import { ConfirmDialog } from "../Layout/ConfirmDialog";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import type { RankedApartment } from "../../types";

/** Per-row props supplied to every virtualized row via `List.rowProps`. */
interface RowData {
  displayed: RankedApartment[];
  openSlugs: Set<string>;
  toggleOpen: (slug: string) => void;
  isDesktop: boolean;
  notes: Record<string, string>;
  setNote: (slug: string, text: string) => void;
  manualOrder: string[] | null;
  scoreRankMap: Map<string, number>;
  dropTargetSlug: string | null;
  onDragStart: (slug: string) => void;
  onDragOver: (slug: string) => void;
  onDrop: (slug: string) => void;
}

const VirtualRow = function VirtualRow({
  index, style, displayed, openSlugs, toggleOpen, isDesktop,
  notes, setNote, manualOrder, scoreRankMap, dropTargetSlug,
  onDragStart, onDragOver, onDrop,
}: RowComponentProps<RowData>) {
  const ranked = displayed[index];
  if (!ranked) return null;
  const slug = ranked.apartment.property_slug;
  return (
    <div
      style={style}
      data-tour-id={index === 0 ? "apartment-row" : undefined}
    >
      <ApartmentRow
        ranked={ranked}
        rank={index + 1}
        isOpen={openSlugs.has(slug)}
        onToggle={toggleOpen}
        isDesktop={isDesktop}
        hasNote={!!notes[slug]}
        note={notes[slug]}
        onNoteChange={setNote}
        originalRank={manualOrder ? scoreRankMap.get(slug) : undefined}
        dropTargetSlug={dropTargetSlug}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
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
    notes, setNote,
  } = useApp();

  // Filter state
  const [filterRooms, setFilterRooms] = useState<string>("");
  const [filterBuilding, setFilterBuilding] = useState<string>("");
  const [filterLayout, setFilterLayout] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
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

  // Sync manualOrder when switching profiles
  const prevProfileId = useRef(activeProfile?.id);
  if (activeProfile?.id !== prevProfileId.current) {
    prevProfileId.current = activeProfile?.id;
    setManualOrder(activeProfile?.manualOrder ?? null);
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
      const edge = 60; // px from edge to trigger auto-scroll
      const maxSpeed = 18; // px per frame
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

  // Apply filters
  const filtered = useMemo(() => {
    const filterFn = (r: RankedApartment) => {
      const apt = r.apartment;
      if (filterRooms && apt.rooms !== filterRooms) return false;
      if (filterBuilding && apt.buildingKey !== filterBuilding) return false;
      if (filterLayout && apt.layout !== filterLayout) return false;
      if (filterType && apt.type !== filterType) return false;
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
  }, [rankedApartments, filterRooms, filterBuilding, filterLayout, filterType, filterMinPrice, filterMaxPrice, manualOrder]);

  // Map each slug to its original score-based rank (1-based)
  const scoreRankMap = useMemo(() => {
    const map = new Map<string, number>();
    rankedApartments.forEach((r, i) => map.set(r.apartment.property_slug, i + 1));
    return map;
  }, [rankedApartments]);

  // Apply maxResults limit (raffle position)
  const displayed = useMemo(() => {
    if (settings.maxResults != null && settings.maxResults < filtered.length) {
      return filtered.slice(0, settings.maxResults);
    }
    return filtered;
  }, [filtered, settings.maxResults]);

  const hasFilters = filterRooms || filterBuilding || filterLayout || filterType || filterMinPrice || filterMaxPrice;

  const clearFilters = () => {
    setFilterRooms("");
    setFilterBuilding("");
    setFilterLayout("");
    setFilterType("");
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
      className="mx-auto w-full sm:w-fit max-w-full flex flex-col h-full min-h-0 pb-4 sm:pb-6"
      onDragEnd={() => { dragSlugRef.current = null; setDropTargetSlug(null); stopAutoScroll(); }}
    >
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 mb-2 flex-shrink-0">
        <TabHeader title={t("results.title")} tooltip={t("results.howToUse")} />
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
        open={isDesktop || filtersOpen}
        onOpenChange={setFiltersOpen}
        data-tour-id="results-filters"
        className="flex-shrink-0 bg-white border-b border-gray-200"
      >
        <Collapsible.Trigger className="sm:hidden w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <span className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-500">
              <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z" clipRule="evenodd" />
            </svg>
            {t("results.filters")}
            {hasFilters && (
              <span className="text-xs text-blue-600 font-normal">
                ({t("results.filtersActive", { count: [filterRooms, filterBuilding, filterLayout, filterType, filterMinPrice, filterMaxPrice].filter(Boolean).length })})
              </span>
            )}
          </span>
          <span className="text-xs text-gray-400">
            {t("results.showingOf", { shown: displayed.length, total: rankedApartments.length })}
          </span>
        </Collapsible.Trigger>
        <Collapsible.Content className="data-[state=open]:block">
      <div
        className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3"
      >
        {/* Rooms filter */}
        <select
          value={filterRooms}
          onChange={(e) => setFilterRooms(e.target.value)}
          aria-label={t("results.filterRooms")}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
        >
          <option value="">{t("results.filterRooms")}</option>
          {uniqueRooms.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Building filter */}
        <select
          value={filterBuilding}
          onChange={(e) => setFilterBuilding(e.target.value)}
          aria-label={t("results.filterBuilding")}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
        >
          <option value="">{t("results.filterBuilding")}</option>
          {uniqueBuildings.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        {/* Layout filter */}
        <select
          value={filterLayout}
          onChange={(e) => setFilterLayout(e.target.value)}
          aria-label={t("results.filterLayout")}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
        >
          <option value="">{t("results.filterLayout")}</option>
          {uniqueLayouts.map((l) => (
            <option key={l} value={l}>{t(`results.layout_${l}`)}</option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          aria-label={t("results.filterType")}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
        >
          <option value="">{t("results.filterType")}</option>
          {uniqueTypes.map((tp) => (
            <option key={tp} value={tp}>{tp}</option>
          ))}
        </select>

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

        <span className="text-xs text-gray-400 ms-auto">
          {t("results.showingOf", {
            shown: displayed.length,
            total: rankedApartments.length,
          })}
        </span>

        {settings.developerTools && (
          <button
            onClick={randomizeOrder}
            className="p-1 text-base leading-none rounded hover:bg-purple-100 transition-colors"
            title={t("results.randomOrder")}
            aria-label={t("results.randomOrder")}
          >
            🎲
          </button>
        )}
      </div>
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Table header (desktop only) */}
      <div
        className="flex-shrink-0 hidden md:grid grid-cols-[28px_50px_80px_60px_70px_70px_80px_60px_90px_110px_80px]
                    items-center gap-1 px-4 py-2 bg-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider"
      >
        <span></span>
        <span>{t("results.rank")}</span>
        <span className="text-center">{t("results.building")}</span>
        <span className="text-center">{t("results.apt")}</span>
        <span className="text-center">{t("results.rooms")}</span>
        <span className="text-center">{t("results.floor")}</span>
        <span className="text-center">{t("results.layout")}</span>
        <span className="text-center">{t("results.type")}</span>
        <span className="text-center">{t("results.area")}</span>
        <span className="text-center">{t("results.price")}</span>
        <span className="text-center">{t("results.score")}</span>
      </div>

      {/* Rows */}
      <div
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
              notes,
              setNote,
              manualOrder,
              scoreRankMap,
              dropTargetSlug,
              onDragStart: handleDragStart,
              onDragOver: handleDragOver,
              onDrop: handleDrop,
            }}
            overscanCount={5}
            style={{ height: "100%", width: "100%" }}
            defaultHeight={600}
          />
        )}
      </div>
      </div>

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
    </div>
  );
}
