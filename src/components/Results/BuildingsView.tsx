/**
 * Buildings view — alternative rendering for the Results tab that lays
 * apartments out as a per-building grid of (floor × air-direction) cells.
 *
 * Used when `settings.resultsViewMode === "buildings"`. Wired in by
 * `ResultsTable.tsx`. See `utils/buildingsLayout.ts` for the (pure)
 * layout pipeline.
 *
 * Design notes:
 *  - The grid table inherits the document direction so cells and chips
 *    follow the UI locale (RTL in Hebrew). Column order is decided in
 *    `buildingsLayout.ts` and rendered as-is; in RTL, the browser
 *    flips the visual order of `<th>`/`<td>` siblings naturally.
 *  - Sold / scoring-excluded / user-excluded apartments are *dimmed in
 *    place* rather than removed, so the spatial layout of the building
 *    stays intact regardless of the toggle states.
 *  - Open-market ("שיווק חופשי") apartments fill cells that would
 *    otherwise be n/a. They are non-interactive (no detail modal).
 *  - Multi-floor apartments use real HTML rowspan with a left accent
 *    stripe so they read as merged cells.
 *  - On phones every row is a fixed compact height showing only `#N` +
 *    score chip; on desktop rows widen to show type / rooms too.
 */

import { useMemo, useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useApp } from "../../context/AppContext";
import { ApartmentDetail } from "./ApartmentDetail";
import {
  buildBuildingsLayout,
  type BuildingLayout,
  type FloorGroup,
  type LayoutCell,
  type AptPlacement,
} from "../../utils/buildingsLayout";
import type { Apartment, RankedApartment } from "../../types";

/** Map a 1–5 score to a Tailwind class pair (bg + text). Mirrors the chip
 *  style used elsewhere in the app and is dark-mode aware via the gray
 *  overrides in index.css. */
function scoreChipClass(score: number): string {
  if (score >= 4.2) return "bg-green-100 text-green-800 dark:text-green-900";
  if (score >= 3.5) return "bg-lime-100 text-lime-800 dark:text-lime-900";
  if (score >= 2.8) return "bg-yellow-100 text-yellow-800 dark:text-yellow-900";
  if (score >= 2.0) return "bg-orange-100 text-orange-800 dark:text-orange-900";
  return "bg-red-100 text-red-800 dark:text-red-900";
}

/* ─── Cell ────────────────────────────────────────────────────────────── */

interface CellRendererProps {
  cell: LayoutCell;
  rowSpan: number;
  columnCount: number;
  isUserExcluded: (slug: string) => boolean;
  onOpenRanked: (ranked: RankedApartment) => void;
  /** Global most-recent sold date (today or any date inside the recent
   *  window). Sold apts whose `status_changed_date` equals this get the
   *  brighter red hatch. `null` when no highlight applies. */
  highlightDate: string | null;
}

