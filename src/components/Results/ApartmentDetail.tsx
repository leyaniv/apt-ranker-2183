import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as Collapsible from "@radix-ui/react-collapsible";
import type { Apartment, ParameterId } from "../../types";
import { resolveLocale } from "../../utils/locale";
import { useApp } from "../../context/AppContext";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { PARAMETER_CONFIGS } from "../../utils/parameterConfigs";

interface ApartmentDetailProps {
  apartment: Apartment;
  breakdown: Record<string, number>;
  /** Sum of effective importance weights used to compute breakdown (for the % denominator). */
  totalWeight: number;
  note?: string;
  onNoteChange?: (slug: string, text: string) => void;
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
export function ApartmentDetail({ apartment, breakdown, totalWeight, note, onNoteChange }: ApartmentDetailProps) {
  const { t, i18n } = useTranslation();
  const { settings } = useApp();
  const lang = resolveLocale(i18n.language);
  const isDesktop = useIsDesktop();
  const [notesOpen, setNotesOpen] = useState(false);
  const directionLabel =
    lang === "he" ? apartment.air_direction : apartment.directions.join(", ");

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
      value: `${apartment.storage_area_sqm} ${areaUnit}`,
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
    { key: "storage_id", label: t("detail.storageId"), value: apartment.storage_id },
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

  return (
    <div className="px-4 pt-3 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
      <div className="space-y-2">
        {/* Column header */}
        <div className="grid grid-cols-[1fr_1fr_2.5rem] items-baseline gap-x-2 px-1 pb-1 border-b border-gray-200 text-[10px] font-medium uppercase tracking-wide text-gray-500">
          <span>{t("detail.colField")}</span>
          <span>{t("detail.colValue")}</span>
          <span className="text-end">{t("detail.colScore")}</span>
        </div>
        {/* Merged rows: label | value | score */}
        <div className="space-y-1">
          {rows.filter((r) => r.paramId).map((row) => {
            const score = row.paramId ? breakdown[row.paramId] : undefined;
            return (
              <DetailRow
                key={row.key}
                label={row.label}
                value={row.value}
                score={score}
                maxContribution={maxContribution}
              />
            );
          })}
        </div>
        {/* Total row */}
        {totalPercent != null && (
          <div className="grid grid-cols-[1fr_1fr_2.5rem] items-baseline gap-x-2 mt-2 pt-2 border-t border-gray-200 text-sm font-semibold">
            <span className="text-gray-700">{t("detail.totalScore")}</span>
            <span />
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
          {onNoteChange && (
            <Collapsible.Root
              open={isDesktop || notesOpen}
              onOpenChange={setNotesOpen}
              className="space-y-1 sm:flex sm:flex-col sm:flex-1 sm:min-h-0"
            >
              <Collapsible.Trigger
                className="sm:hidden w-full flex items-center justify-between gap-2 px-3 py-2
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
              <label className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-gray-700">
                {t("detail.notes")}
                {note && (
                  <span
                    aria-hidden="true"
                    className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"
                  />
                )}
              </label>
              <Collapsible.Content className="data-[state=open]:block sm:flex-1 sm:flex sm:flex-col sm:min-h-0">
                <textarea
                  className="w-full min-h-[120px] sm:min-h-[160px] sm:flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm
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
  maxContribution,
}: {
  label: string;
  value: string;
  score?: number;
  maxContribution: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_2.5rem] items-baseline gap-x-2">
      <span className="text-gray-500 truncate">{label}</span>
      <span className="font-medium text-gray-800 truncate">{value}</span>
      <span
        dir="ltr"
        className={`tabular-nums text-xs text-end ${
          score == null ? "text-transparent" : contributionColor(score, maxContribution)
        }`}
        aria-hidden={score == null}
      >
        {score != null ? score.toFixed(1) : "—"}
      </span>
    </div>
  );
}
