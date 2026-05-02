import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Collapsible from "@radix-ui/react-collapsible";
import type { Apartment, ParameterId } from "../../types";
import { resolveLocale } from "../../utils/locale";
import { useApp } from "../../context/AppContext";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { PARAMETER_CONFIGS } from "../../utils/parameterConfigs";

/** Default importance weight when a parameter has no explicit weight set
 *  (kept in sync with `DEFAULT_WEIGHT` in `utils/scoring.ts`). */
const DEFAULT_WEIGHT = 3;

/** Minimum width (px) for the scoring column at which the breakdown is
 *  rendered with separate Score / Weight / Weighted columns instead of a
 *  single combined Score column. Below this we fall back to the compact
 *  layout to avoid horizontal scrolling. */
const EXPANDED_BREAKDOWN_MIN_PX = 460;

interface ApartmentDetailProps {
  apartment: Apartment;
  breakdown: Record<string, number>;
  /** Sum of effective importance weights used to compute breakdown (for the % denominator). */
  totalWeight: number;
  note?: string;
  onNoteChange?: (slug: string, text: string) => void;
  /**
   * Why this apartment is excluded in the active profile, if at all.
   * When `"scoring"`, the manual "Mark as excluded" toggle is replaced
   * by a static "Excluded by scoring" indicator since manually toggling
   * would have no visible effect.
   */
  excludedReason?: "manual" | "scoring" | null;
}

interface DetailRowDef {
  key: string;
  label: string;
  value: string;
  paramId?: ParameterId;
}

/**
 * Expanded detail view for a single apartment.
 * Shows all fields, scoring contributions, and PDF links.
 */