function ApartmentCell({ cell, rowSpan, columnCount, isUserExcluded, onOpenRanked, highlightDate }: CellRendererProps) {
  const { t } = useTranslation();
  if (cell.kind !== "apt") return null;

  // Choose primary apt for the cell. When two apts conflict at the same
  // (floor, direction) we render the highest-scoring ranked one prominently
  // and stack the others as small chips beneath it.
  const apts = cell.apartments;
  const sorted = [...apts].sort((a, b) => {
    const sa = a.kind === "ranked" ? a.ranked.totalScore : -Infinity;
    const sb = b.kind === "ranked" ? b.ranked.totalScore : -Infinity;
    return sb - sa;
  });
  const primary = sorted[0];
  const overflow = sorted.slice(1);

  // Multi-floor apartments are conveyed by the rowspan itself; no extra
  // accent border or floor-range label is needed.

  // Three distinct backgrounds: n/a (handled by EmptyCell), sold, open
  // market. All driven by Tailwind v4 color CSS vars so they auto-flip
  // in dark mode.
  const isOpenMarket = primary.kind === "freeMarketing";
  const isSold = primary.kind === "ranked" && primary.ranked.apartment.isSold;
  const isUnavailable = isOpenMarket || isSold;

  // Brighter red hatch for sold apts that share the dataset's most-recent
  // sold date — whether that date is literally today or just "recently"
  // (the chip in the building header conveys which).
  const isSoldOnHighlightDate =
    isSold &&
    highlightDate !== null &&
    primary.kind === "ranked" &&
    primary.ranked.apartment.status_changed_date === highlightDate;

  const baseClasses =
    "align-top border border-gray-100 dark:border-gray-200 p-0 " +
    (isUnavailable ? "" : "bg-green-50 dark:bg-green-50 ");

  let tdStyle: React.CSSProperties | undefined;
  if (isSoldOnHighlightDate) {
    tdStyle = {
      backgroundImage:
        "repeating-linear-gradient(135deg, var(--color-red-200), var(--color-red-200) 6px, var(--color-red-300) 6px, var(--color-red-300) 12px)",
      backgroundColor: "var(--color-red-200)",
    };
  } else if (isSold) {
    tdStyle = {
      backgroundImage:
        "repeating-linear-gradient(135deg, var(--color-red-100), var(--color-red-100) 6px, var(--color-red-200) 6px, var(--color-red-200) 12px)",
      backgroundColor: "var(--color-red-100)",
    };
  } else if (isOpenMarket) {
    tdStyle = {
      backgroundImage:
        "repeating-linear-gradient(135deg, var(--color-gray-200), var(--color-gray-200) 6px, var(--color-gray-300) 6px, var(--color-gray-300) 12px)",
      backgroundColor: "var(--color-gray-200)",
    };
  }

  return (
    <td rowSpan={rowSpan} className={baseClasses} style={tdStyle}>
      <CellPlacement
        placement={primary}
        columnCount={columnCount}
        isUserExcluded={isUserExcluded}
        onOpenRanked={onOpenRanked}
      />
      {overflow.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-200 px-2 py-1 flex flex-wrap gap-1">
          <span className="text-[10px] text-gray-400">
            {t("buildingsView.alsoHere")}:
          </span>
          {overflow.map((p, i) => (
            <OverflowChip key={i} placement={p} onOpenRanked={onOpenRanked} />
          ))}
        </div>
      )}
    </td>
  );
}

interface CellPlacementProps {
  placement: AptPlacement;
  columnCount: number;
  isUserExcluded: (slug: string) => boolean;
  onOpenRanked: (ranked: RankedApartment) => void;
}

/** Desktop-only info block shown inside every apartment cell. Two
 *  lines: "rooms · area" and "layout · type". Each individual field is
 *  skipped when missing; a line is hidden when both of its fields are
 *  empty. Color is inherited so it works inside both the ranked button
 *  and the amber open-market box. */
function CellInfoLine({ apt }: { apt: Apartment }) {
  const { t } = useTranslation();
  const top: string[] = [];
  if (apt.rooms) top.push(`${apt.rooms} ${t("results.roomsShort")}`);
  if (apt.area_sqm) top.push(`${apt.area_sqm} ${t("results.areaUnit")}`);
  const bottom: string[] = [];
  if (apt.layout && apt.layout !== "regular") {
    bottom.push(t(`results.layout_${apt.layout}`));
  }
  if (apt.type) bottom.push(apt.type);
  const priceStr = apt.price ? `₪${apt.price.toLocaleString()}` : "";
  if (top.length === 0 && bottom.length === 0 && !priceStr) return null;
  return (
    <div className="hidden sm:block text-[11px] opacity-80 leading-tight">
      {top.length > 0 && <div className="truncate">{top.join(" · ")}</div>}
      {(bottom.length > 0 || priceStr) && (
        <div className="flex justify-between gap-1">
          <span className="truncate">{bottom.join(" · ")}</span>
          {priceStr && <span className="flex-shrink-0">{priceStr}</span>}
        </div>
      )}
    </div>
  );
}

/** Mobile-only compact info: rooms on its own line, area on a separate
 *  line (hidden if `hideArea` is set, e.g. for sold/excluded units).
 *  When `wide` is true (≤3 columns), rooms+area share a line and price
 *  is shown below. */
