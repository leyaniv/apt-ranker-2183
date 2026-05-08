/**
 * Buildings view — alternative rendering of the ranked apartments that
 * lays them out as a per-building grid of (floor × air-direction) cells.
 *
 * Mounted as the `buildings` tab in `App.tsx`. See
 * `utils/buildingsLayout.ts` for the (pure) layout pipeline.
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

import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useApp } from "../../context/AppContext";
import { ApartmentDetail } from "./ApartmentDetail";
import { TabHeader } from "../Layout/TabHeader";
import { track } from "../../utils/analytics";
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

/** Inner header content (title + summary + count chips). Shared between
 *  the collapsible card (narrow mode) and the always-open panel
 *  (wide mode, inside a lot section). When `chevron` is provided it's
 *  rendered before the title block. */
function BuildingHeaderContent({
  layout,
  chevron,
}: {
  layout: BuildingLayout;
  chevron?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { counts, floorCount, topScore, highlightDate, highlightKind } = layout;
  return (
    <>
      {chevron}
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
            <span className="hidden sm:inline">
              {" · "}
              {t("buildingsView.topScore", { score: topScore.toFixed(1) })}
            </span>
          )}
        </div>
        {topScore !== null && (
          <div className="sm:hidden text-xs text-gray-500 truncate">
            {t("buildingsView.topScore", { score: topScore.toFixed(1) })}
          </div>
        )}
      </div>
      <div className="ms-auto flex flex-col items-end gap-1 text-[11px] flex-shrink-0">
        {(counts.freeMarketing > 0 || counts.available > 0) && (
          <div className="flex flex-row flex-wrap items-center justify-end gap-1">
            {counts.freeMarketing > 0 && (
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:text-gray-700">
                {t("buildingsView.openMarketCount", { count: counts.freeMarketing })}
              </span>
            )}
            {counts.available > 0 && (
              <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 dark:text-green-900">
                {t("buildingsView.availableCount", { count: counts.available })}
              </span>
            )}
          </div>
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
      </div>
    </>
  );
}

/** Floor-group tables for a building. Used by both the collapsible card
 *  body (narrow mode) and the always-open panel body (wide mode). */
function BuildingBody({
  layout,
  isUserExcluded,
  onOpenRanked,
}: {
  layout: BuildingLayout;
  isUserExcluded: (slug: string) => boolean;
  onOpenRanked: (ranked: RankedApartment) => void;
}) {
  return (
    <div className="p-2 sm:p-3 overflow-x-auto">
      {layout.groups.map((group) => (
        <FloorGroupTable
          key={group.id}
          group={group}
          isUserExcluded={isUserExcluded}
          onOpenRanked={onOpenRanked}
          highlightDate={layout.highlightDate}
        />
      ))}
    </div>
  );
}

/** A right-pointing chevron that rotates 90° when `open`. Mirrored in RTL. */
function Chevron({ open }: { open: boolean }) {
  return (
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
  );
}

function BuildingCard({ layout, open, onOpenChange, onOpenRanked, isUserExcluded }: BuildingCardProps) {
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={onOpenChange}
      className="bg-white dark:bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
    >
      <Collapsible.Trigger className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors text-start">
        <BuildingHeaderContent layout={layout} chevron={<Chevron open={open} />} />
      </Collapsible.Trigger>

      <Collapsible.Content>
        <BuildingBody
          layout={layout}
          isUserExcluded={isUserExcluded}
          onOpenRanked={onOpenRanked}
        />
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

/** Always-open variant of `BuildingCard` for use inside a lot section in
 *  wide mode. No chevron, no collapse — the lot section owns the open/close
 *  state for everything inside it. */
function BuildingPanel({
  layout,
  onOpenRanked,
  isUserExcluded,
}: {
  layout: BuildingLayout;
  onOpenRanked: (ranked: RankedApartment) => void;
  isUserExcluded: (slug: string) => boolean;
}) {
  return (
    <div className="bg-white dark:bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <BuildingHeaderContent layout={layout} />
      </div>
      <BuildingBody
        layout={layout}
        isUserExcluded={isUserExcluded}
        onOpenRanked={onOpenRanked}
      />
    </div>
  );
}

/* ─── Lot section (wide mode) ─────────────────────────────────────────── */

/** Split small buildings into two columns for horizontal reading order:
 *  sort by building number ascending, then alternate — 2nd → middle, 3rd →
 *  right, 4th → middle, 5th → right, … so e.g. buildings 2–6 become
 *  middle [2,4,6] and right [3,5]. */
function splitSmallBuildingsInterleaved(
  buildings: BuildingLayout[]
): [BuildingLayout[], BuildingLayout[]] {
  const sorted = [...buildings].sort((a, b) => a.building - b.building);
  const middle: BuildingLayout[] = [];
  const right: BuildingLayout[] = [];
  sorted.forEach((b, i) => {
    if (i % 2 === 0) middle.push(b);
    else right.push(b);
  });
  return [middle, right];
}

/** Pick the "headline" building for a lot — the largest by floor count,
 *  ties broken by the lowest building number. Returns null when the lot
 *  has no buildings. */
function pickBigBuilding(buildings: BuildingLayout[]): BuildingLayout | null {
  if (buildings.length === 0) return null;
  let best = buildings[0];
  for (let i = 1; i < buildings.length; i++) {
    const b = buildings[i];
    if (
      b.floorCount > best.floorCount ||
      (b.floorCount === best.floorCount && b.building < best.building)
    ) {
      best = b;
    }
  }
  return best;
}

interface LotSectionProps {
  lot: string;
  buildings: BuildingLayout[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRanked: (ranked: RankedApartment) => void;
  isUserExcluded: (slug: string) => boolean;
}

function LotSection({
  lot,
  buildings,
  open,
  onOpenChange,
  onOpenRanked,
  isUserExcluded,
}: LotSectionProps) {
  const { t } = useTranslation();

  // Aggregate counts across the whole lot for the header summary chips.
  const totals = useMemo(() => {
    let available = 0;
    let sold = 0;
    let freeMarketing = 0;
    let total = 0;
    for (const b of buildings) {
      available += b.counts.available;
      sold += b.counts.sold;
      freeMarketing += b.counts.freeMarketing;
      total += b.counts.total;
    }
    return { available, sold, freeMarketing, total };
  }, [buildings]);

  const big = useMemo(() => pickBigBuilding(buildings), [buildings]);
  const others = useMemo(
    () => (big ? buildings.filter((b) => b.buildingKey !== big.buildingKey) : buildings),
    [buildings, big]
  );
  const [middleCol, rightCol] = useMemo(
    () => splitSmallBuildingsInterleaved(others),
    [others]
  );

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={onOpenChange}
      className="bg-gray-50 dark:bg-gray-50 rounded-xl border border-gray-200 overflow-hidden"
    >
      <Collapsible.Trigger className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 transition-colors text-start">
        <Chevron open={open} />
        <div className="min-w-0">
          <div className="font-semibold text-gray-800 text-sm truncate">
            {t("buildingsView.lotTitle", { lot })}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {t("buildingsView.lotSummary", {
              buildings: buildings.length,
              total: totals.total,
            })}
          </div>
        </div>
        <div className="ms-auto flex flex-col items-end gap-1 text-[11px] flex-shrink-0">
          {(totals.freeMarketing > 0 || totals.available > 0) && (
            <div className="flex flex-row flex-wrap items-center justify-end gap-1">
              {totals.freeMarketing > 0 && (
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:text-gray-700">
                  {t("buildingsView.openMarketCount", { count: totals.freeMarketing })}
                </span>
              )}
              {totals.available > 0 && (
                <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 dark:text-green-900">
                  {t("buildingsView.availableCount", { count: totals.available })}
                </span>
              )}
            </div>
          )}
          {totals.sold > 0 && (
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 dark:text-red-800">
              {t("buildingsView.soldCount", { count: totals.sold })}
            </span>
          )}
        </div>
      </Collapsible.Trigger>

      <Collapsible.Content>
        {/* 3-col layout: big building ~5/12 width; small buildings split into
            two columns by ascending building number, alternating middle /
            right (2,4,6 vs 3,5). */}
        <div className="p-2 sm:p-3 flex flex-col lg:flex-row gap-2 sm:gap-3 items-stretch">
          {big && (
            <div className="lg:basis-5/12 lg:flex-shrink-0 min-w-0">
              <BuildingPanel
                layout={big}
                onOpenRanked={onOpenRanked}
                isUserExcluded={isUserExcluded}
              />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col sm:flex-row lg:flex-row gap-2 sm:gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-2 sm:gap-3">
              {middleCol.map((b) => (
                <BuildingPanel
                  key={b.buildingKey}
                  layout={b}
                  onOpenRanked={onOpenRanked}
                  isUserExcluded={isUserExcluded}
                />
              ))}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2 sm:gap-3">
              {rightCol.map((b) => (
                <BuildingPanel
                  key={b.buildingKey}
                  layout={b}
                  onOpenRanked={onOpenRanked}
                  isUserExcluded={isUserExcluded}
                />
              ))}
            </div>
          </div>
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
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 truncate min-w-0">
            {ranked.apartment.buildingKey}#{ranked.apartment.apartment_number}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
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

/** Viewport threshold below which the wide layout is replaced by narrow.
 *  Matches Tailwind's `2xl:` breakpoint (1536px) — the per-lot 3-column
 *  grid needs that much room to keep each column readable. Below this
 *  width we just render narrow proper. */
const WIDE_MODE_MIN_WIDTH_PX = 1536;

function useWideModeAvailable(): boolean {
  const [ok, setOk] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(`(min-width: ${WIDE_MODE_MIN_WIDTH_PX}px)`).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${WIDE_MODE_MIN_WIDTH_PX}px)`);
    const handler = (e: MediaQueryListEvent) => setOk(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return ok;
}

/* ─── Main view ───────────────────────────────────────────────────────── */

export function BuildingsView() {
  const { t } = useTranslation();
  const {
    rankedApartments,
    freeMarketingApartments,
    userExcludedSet,
    notes,
    setNote,
    settings,
    updateSettings,
  } = useApp();
  const wideAvailable = useWideModeAvailable();

  const layouts = useMemo(
    () => buildBuildingsLayout(rankedApartments, freeMarketingApartments),
    [rankedApartments, freeMarketingApartments]
  );

  // Group buildings by lot for the wide-mode rendering. Lots are ordered by
  // first-appearance in `layouts` (which is already sorted by `lot/building`
  // numerically), so lot 207 lands above lot 208 the same way buildings do
  // in narrow mode.
  const lots = useMemo(() => {
    const map = new Map<string, BuildingLayout[]>();
    for (const b of layouts) {
      const arr = map.get(b.lot) ?? [];
      arr.push(b);
      map.set(b.lot, arr);
    }
    return [...map.entries()].map(([lot, buildings]) => ({ lot, buildings }));
  }, [layouts]);

  // Wide is the user's saved preference; viewports narrower than the
  // `WIDE_MODE_MIN_WIDTH_PX` threshold always fall back to narrow because
  // three side-by-side building grids do not fit comfortably below it.
  const effectiveMode: "wide" | "narrow" = wideAvailable
    ? settings.buildingsViewMode
    : "narrow";

  // Auto-open buildings (narrow mode) with at least one ranked-and-visible apt.
  const isVisible = (b: BuildingLayout) =>
    b.counts.available > 0 || b.counts.sold > 0;

  const [openSet, setOpenSet] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const l of layouts) {
      if (isVisible(l)) initial.add(l.buildingKey);
    }
    return initial;
  });

  // Lot-level collapse state for wide mode. Default = all lots open.
  const [openLots, setOpenLots] = useState<Set<string>>(
    () => new Set(lots.map((l) => l.lot))
  );

  const allBuildingsExpanded =
    layouts.length > 0 && layouts.every((l) => openSet.has(l.buildingKey));
  const allLotsExpanded =
    lots.length > 0 && lots.every((l) => openLots.has(l.lot));
  const allExpanded =
    effectiveMode === "wide" ? allLotsExpanded : allBuildingsExpanded;

  const toggleAll = useCallback(() => {
    if (effectiveMode === "wide") {
      setOpenLots((prev) => {
        const all = lots.every((l) => prev.has(l.lot));
        return all ? new Set() : new Set(lots.map((l) => l.lot));
      });
    } else {
      setOpenSet((prev) => {
        const all = layouts.every((l) => prev.has(l.buildingKey));
        return all ? new Set() : new Set(layouts.map((l) => l.buildingKey));
      });
    }
  }, [effectiveMode, layouts, lots]);

  const setMode = useCallback(
    (mode: "wide" | "narrow") => {
      if (settings.buildingsViewMode === mode) return;
      updateSettings({ buildingsViewMode: mode });
      track("setting_changed", { key: "buildingsViewMode", value: mode });
    },
    [settings.buildingsViewMode, updateSettings]
  );

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

  // Visual state of the toggle reflects the *saved* preference even on
  // mobile, so toggling on a phone updates the setting and the desktop
  // view will pick it up next time the screen is wide enough.
  const wideSelected = settings.buildingsViewMode === "wide";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-6 sm:px-8 lg:px-14 xl:px-20 pt-2 sm:pt-6 mb-2 flex-shrink-0 flex items-center gap-2">
        <TabHeader
          title={t("buildingsView.title")}
          titleShort={t("buildingsView.titleShort")}
          tooltip={t("buildingsView.howToUse")}
        />
        {/* Right-aligned controls group: the wide/narrow toggle (only when
            the viewport can fit wide mode) sits next to the expand/collapse
            button. Below the threshold the toggle is hidden because there
            is only one possible mode, so it would add noise without any
            choice. */}
        <div className="ms-auto flex items-center gap-2">
          {wideAvailable && (
            <div
              role="tablist"
              aria-label={t("results.viewMode")}
              className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 text-xs sm:text-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={wideSelected}
                onClick={() => setMode("wide")}
                title={t("results.viewModeWideTooltip")}
                className={`px-2.5 sm:px-3 py-1 rounded transition-colors ${
                  wideSelected
                    ? "bg-blue-50 text-blue-700 font-medium dark:text-blue-800"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("results.viewModeWide")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!wideSelected}
                onClick={() => setMode("narrow")}
                title={t("results.viewModeNarrowTooltip")}
                className={`px-2.5 sm:px-3 py-1 rounded transition-colors ${
                  !wideSelected
                    ? "bg-blue-50 text-blue-700 font-medium dark:text-blue-800"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("results.viewModeNarrow")}
              </button>
            </div>
          )}
          {layouts.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              title={allExpanded ? t("buildingsView.collapseAll") : t("buildingsView.expandAll")}
              aria-label={allExpanded ? t("buildingsView.collapseAll") : t("buildingsView.expandAll")}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-xs sm:text-sm text-gray-700
                         bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-500">
                <path fillRule="evenodd" d="M3.22 7.595a.75.75 0 0 0 0 1.06l3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 1 0-1.06-1.06L7 10.19 4.28 7.595a.75.75 0 0 0-1.06 0ZM9.22 7.595a.75.75 0 0 0 0 1.06l3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 1 0-1.06-1.06L13 10.19l-2.72-2.595a.75.75 0 0 0-1.06 0Z" clipRule="evenodd" />
              </svg>
              <span>{allExpanded ? t("buildingsView.collapseAll") : t("buildingsView.expandAll")}</span>
            </button>
          )}
        </div>
      </div>

      {layouts.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">
          {t("buildingsView.empty_state")}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-1 sm:px-6 lg:px-10 xl:px-16 pb-4 sm:pb-6 space-y-3">
          {effectiveMode === "wide" ? (
            <div className="w-full space-y-3">
              {lots.map(({ lot, buildings }) => (
                <LotSection
                  key={lot}
                  lot={lot}
                  buildings={buildings}
                  open={openLots.has(lot)}
                  onOpenChange={(v) =>
                    setOpenLots((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(lot);
                      else next.delete(lot);
                      return next;
                    })
                  }
                  onOpenRanked={handleOpenRanked}
                  isUserExcluded={isUserExcluded}
                />
              ))}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-3">
              {layouts.map((layout) => (
                <BuildingCard
                  key={layout.buildingKey}
                  layout={layout}
                  open={openSet.has(layout.buildingKey)}
                  onOpenChange={(v) =>
                    setOpenSet((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(layout.buildingKey);
                      else next.delete(layout.buildingKey);
                      return next;
                    })
                  }
                  onOpenRanked={handleOpenRanked}
                  isUserExcluded={isUserExcluded}
                />
              ))}
            </div>
          )}

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
      )}
    </div>
  );
}