export function ApartmentDetail({ apartment, breakdown, totalWeight, note, onNoteChange, excludedReason = null }: ApartmentDetailProps) {
  const { t, i18n } = useTranslation();
  const { settings, toggleUserSoldMark, toggleUserExcluded, userExcludedSet, weights } = useApp();
  const lang = resolveLocale(i18n.language);
  const isDesktop = useIsDesktop();
  const [notesOpen, setNotesOpen] = useState(false);

  // Watch the scoring column's width so we can switch between the compact
  // "weighted only" breakdown and the expanded Score · Weight · Weighted
  // layout based on actual available room — not a viewport breakpoint.
  const scoringColRef = useRef<HTMLDivElement | null>(null);
  const [expandedBreakdown, setExpandedBreakdown] = useState(false);
  useEffect(() => {
    const el = scoringColRef.current;
    if (!el) return;
    const update = (w: number) => setExpandedBreakdown(w >= EXPANDED_BREAKDOWN_MIN_PX);
    update(el.clientWidth);
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) update(entry.contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const directionLabel =
    lang === "he" ? apartment.air_direction : apartment.directions.join(", ");

  // Sold-state breakdown for the mark-as-sold control:
  // - scrapeSold: status from the scraper says "נמכר" (authoritative, locked)
  // - userMarkedSold: user pressed the "mark as sold" button (cross-profile)
  const scrapeSold = (apartment.status ?? "").trim() === "נמכר";
  const userMarkedSold = apartment.userMarkedSold;
  const userExcluded = userExcludedSet.has(apartment.property_slug);

  const areaUnit = t("results.areaUnit");
  const fmtPrice = (n: number) =>
    `₪${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  const paramLabel = (id: ParameterId): string => {
    const cfg = PARAMETER_CONFIGS.find((p) => p.id === id);
    return cfg ? cfg.label[lang] : id;
  };

  // Logical row order — score-bearing rows mixed with display-only rows.
  const rows: DetailRowDef[] = [
    { key: "rooms", paramId: "rooms", label: paramLabel("rooms"), value: apartment.rooms },
    { key: "building", paramId: "building", label: paramLabel("building"), value: apartment.buildingKey },
    { key: "floor", paramId: "floor", label: paramLabel("floor"), value: apartment.floor },
    {
      key: "layout",
      paramId: "layout",
      label: paramLabel("layout"),
      value: t(`results.layout_${apartment.layout}`),
    },
    { key: "type", paramId: "type", label: t("detail.type"), value: apartment.type },
    {
      key: "area_sqm",
      paramId: "area_sqm",
      label: paramLabel("area_sqm"),
      value: `${apartment.area_sqm} ${areaUnit}`,
    },
    {
      key: "balcony_area_sqm",
      paramId: "balcony_area_sqm",
      label: paramLabel("balcony_area_sqm"),
      value: `${apartment.balcony_area_sqm} ${areaUnit}`,
    },
    {
      key: "storage_area_sqm",
      paramId: "storage_area_sqm",
      label: paramLabel("storage_area_sqm"),
      value: apartment.storage_id
        ? `${apartment.storage_area_sqm} ${areaUnit} (${apartment.storage_id})`
        : `${apartment.storage_area_sqm} ${areaUnit}`,
    },
    {
      key: "air_direction",
      paramId: "air_direction",
      label: t("detail.airDirection"),
      value: directionLabel,
    },
    {
      key: "air_direction_count",
      paramId: "air_direction_count",
      label: paramLabel("air_direction_count"),
      value: String(apartment.directionCount),
    },
    { key: "price", paramId: "price", label: paramLabel("price"), value: fmtPrice(apartment.price) },
  ];

  if (settings.developerTools) {
    rows.push({ key: "property_slug", label: t("detail.propertySlug"), value: apartment.property_slug });
  }

  // Max contribution magnitude — used to color-code by relative impact.
  const maxContribution = Math.max(
    0,
    ...Object.values(breakdown).map((v) => Math.abs(v))
  );

  // Total score as percentage of theoretical maximum (each param maxes at 5).
  // `totalWeight` mirrors the effective weights used in scoring (including default
  // fallbacks for params missing from older profiles), so the denominator stays in
  // sync with the numerator and the percentage cannot exceed 100%.
  const totalContribution = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  const maxPossible = totalWeight * 5;
  const totalPercent = maxPossible > 0 ? (totalContribution / maxPossible) * 100 : null;

  const pdfs = [
    { label: t("detail.pdfApartment"), url: apartment.pdf_apartment_plan },
    { label: t("detail.pdfFloor"), url: apartment.pdf_floor_plan },
    { label: t("detail.pdfParking"), url: apartment.pdf_parking_storage },
    { label: t("detail.pdfDevelopment"), url: apartment.pdf_development },
  ].filter((p) => p.url);

  // Mark-as-sold + Mark-as-excluded controls.
  // Sold is cross-profile (when the scrape already reports the apartment as
  // sold the control is disabled and shows the official-source label).
  // Excluded is per-profile and hides the apartment from results unless
  // 'Show excluded' is on.
  const actionButtons = (
    <div
      className={`flex flex-wrap gap-2 ${
        !isDesktop ? "[&>*]:flex-1 [&>*]:justify-center" : ""
      }`}
    >
      {scrapeSold ? (
        <button
          type="button"
          disabled
          title={t("detail.soldOfficialTooltip")}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                     rounded-md border border-gray-200 bg-gray-50 text-gray-400 dark:text-gray-600 cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
          </svg>
          {t("detail.soldOfficial")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => toggleUserSoldMark(apartment.property_slug)}
          title={
            userMarkedSold
              ? t("detail.unmarkSoldTooltip")
              : t("detail.markSoldTooltip")
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                     rounded-md border transition-colors ${
                       userMarkedSold
                         ? "border-red-300 bg-red-50 text-red-700 dark:text-red-800 hover:bg-red-100"
                         : "border-gray-300 bg-white text-gray-700 dark:text-gray-800 hover:bg-gray-50"
                     }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            {userMarkedSold ? (
              <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM3.5 10a6.5 6.5 0 0 1 10.65-5.03L4.97 14.15A6.47 6.47 0 0 1 3.5 10Zm2.35 5.03a6.5 6.5 0 0 0 9.18-9.18L5.85 15.03Z" clipRule="evenodd" />
            )}
          </svg>
          {userMarkedSold ? t("detail.unmarkSold") : t("detail.markSold")}
        </button>
      )}

      {excludedReason === "scoring" ? (
        <span
          title={t("detail.scoringExcludedTooltip")}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                     rounded-md border border-amber-300 bg-amber-50 text-amber-800 dark:text-amber-900
                     cursor-default"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
          </svg>
          {t("detail.scoringExcluded")}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => toggleUserExcluded(apartment.property_slug)}
          title={
            userExcluded
              ? t("detail.unmarkExcludedTooltip")
              : t("detail.markExcludedTooltip")
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                     rounded-md border transition-colors ${
                       userExcluded
                         ? "border-amber-300 bg-amber-50 text-amber-800 dark:text-amber-900 hover:bg-amber-100"
                         : "border-gray-300 bg-white text-gray-700 dark:text-gray-800 hover:bg-gray-50"
                     }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            {userExcluded ? (
              <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
            )}
          </svg>
          {userExcluded ? t("detail.unmarkExcluded") : t("detail.markExcluded")}
        </button>
      )}
    </div>
  );

  return (
    <div className="px-4 pt-3 pb-4 text-sm">
      {!isDesktop && actionButtons}
      <div className={`${!isDesktop ? "mt-3" : ""} grid grid-cols-1 gap-x-8 gap-y-3 ${isDesktop ? "grid-cols-2" : ""}`}>
      <div ref={scoringColRef} className="space-y-2">
        {/* Column header */}
        <div
          className={`grid items-baseline gap-x-2 px-1 pb-1 border-b border-gray-200 text-[10px] font-medium uppercase tracking-wide text-gray-500 ${
            expandedBreakdown
              ? "grid-cols-[1fr_1fr_2.5rem_2.5rem_2.5rem]"
              : "grid-cols-[1fr_1fr_2.5rem]"
          }`}
        >
          <span>{t("detail.colField")}</span>
          <span>{t("detail.colValue")}</span>
          {expandedBreakdown ? (
            <>
              <span className="text-end">{t("detail.colScore")}</span>
              <span className="text-end">{t("detail.colWeight")}</span>
              <span className="text-end">{t("detail.colWeighted")}</span>
            </>
          ) : (
            <span className="text-end">{t("detail.colScore")}</span>
          )}
        </div>
        {/* Merged rows: label | value | score [| weight | weighted] */}
        <div className="space-y-1">
          {rows.filter((r) => r.paramId).map((row) => {
            const contribution = row.paramId ? breakdown[row.paramId] : undefined;
            const weight = row.paramId ? weights[row.paramId] ?? DEFAULT_WEIGHT : undefined;
            const valueScore =
              contribution != null && weight != null && weight > 0
                ? contribution / weight
                : undefined;
            return (
              <DetailRow
                key={row.key}
                label={row.label}
                value={row.value}
                score={contribution}
                valueScore={valueScore}
                weight={weight}
                expanded={expandedBreakdown}
                maxContribution={maxContribution}
              />
            );
          })}
        </div>
        {/* Total row */}
        {totalPercent != null && (
          <div
            className={`grid items-baseline gap-x-2 mt-2 pt-2 border-t border-gray-200 text-sm font-semibold ${
              expandedBreakdown
                ? "grid-cols-[1fr_1fr_2.5rem_2.5rem_2.5rem]"
                : "grid-cols-[1fr_1fr_2.5rem]"
            }`}
          >
            <span className="text-gray-700">{t("detail.totalScore")}</span>
            <span />
            {expandedBreakdown && <span />}
            {expandedBreakdown && <span />}
            <span dir="ltr" className="tabular-nums text-end text-gray-800">
              {totalPercent.toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* Right column: IDs + notes + PDFs */}
      {(rows.some((r) => !r.paramId) || onNoteChange || pdfs.length > 0) && (
        <div className="flex flex-col gap-3">
          {/* Unscored / metadata rows (storage ID, property ID) */}
          {rows.some((r) => !r.paramId) && (
            <div className="space-y-1">
              {rows.filter((r) => !r.paramId).map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-2">
                  <span className="text-gray-500 truncate">{row.label}</span>
                  <span className="font-medium text-gray-800 text-end truncate">{row.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Mark-as-sold + Mark-as-excluded controls.
              On mobile these are rendered above the grid; on desktop they
              stay in the right column alongside notes and PDFs. */}
          {isDesktop && actionButtons}

          {onNoteChange && (
            <Collapsible.Root
              open={isDesktop || notesOpen}
              onOpenChange={setNotesOpen}
              className={`space-y-1 ${isDesktop ? "flex flex-col flex-1 min-h-0" : ""}`}
            >
              {!isDesktop && (
              <Collapsible.Trigger
                className="w-full flex items-center justify-between gap-2 px-3 py-2
                           text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md
                           hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4 text-gray-500"
                  >
                    <path d="M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0v-4.392l1.657-.348a6.449 6.449 0 0 1 4.271.572 7.948 7.948 0 0 0 5.965.524l2.078-.64A.75.75 0 0 0 18 12.25v-8.5a.75.75 0 0 0-.904-.734l-2.38.501a7.25 7.25 0 0 1-4.186-.363l-.502-.2a8.75 8.75 0 0 0-5.053-.439l-1.475.31V2.75Z" />
                  </svg>
                  {t("detail.notes")}
                  {note && <span className="ms-0.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`w-4 h-4 text-gray-500 transition-transform ${notesOpen ? "rotate-180" : ""}`}
                >
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </Collapsible.Trigger>
              )}
              {isDesktop && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                {t("detail.notes")}
                {note && (
                  <span
                    aria-hidden="true"
                    className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"
                  />
                )}
              </label>
              )}
              <Collapsible.Content className="data-[state=open]:block">
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-gray-300 px-3 py-2 text-sm
                             text-gray-900 bg-gray-50
                             placeholder:text-gray-400
                             focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-y"
                  placeholder={t("detail.notesPlaceholder")}
                  value={note ?? ""}
                  onChange={(e) => onNoteChange(apartment.property_slug, e.target.value)}
                />
              </Collapsible.Content>
            </Collapsible.Root>
          )}

          {pdfs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pdfs.map((pdf) => (
                <a
                  key={pdf.label}
                  href={pdf.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs
                             font-medium text-blue-600 bg-blue-50 rounded-md
                             hover:bg-blue-100 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-3.5 h-3.5"
                    aria-hidden="true"
                  >
                    <path fillRule="evenodd" d="M4 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.414A2 2 0 0 0 17.414 7L13 2.586A2 2 0 0 0 11.586 2H4Zm8 1.5V7a1 1 0 0 0 1 1h3.5L12 3.5ZM6 10.75A.75.75 0 0 1 6.75 10h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10.75Zm.75 2.75a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" clipRule="evenodd" />
                  </svg>
                  {pdf.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function contributionColor(contrib: number, max: number): string {
  if (max <= 0 || contrib <= 0) return "text-gray-400";
  const ratio = contrib / max;
  if (ratio >= 0.75) return "text-green-700";
  if (ratio >= 0.5) return "text-green-600";
  if (ratio >= 0.25) return "text-gray-600";
  return "text-gray-400";
}

function DetailRow({
  label,
  value,
  score,
  valueScore,
  weight,
  expanded,
  maxContribution,
}: {
  label: string;
  value: string;
  /** Weighted contribution (valueScore × weight). Drives the row color and
   *  is shown in the rightmost numeric column in both layouts. */
  score?: number;
  /** Raw value score (1–5) before weighting. Only rendered when expanded. */
  valueScore?: number;
  /** Importance weight used for this parameter. Only rendered when expanded. */
  weight?: number;
  /** When true, render Score · Weight · Weighted as separate columns. */
  expanded: boolean;
  maxContribution: number;
}) {
  const numClass = "tabular-nums text-xs text-end";
  const colorClass = score == null ? "text-transparent" : contributionColor(score, maxContribution);
  return (
    <div
      className={`grid items-baseline gap-x-2 ${
        expanded
          ? "grid-cols-[1fr_1fr_2.5rem_2.5rem_2.5rem]"
          : "grid-cols-[1fr_1fr_2.5rem]"
      }`}
    >
      <span className="text-gray-500 truncate">{label}</span>
      <span className="font-medium text-gray-800 truncate">{value}</span>
      {expanded ? (
        <>
          <span dir="ltr" className={`${numClass} text-gray-600`} aria-hidden={valueScore == null}>
            {valueScore != null ? valueScore.toFixed(1) : "—"}
          </span>
          <span dir="ltr" className={`${numClass} text-gray-500`} aria-hidden={weight == null}>
            {weight != null ? weight.toFixed(0) : "—"}
          </span>
          <span dir="ltr" className={`${numClass} ${colorClass}`} aria-hidden={score == null}>
            {score != null ? score.toFixed(1) : "—"}
          </span>
        </>
      ) : (
        <span dir="ltr" className={`${numClass} ${colorClass}`} aria-hidden={score == null}>
          {score != null ? score.toFixed(1) : "—"}
        </span>
      )}
    </div>
  );
}