function MobileRoomsArea({ apt, hideArea, wide }: { apt: Apartment; hideArea?: boolean; wide?: boolean }) {
  const { t } = useTranslation();
  const showArea = !hideArea && !!apt.area_sqm;
  if (!apt.rooms && !showArea) return null;
  const priceStr = apt.price ? `₪${apt.price.toLocaleString()}` : "";

  if (wide) {
    return (
      <div className="sm:hidden text-[10px] opacity-80 leading-tight min-w-0">
        <div className="truncate">
          {apt.rooms ? `${apt.rooms} ${t("results.roomsShort")}` : ""}
          {apt.rooms && showArea ? " \u00b7 " : ""}
          {showArea ? `${apt.area_sqm} ${t("results.areaUnit")}` : ""}
        </div>
        {priceStr && <div className="truncate">{priceStr}</div>}
      </div>
    );
  }

  return (
    <div className="sm:hidden text-[10px] opacity-80 leading-tight min-w-0">
      {apt.rooms ? (
        <div className="truncate">
          {apt.rooms} {t("results.roomsShort")}
        </div>
      ) : null}
      {showArea ? (
        <div className="truncate">
          {apt.area_sqm} {t("results.areaUnit")}
        </div>
      ) : null}
    </div>
  );
}

function CellPlacement({ placement, columnCount, isUserExcluded, onOpenRanked }: CellPlacementProps) {
  const { t } = useTranslation();

  if (placement.kind === "freeMarketing") {
    const apt = placement.apartment;
    return (
      <div
        className="h-full px-0.5 py-1 sm:p-2 flex flex-col gap-0.5 cursor-default text-black dark:text-white min-w-0"
        title={t("buildingsView.openMarketTooltip")}
      >
        {/* Top row: apt number (+ chip on desktop only) */}
        <div className="flex items-center justify-between gap-1">
          <span className="font-semibold text-[11px] sm:text-xs text-black dark:text-white">
            #{apt.apartment_number || "—"}
          </span>
          <span className="hidden sm:inline-block px-1 py-0.5 rounded bg-gray-200 text-gray-700 dark:text-gray-800 text-[10px] font-semibold whitespace-nowrap">
            {t("buildingsView.openMarket")}
          </span>
        </div>
        {/* Mobile-only second row: open-market chip */}
        <span className="sm:hidden self-start px-1 rounded bg-gray-200 text-gray-700 dark:text-gray-800 text-[9px] font-semibold whitespace-nowrap">
          {t("buildingsView.openMarket")}
        </span>
        {/* Mobile rooms+area, desktop full info block */}
        <MobileRoomsArea apt={apt} wide={columnCount <= 3} />
        <CellInfoLine apt={apt} />
      </div>
    );
  }

  // Ranked
  const r = placement.ranked;
  const apt = r.apartment;
  const slug = apt.property_slug;
  const userExcluded = isUserExcluded(slug);
  const dimmed = apt.isSold || r.excluded === true || userExcluded;

  return (
    <button
      type="button"
      onClick={() => onOpenRanked(r)}
      title={`${apt.buildingKey} · #${apt.apartment_number}`}
      className={`h-full w-full text-start px-0.5 py-1 sm:p-2 flex flex-col gap-0.5 min-w-0
                  hover:bg-blue-50/40 dark:hover:bg-blue-100/40 transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                  ${dimmed ? "opacity-55" : ""}`}
    >
      {/* Top row: apt number + score + state chip */}
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-[11px] sm:text-xs text-gray-800">
          #{apt.apartment_number}
        </span>
        <div className="flex items-center gap-1 min-w-0">
          {apt.isSold && (
            <span className="px-1 py-0.5 rounded bg-red-100 text-red-700 dark:text-red-800 text-[9px] sm:text-[10px] font-semibold whitespace-nowrap">
              {t("results.sold")}
            </span>
          )}
          {(r.excluded === true || userExcluded) && !apt.isSold && (
            <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-800 dark:text-amber-900 text-[9px] sm:text-[10px] font-semibold whitespace-nowrap">
              <span className="sm:hidden">{t("results.excludedShort")}</span>
              <span className="hidden sm:inline">{t("results.excluded")}</span>
            </span>
          )}
          <span
            className={`${dimmed ? "hidden sm:inline-block " : ""}text-[9px] sm:text-[10px] font-semibold rounded px-1 py-0.5 ${scoreChipClass(
              r.totalScore
            )}`}
            aria-label={`${t("results.score")} ${r.totalScore.toFixed(1)}`}
          >
            {r.totalScore.toFixed(1)}
          </span>
        </div>
      </div>
      <MobileRoomsArea apt={apt} wide={columnCount <= 3} />
      <CellInfoLine apt={apt} />
    </button>
  );
}

