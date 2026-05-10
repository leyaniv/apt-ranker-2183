import { memo, useCallback, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useTranslation } from "react-i18next";
import type { RankedApartment, ImportanceWeights } from "../../types";
import { TIER_LAYOUTS, type TableTier } from "../../hooks/useTableTier";
import { ApartmentDetail } from "./ApartmentDetail";
import { RankChip, ANNOTATION_STYLE } from "./RankChip";

interface ApartmentRowProps {
  ranked: RankedApartment;
  /** 1-based rank among available apartments. `null` for sold units (no rank). */
  rank: number | null;
  isOpen: boolean;
  onToggle: (slug: string) => void;
  isDesktop: boolean;
  /** Current desktop column tier (1=compact, 2=+balcony, 3=+directions). */
  tier?: TableTier;
  hasNote?: boolean;
  note?: string;
  onNoteChange?: (slug: string, text: string) => void;
  /**
   * Manual scoring adjustment for this apartment under the active profile,
   * in percentage points. `0` or absent = no nudge. Surfaced as an inline
   * up/down arrow next to the score badge.
   */
  adjustment?: number;
  /**
   * Why this apartment is excluded in the active profile, if at all.
   *  - `manual`  — user clicked "Mark as excluded" in the detail view.
   *  - `scoring` — at least one contributing parameter scored 0 (✕) for
   *               this apartment under the active profile.
   *  - `null` / undefined — not excluded.
   */
  excludedReason?: "manual" | "scoring" | null;
  /**
   * Effective importance weights of the active profile, used to derive each
   * scored cell's "value score" (`breakdown[paramId] / weight`) and color
   * its chip accordingly. Optional — when absent, scored cells fall back to
   * unstyled text. Same default (3) as the scoring engine for missing keys.
   */
  weights?: ImportanceWeights;
  /**
   * Whether to render scored cells as colored chips. When `false` cells
   * fall back to the plain-text styling that's used for unscored fields.
   * Driven by the `colorByValueScore` user setting and toggled from the
   * results header. Defaults to `true` so the chips remain on for callers
   * that don't (yet) thread the setting through.
   */
  colorByValueScore?: boolean;
  originalRank?: number;
  /**
   * True when at least one row in the visible list has been manually
   * reordered (display rank ≠ score rank). On desktop, drives whether
   * the row reserves an extra column for the `(originalRank)` annotation
   * and tightens its horizontal padding to compensate. The mobile layout
   * always renders the annotation inline next to the chip and ignores
   * this flag.
   */
  anyManualReorder?: boolean;
  dropTargetSlug?: string | null;
  onDragStart?: (slug: string) => void;
  onDragOver?: (slug: string) => void;
  onDrop?: (slug: string) => void;
  /**
   * When true the row is in compare-selection mode: the drag affordance
   * is suspended, and the row's primary tap/click target toggles whether
   * the apartment is included in the compare set instead of expanding
   * the detail. Driven by the "Compare" button on the Ranking tab.
   */
  compareMode?: boolean;
  /** True when the row is currently in the compare set. Tints the row
   *  background and checks the per-row checkbox. */
  isSelectedForCompare?: boolean;
  /** Toggle this row's membership in the compare set. */
  onToggleCompareSelect?: (slug: string) => void;
  /** True when the compare set is at the per-viewport cap — used to
   *  disable the checkbox on rows that aren't already selected so the
   *  user can't blow past the limit. */
  compareAtMax?: boolean;
}

function scoreColor(score: number): string {
  if (score >= 4.2) return "bg-green-100 text-green-800";
  if (score >= 3.5) return "bg-lime-100 text-lime-800";
  if (score >= 2.8) return "bg-yellow-100 text-yellow-800";
  if (score >= 2.0) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

/**
 * Tailwind chip palette for a per-cell value score (1–5). Mirrors the
 * 5-bucket palette used by the scoring inputs (`.score-btn[data-score=…]`)
 * so a row's column colors are recognizable as the same scores the user
 * picked in the scoring panel.
 *
 * Fractional scores (e.g. averaged multi-direction) round to the nearest
 * bucket via half-step thresholds. Excluded values (raw 0) read as the
 * substituted-1 value and fall in the red bucket — fine since excluded
 * apartments are already badged at the row level.
 */
function valueScoreColor(score: number): string {
  if (score >= 4.5) return "bg-green-100 text-green-800";
  if (score >= 3.5) return "bg-lime-100 text-lime-800";
  if (score >= 2.5) return "bg-yellow-100 text-yellow-800";
  if (score >= 1.5) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

/** Shared chip styling for scored cells. `inline-block max-w-full truncate`
 *  keeps the chip pinned to the grid column's width with an ellipsis
 *  fallback for long labels (e.g. "Garden Duplex"). Padding is kept tight
 *  (`px-1 py-0.5`) so the chip steals as little horizontal room as
 *  possible from the column — every extra pixel pushes a longer label
 *  closer to ellipsing. */
const CELL_CHIP_CLASS =
  "inline-block max-w-full truncate align-middle text-xs font-medium rounded px-1 py-0.5";

/**
 * A single row in the results table. Clicking expands to show full details.
 * Supports native HTML5 drag-and-drop via the grip handle.
 *
 * `open` state is lifted to the parent so a virtualized list can query
 * per-row heights; the detail view is only mounted when `isOpen` is true.
 * Renders only the matching layout for the current viewport.
 */
export const ApartmentRow = memo(function ApartmentRow({
  ranked, rank, isOpen, onToggle, isDesktop, tier = 1,
  hasNote, note, onNoteChange, adjustment = 0, excludedReason = null,
  weights, colorByValueScore = true, originalRank,
  anyManualReorder = false, dropTargetSlug,
  onDragStart, onDragOver, onDrop,
  compareMode = false, isSelectedForCompare = false,
  onToggleCompareSelect, compareAtMax = false,
}: ApartmentRowProps) {
  const { t } = useTranslation();
  const { apartment, totalScore, totalWeight, breakdown } = ranked;
  const slug = apartment.property_slug;
  const isDropTarget = dropTargetSlug === slug;
  const isSold = apartment.isSold;
  const userOnlySold = isSold && apartment.userMarkedSold && (apartment.status ?? "").trim() !== "נמכר";
  const isExcluded = excludedReason != null;
  // Sold takes precedence over excluded in the rank-cell badge so the user
  // sees the strongest negative signal first.
  const showExcludedBadge = isExcluded && !isSold;
  const excludedLabelKey = excludedReason === "scoring" ? "results.filteredOut" : "results.excluded";
  const excludedTooltipKey =
    excludedReason === "scoring" ? "results.filteredOutTooltip" : "results.excludedTooltip";
  const rankLabel = rank == null ? "—" : String(rank);
  const isReordered =
    rank != null && originalRank != null && originalRank !== rank;
  // Desktop reserves a separate column for the `(originalRank)` annotation
  // when any displayed row diverges from the scored order; mobile keeps it
  // inline next to the chip to save horizontal space.
  const showReorderColumn = isDesktop && anyManualReorder;
  const tierLayout = TIER_LAYOUTS[tier];
  const gridClass = showReorderColumn ? tierLayout.gridWithReorder : tierLayout.grid;
  const padXClass = showReorderColumn ? tierLayout.padXWithReorder : tierLayout.padX;

  const handleOpenChange = useCallback(() => onToggle(slug), [onToggle, slug]);
  const handleCompareToggle = useCallback(
    () => onToggleCompareSelect?.(slug),
    [onToggleCompareSelect, slug],
  );
  // True when the per-row checkbox should be disabled: the compare set is
  // full AND this row isn't already in it. Selected rows must always remain
  // toggleable so the user can deselect to make room.
  const compareCheckboxDisabled =
    compareMode && compareAtMax && !isSelectedForCompare;

  /**
   * Render a desktop-row cell as either a colored chip (when
   * `colorByValueScore` is on and the parameter contributes to scoring)
   * or as a plain styled span otherwise.
   *
   * The chip's color is derived from the row's pre-normalized breakdown
   * (`breakdown[paramId] / effectiveWeight`), matching what the apartment
   * detail view shows in its Score column. `plainClass` carries the
   * column-specific text styling that's used when the chip is suppressed
   * (toggle off, weight 0, or a missing breakdown entry). `chipExtra`
   * tacks extra Tailwind utilities onto the chip for cells that need
   * tweaks even when colored — e.g. the price column's `font-mono`.
   */
  const cellChip = (
    paramId: string,
    content: ReactNode,
    plainClass: string,
    chipExtra = "",
  ) => {
    if (!colorByValueScore) {
      return <span className={plainClass}>{content}</span>;
    }
    const w = weights?.[paramId] ?? 3;
    const c = breakdown[paramId];
    if (w <= 0 || c == null) {
      return <span className={plainClass}>{content}</span>;
    }
    const score = c / w;
    return (
      <span
        className={`${CELL_CHIP_CLASS} ${valueScoreColor(score)} ${chipExtra}`}
        title={t("results.valueScoreTooltip", { score: score.toFixed(1) })}
      >
        {content}
      </span>
    );
  };

  return (
    <div
      onDragOver={compareMode ? undefined : (e) => { e.preventDefault(); onDragOver?.(slug); }}
      onDrop={compareMode ? undefined : (e) => { e.preventDefault(); onDrop?.(slug); }}
      className={!compareMode && isDropTarget ? "border-t-2 border-blue-500" : ""}
    >
      <Collapsible.Root open={isOpen} onOpenChange={handleOpenChange}>
        <div
          className={`border-b border-gray-100 last:border-b-0 ${
            isSold || isExcluded ? "opacity-60" : ""
          } ${
            isSelectedForCompare ? "bg-blue-50/60" : ""
          }`}
        >
          {isDesktop ? (
            <Collapsible.Trigger asChild>
              <div
                className={`grid ${gridClass} ${padXClass}
                            items-center gap-1 py-2.5 hover:bg-gray-50 transition-colors text-sm cursor-pointer
                            ${isOpen ? "bg-gray-50" : ""}
                            ${isSelectedForCompare ? "!bg-blue-50/80 hover:!bg-blue-100/70" : ""}`}
              >
              {compareMode ? (
                // <label> wrapping the checkbox makes the whole cell a hit
                // target for compare-selection — a native click anywhere in
                // the label is forwarded to the wrapped <input>, firing its
                // onChange exactly once. `w-full h-full` stretches the label
                // to fill the grid cell so the entire column width/height
                // toggles selection. stopPropagation prevents the click from
                // bubbling up to the row-wide Collapsible.Trigger.
                <label
                  className={`flex items-center justify-center w-full h-full ${
                    compareCheckboxDisabled ? "cursor-not-allowed" : "cursor-pointer"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                  title={compareCheckboxDisabled ? undefined : t("results.compare")}
                >
                  <input
                    type="checkbox"
                    checked={isSelectedForCompare}
                    disabled={compareCheckboxDisabled}
                    onChange={handleCompareToggle}
                    aria-label={t("results.compare")}
                    className="h-4 w-4 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                </label>
              ) : (
                // Stop propagation so a click on the drag grip doesn't bubble
                // up and toggle the row's expanded state.
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", slug);
                    onDragStart?.(slug);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                  title={t("results.dragHint")}
                  aria-label={t("results.dragHint")}
                >
                  ⠿
                </span>
              )}

              <div className="text-center">
                {isSold ? (
                  // `leading-4` pins the line-height to 16px (`text-[10px]`
                  // only sets font-size, so the badge would otherwise inherit
                  // the grid's `text-sm` 20px line and stand 4px taller than
                  // the chips next to it — making sold rows visibly taller).
                  <span
                    className={`inline-flex items-center justify-center text-[10px] font-semibold leading-4 rounded px-1.5 py-0.5 ${
                      userOnlySold
                        ? "bg-red-100 text-red-700 dark:text-red-800"
                        : "bg-gray-200 text-gray-600 dark:text-gray-800"
                    }`}
                    title={userOnlySold ? t("results.userMarkedSoldTooltip") : t("results.soldTooltip")}
                  >
                    {t("results.sold")}
                  </span>
                ) : showExcludedBadge ? (
                  // Fixed `w-5 h-5` box so the 14px icon shares the same 20px
                  // footprint as the chips in neighbouring columns, keeping
                  // excluded rows the same height as everything else.
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 text-amber-600 dark:text-amber-700"
                    title={t(excludedTooltipKey)}
                    aria-label={t(excludedLabelKey)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                    </svg>
                  </span>
                ) : rank != null ? (
                  <RankChip rank={rank} />
                ) : (
                  <span className="text-gray-400 font-mono text-xs">{rankLabel}</span>
                )}
              </div>

              {showReorderColumn && (
                <div className="text-center">
                  {isReordered ? (
                    <span
                      className="font-mono text-[10px] tabular-nums"
                      style={ANNOTATION_STYLE}
                      title={t("results.originalRank", { rank: originalRank })}
                    >
                      ({originalRank})
                    </span>
                  ) : null}
                </div>
              )}

              <div className="text-center">
                {cellChip("building", apartment.buildingKey, "text-gray-700")}
              </div>

              <div className="text-center">
                <span className="text-gray-700">{apartment.apartment_number}</span>
              </div>

              <div className="text-center">
                {cellChip("rooms", apartment.rooms, "text-gray-700")}
              </div>

              <div className="text-center">
                {cellChip("floor", apartment.floor, "text-gray-700")}
              </div>

              {TIER_LAYOUTS[tier].showDirections && (
                <div className="text-center">
                  {cellChip(
                    "air_direction",
                    apartment.directions.length > 0
                      ? apartment.directions
                          .map((d) => t(`results.directionShort_${d}`))
                          .join("·")
                      : "—",
                    "text-gray-600 text-xs whitespace-nowrap",
                  )}
                </div>
              )}

              <div className="text-center">
                {cellChip(
                  "layout",
                  t(`results.layout_${apartment.layout}`),
                  "text-gray-600 text-xs truncate",
                )}
              </div>

              <div className="text-center">
                {cellChip("type", apartment.type, "text-gray-600 text-xs truncate")}
              </div>

              <div className="text-center">
                {cellChip(
                  "area_sqm",
                  `${apartment.area_sqm} ${t("results.areaUnit")}`,
                  "text-gray-700 text-xs",
                )}
              </div>

              {TIER_LAYOUTS[tier].showBalcony && (
                <div className="text-center">
                  {cellChip(
                    "balcony_area_sqm",
                    apartment.balcony_area_sqm > 0
                      ? `${apartment.balcony_area_sqm} ${t("results.areaUnit")}`
                      : "—",
                    "text-gray-700 text-xs",
                  )}
                </div>
              )}

              <div className="text-center">
                {cellChip(
                  "price",
                  `₪${apartment.price.toLocaleString("en")}`,
                  "font-mono text-gray-700 text-xs",
                  "font-mono",
                )}
              </div>

              <div className="text-center">
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 inline-flex justify-center shrink-0">
                    {hasNote && <NoteIcon title={t("detail.hasNote")} />}
                  </span>
                  <span
                    className={`text-xs font-bold rounded-full px-2 py-0.5 ${scoreColor(totalScore)}`}
                  >
                    {totalScore.toFixed(2)}
                  </span>
                  <span className="w-3.5 inline-flex justify-center shrink-0">
                    {adjustment !== 0 && <AdjustmentArrow adjustment={adjustment} />}
                  </span>
                </span>
              </div>
              </div>
            </Collapsible.Trigger>
          ) : (
            <div
              draggable={!compareMode}
              onDragStart={
                compareMode
                  ? undefined
                  : (e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", slug);
                      onDragStart?.(slug);
                    }
              }
              className={`@container/row flex items-center gap-1.5 px-3 py-2 hover:bg-gray-50 transition-colors
                          ${compareMode ? "" : "cursor-grab active:cursor-grabbing"}
                          ${isOpen ? "bg-gray-50" : ""}
                          ${isSelectedForCompare ? "!bg-blue-50/80 hover:!bg-blue-100/70" : ""}`}
              title={compareMode ? undefined : t("results.dragHint")}
            >
              <MobileRowSurface
                compareMode={compareMode}
                onCompareToggle={handleCompareToggle}
                disabled={compareCheckboxDisabled}
                isSelectedForCompare={isSelectedForCompare}
              >
                {isSold ? (
                  <span
                    className={`inline-flex items-center justify-center w-7 text-[10px] font-semibold rounded px-1 py-0.5 shrink-0 text-center ${
                      userOnlySold
                        ? "bg-red-100 text-red-700 dark:text-red-800"
                        : "bg-gray-200 text-gray-600 dark:text-gray-800"
                    }`}
                    title={userOnlySold ? t("results.userMarkedSoldTooltip") : t("results.soldTooltip")}
                  >
                    {t("results.sold")}
                  </span>
                ) : showExcludedBadge ? (
                  <span
                    className="inline-flex items-center justify-center w-7 shrink-0 text-amber-600 dark:text-amber-700"
                    title={t(excludedTooltipKey)}
                    aria-label={t(excludedLabelKey)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                    </svg>
                  </span>
                ) : rank != null ? (
                  <span className="shrink-0 inline-flex items-baseline gap-0.5">
                    <RankChip rank={rank} />
                    {isReordered && (
                      <span
                        className="font-mono text-[10px] font-normal tabular-nums"
                        style={ANNOTATION_STYLE}
                        title={t("results.originalRank", { rank: originalRank })}
                      >
                        ({originalRank})
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-gray-600 min-w-[1.25rem] text-center font-mono shrink-0">
                    {rankLabel}
                  </span>
                )}
                <span className="font-medium text-sm text-gray-800 truncate min-w-0">
                  {apartment.buildingKey}#{apartment.apartment_number}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-gray-500 shrink-0 whitespace-nowrap">
                  <span>{apartment.rooms} {t("results.roomsShort")}</span>
                  {/* Floor info is the lowest-priority detail. Hide it on narrow rows
                      whenever extra-width markers (note / manual adjustment) are present,
                      since those are what tend to push the apt label off the line. */}
                  <span className={`opacity-40 ${(hasNote || adjustment !== 0) ? "@max-[420px]/row:hidden" : "@max-[340px]/row:hidden"}`}>·</span>
                  <span className={(hasNote || adjustment !== 0) ? "@max-[420px]/row:hidden" : "@max-[340px]/row:hidden"}>{t("results.floorShort")} {apartment.floor}</span>
                  <span className="opacity-40">·</span>
                  <span>{Math.round(apartment.area_sqm)} {t("results.areaUnit")}</span>
                  <span className="opacity-40">·</span>
                  <span>{(apartment.price / 1_000_000).toFixed(3)} {t("results.priceMillions")}</span>
                </span>
                <span
                  className={`text-xs font-bold rounded-full px-2 py-0.5 shrink-0 ms-auto ${scoreColor(totalScore)}`}
                >
                  {totalScore.toFixed(2)}
                </span>
                {adjustment !== 0 && (
                  <AdjustmentArrow adjustment={adjustment} />
                )}
                {hasNote && (
                  <NoteIcon title={t("detail.hasNote")} />
                )}
              </MobileRowSurface>
            </div>
          )}

          <Collapsible.Content>
            {isOpen && (
              <div
                className={
                  isDesktop
                    ? ""
                    : "bg-gray-50 mx-2 mb-2 rounded-md border border-gray-200 shadow-inner"
                }
              >
                <ApartmentDetail apartment={apartment} breakdown={breakdown} totalWeight={totalWeight} note={note} onNoteChange={onNoteChange} excludedReason={excludedReason} />
              </div>
            )}
          </Collapsible.Content>
        </div>
      </Collapsible.Root>
    </div>
  );
});

/**
 * Wraps the inner content of the mobile row layout. In normal browsing mode
 * this stays a `Collapsible.Trigger` (preserving Radix's open/close wiring
 * for the apartment detail). In compare-selection mode it becomes a plain
 * `<button>` whose click toggles the row's membership in the compare set
 * — the detail panel is intentionally suppressed there because the user is
 * picking apartments, not browsing them.
 */
function MobileRowSurface({
  compareMode,
  onCompareToggle,
  disabled,
  isSelectedForCompare,
  children,
}: {
  compareMode: boolean;
  onCompareToggle: () => void;
  disabled: boolean;
  isSelectedForCompare: boolean;
  children: ReactNode;
}) {
  if (compareMode) {
    return (
      <button
        type="button"
        onClick={onCompareToggle}
        disabled={disabled}
        aria-pressed={isSelectedForCompare}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-start cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </button>
    );
  }
  return (
    <Collapsible.Trigger className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer">
      {children}
    </Collapsible.Trigger>
  );
}

/**
 * Inline marker showing that the apartment has a free-text note in the
 * active profile. Pencil-square icon in the same amber palette as the rest
 * of the "note" affordances.
 */
function NoteIcon({ title }: { title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="shrink-0 text-amber-500 inline-flex items-center cursor-default"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-3.5 h-3.5"
        aria-hidden="true"
      >
        <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
      </svg>
    </span>
  );
}

/**
 * Inline marker showing that the active profile has manually nudged this
 * apartment's score. Direction-aware: blue triangle up for a positive nudge,
 * amber triangle down for a negative nudge. Tooltip carries the exact value.
 *
 * Notes get their own pencil-square next to this — the two markers can
 * coexist (e.g. an apartment with both a note and a +12% nudge shows `▲ ✎`).
 */
function AdjustmentArrow({ adjustment }: { adjustment: number }) {
  const { t } = useTranslation();
  if (adjustment === 0) return null;
  const isPositive = adjustment > 0;
  const sign = isPositive ? "+" : "−";
  const tooltip = t("detail.adjustmentTooltip", {
    sign,
    value: Math.abs(adjustment),
  });
  const colorClass = isPositive
    ? "text-blue-500"
    : "text-amber-600 dark:text-amber-700";
  return (
    <span
      aria-label={tooltip}
      title={tooltip}
      className={`text-[11px] leading-none shrink-0 cursor-default ${colorClass}`}
    >
      {isPositive ? "▲" : "▼"}
    </span>
  );
}