function OverflowChip({
  placement,
  onOpenRanked,
}: {
  placement: AptPlacement;
  onOpenRanked: (ranked: RankedApartment) => void;
}) {
  if (placement.kind === "freeMarketing") {
    return (
      <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 dark:text-gray-800 text-[10px] font-medium">
        #{placement.apartment.apartment_number || "—"}
      </span>
    );
  }
  const apt = placement.ranked.apartment;
  return (
    <button
      type="button"
      onClick={() => onOpenRanked(placement.ranked)}
      className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:text-gray-800 text-[10px] font-medium hover:bg-gray-200 transition-colors"
    >
      #{apt.apartment_number}
    </button>
  );
}

/* ─── Empty cell ──────────────────────────────────────────────────────── */

function EmptyCell() {
  const { t } = useTranslation();
  return (
    <td
      className="border border-gray-100 dark:border-gray-200 text-center align-middle text-gray-400 text-[10px] sm:text-xs"
      style={{
        background:
          "repeating-linear-gradient(45deg, var(--color-gray-50), var(--color-gray-50) 6px, var(--color-gray-100) 6px, var(--color-gray-100) 12px)",
      }}
    >
      {t("buildingsView.empty")}
    </td>
  );
}

/* ─── Building card ───────────────────────────────────────────────────── */

interface BuildingCardProps {
  layout: BuildingLayout;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRanked: (ranked: RankedApartment) => void;
  isUserExcluded: (slug: string) => boolean;
}

/** "YYYY-MM-DD" → "DD/MM" (year stripped — chip space is tight, year is
 *  implied by "recently"). Falls back to the input if the shape is wrong. */
function formatHighlightDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

function BuildingCard({ layout, open, onOpenChange, onOpenRanked, isUserExcluded }: BuildingCardProps) {
  const { t } = useTranslation();

  const { counts, groups, floorCount, topScore, highlightDate, highlightKind } = layout;

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={onOpenChange}
      className="bg-white dark:bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
    >
      <Collapsible.Trigger className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors text-start">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-90" : ""} rtl:-scale-x-100`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
            clipRule="evenodd"
          />
        </svg>
        <div className="min-w-0">
          <div className="font-semibold text-gray-800 text-sm truncate">
            {t("buildingsView.buildingTitle", { key: layout.buildingKey })}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {t("buildingsView.summary", {
              floors: floorCount,
              total: counts.total,
            })}
            {topScore !== null && (
              <>
                <span className="hidden sm:inline">
                  {" · "}
                  {t("buildingsView.topScore", { score: topScore.toFixed(1) })}
                </span>
              </>
            )}
          </div>
          {topScore !== null && (
            <div className="sm:hidden text-xs text-gray-500 truncate">
              {t("buildingsView.topScore", { score: topScore.toFixed(1) })}
            </div>
          )}
        </div>
        <div className="ms-auto flex flex-col sm:flex-row sm:items-center items-end gap-1 text-[11px] flex-shrink-0">
          {counts.available > 0 && (
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 dark:text-green-900">
              {t("buildingsView.availableCount", { count: counts.available })}
            </span>
          )}
          {counts.sold > 0 && (
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 dark:text-red-800">
              {counts.soldHighlight > 0 && highlightKind === "today"
                ? t("buildingsView.soldCountToday", {
                    count: counts.sold,
                    today: counts.soldHighlight,
                  })
                : counts.soldHighlight > 0 && highlightKind === "recently" && highlightDate
                  ? t("buildingsView.soldCountRecently", {
                      count: counts.sold,
                      recently: counts.soldHighlight,
                      date: formatHighlightDate(highlightDate),
                    })
                  : t("buildingsView.soldCount", { count: counts.sold })}
            </span>
          )}
          {counts.freeMarketing > 0 && (
            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:text-gray-700">
              {t("buildingsView.openMarketCount", { count: counts.freeMarketing })}
            </span>
          )}
        </div>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="p-2 sm:p-3 overflow-x-auto">
          {groups.map((group) => (
            <FloorGroupTable
              key={group.id}
              group={group}
              isUserExcluded={isUserExcluded}
              onOpenRanked={onOpenRanked}
              highlightDate={highlightDate}
            />
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

/** One mini-table for a contiguous range of floors that share the same
 *  column set. Each group owns its own header row, so the table is
 *  reprinted whenever the air-direction layout changes. */
function FloorGroupTable({
  group,
  isUserExcluded,
  onOpenRanked,
  highlightDate,
}: {
  group: FloorGroup;
  isUserExcluded: (slug: string) => boolean;
  onOpenRanked: (ranked: RankedApartment) => void;
  highlightDate: string | null;
}) {
  const { t } = useTranslation();
  const { columns, rows, cells } = group;
  return (
    <table className="w-full text-xs border-collapse table-fixed">
      <colgroup>
        <col className="w-7 sm:w-12" />
        {columns.map((c) => (
          <col key={c.key} style={{ width: `${100 / columns.length}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr className="text-gray-500">
          <th className="py-1 sm:py-2 px-0.5 sm:px-2 text-center sm:text-start font-medium border-b border-gray-200 bg-gray-50">
            {t("results.floorShort")}
          </th>
          {columns.map((c) => {
            const full = c.directions.map((d) => t(`results.directionFull_${d}`)).join(" · ");
            const short = c.directions.map((d) => t(`results.directionShort_${d}`)).join(" · ");
            // Per-direction-count classes (kept as full literals so Tailwind can detect them).
            // Thresholds are tuned to typical phone column widths (~70-100px).
            const shortCls =
              c.directions.length === 1
                ? "@[2rem]:hidden"
                : c.directions.length === 2
                ? "@[3.5rem]:hidden"
                : "@[5.5rem]:hidden";
            const fullCls =
              c.directions.length === 1
                ? "hidden @[2rem]:inline"
                : c.directions.length === 2
                ? "hidden @[3.5rem]:inline"
                : "hidden @[5.5rem]:inline";
            return (
              <th
                key={c.key}
                className="py-1 sm:py-2 px-0.5 sm:px-2 text-start font-medium border-b border-gray-200 bg-gray-50 whitespace-nowrap"
              >
                {/* Wrap in a div because `container-type: inline-size` does
                    not establish on `display: table-cell` elements. */}
                <div className="@container w-full">
                  {/* Desktop: always full */}
                  <span className="hidden sm:inline">{full}</span>
                  {/* Mobile: container-query swap */}
                  <span className="sm:hidden">
                    <span className={shortCls}>{short}</span>
                    <span className={fullCls}>{full}</span>
                  </span>
                </div>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rIdx) => (
          <tr key={row.floor} style={{ height: 56 }} className="[&_td]:h-14">
            <td className="px-0.5 sm:px-2 align-top text-gray-500 font-semibold border border-gray-100 dark:border-gray-200 bg-gray-50 text-center sm:text-start">
              {row.floor}
            </td>
            {columns.map((col, cIdx) => {
              const cell = cells[rIdx][cIdx];
              if (cell.kind === "continuation") return null;
              if (cell.kind === "empty") return <EmptyCell key={col.key} />;
              return (
                <ApartmentCell
                  key={col.key}
                  cell={cell}
                  rowSpan={cell.rowSpan}
                  columnCount={columns.length}
                  isUserExcluded={isUserExcluded}
                  onOpenRanked={onOpenRanked}
                  highlightDate={highlightDate}
                />
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Modal wrapper for ApartmentDetail ───────────────────────────────── */

function DetailModal({
  ranked,
  onClose,
  note,
  onNoteChange,
  excludedReason,
}: {
  ranked: RankedApartment;
  onClose: () => void;
  note?: string;
  onNoteChange?: (slug: string, text: string) => void;
  excludedReason: "manual" | "scoring" | null;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-2 sm:p-6 overflow-y-auto"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="bg-white dark:bg-white rounded-lg shadow-xl border border-gray-200 max-w-3xl w-full max-h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end p-2 border-b border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <div className="p-3 sm:p-4">
          <ApartmentDetail
            apartment={ranked.apartment}
            breakdown={ranked.breakdown}
            totalWeight={ranked.totalWeight}
            note={note}
            onNoteChange={onNoteChange}
            excludedReason={excludedReason}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Main view ───────────────────────────────────────────────────────── */

export function BuildingsView({ toggleSignal, onAllExpandedChange }: { toggleSignal: number; onAllExpandedChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const {
    rankedApartments,
    freeMarketingApartments,
    userExcludedSet,
    notes,
    setNote,
  } = useApp();

  const layouts = useMemo(
    () => buildBuildingsLayout(rankedApartments, freeMarketingApartments),
    [rankedApartments, freeMarketingApartments]
  );

  // Auto-open buildings with at least one ranked-and-visible apartment.
  const isVisible = (b: BuildingLayout) =>
    b.counts.available > 0 || b.counts.sold > 0;

  const [openSet, setOpenSet] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const l of layouts) {
      if (isVisible(l)) initial.add(l.buildingKey);
    }
    return initial;
  });

  const allExpanded = layouts.length > 0 && layouts.every((l) => openSet.has(l.buildingKey));

  // Report allExpanded state to parent
  useEffect(() => {
    onAllExpandedChange(allExpanded);
  }, [allExpanded, onAllExpandedChange]);

  // Toggle all when the parent increments the signal
  useEffect(() => {
    if (toggleSignal > 0) {
      setOpenSet((prev) => {
        const currentlyAll = layouts.every((l) => prev.has(l.buildingKey));
        return currentlyAll ? new Set() : new Set(layouts.map((l) => l.buildingKey));
      });
    }
  }, [toggleSignal, layouts]);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const isUserExcluded = useCallback(
    (slug: string) => userExcludedSet.has(slug),
    [userExcludedSet]
  );

  const handleOpenRanked = useCallback((r: RankedApartment) => {
    setSelectedSlug(r.apartment.property_slug);
  }, []);

  const selectedRanked = useMemo(
    () => (selectedSlug ? rankedApartments.find((r) => r.apartment.property_slug === selectedSlug) ?? null : null),
    [selectedSlug, rankedApartments]
  );

  if (layouts.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">
        {t("buildingsView.empty_state")}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-1 sm:px-6 pb-4 sm:pb-6 space-y-3">
      <div className="mx-auto w-full max-w-3xl space-y-3">
      {layouts.map((layout) => (
        <BuildingCard
          key={layout.buildingKey}
          layout={layout}
          open={openSet.has(layout.buildingKey)}
          onOpenChange={(v) =>
            setOpenSet((prev) => {
              const next = new Set(prev);
              v ? next.add(layout.buildingKey) : next.delete(layout.buildingKey);
              return next;
            })
          }
          onOpenRanked={handleOpenRanked}
          isUserExcluded={isUserExcluded}
        />
      ))}

      {selectedRanked && (
        <DetailModal
          ranked={selectedRanked}
          onClose={() => setSelectedSlug(null)}
          note={notes[selectedRanked.apartment.property_slug]}
          onNoteChange={setNote}
          excludedReason={
            userExcludedSet.has(selectedRanked.apartment.property_slug)
              ? "manual"
              : selectedRanked.excluded
                ? "scoring"
                : null
          }
        />
      )}
      </div>
    </div>
  );
}
