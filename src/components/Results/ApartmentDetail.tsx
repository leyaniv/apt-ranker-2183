import { useTranslation } from "react-i18next";
import type { Apartment } from "../../types";
import { resolveLocale } from "../../utils/locale";

interface ApartmentDetailProps {
  apartment: Apartment;
  breakdown: Record<string, number>;
  note?: string;
  onNoteChange?: (slug: string, text: string) => void;
}

/**
 * Expanded detail view for a single apartment.
 * Shows all fields and PDF links.
 */
export function ApartmentDetail({ apartment, breakdown, note, onNoteChange }: ApartmentDetailProps) {
  const { t, i18n } = useTranslation();
  const lang = resolveLocale(i18n.language);

  const directionLabel =
    lang === "he" ? apartment.air_direction : apartment.directions.join(", ");

  const pdfs = [
    {
      label: t("detail.pdfApartment"),
      url: apartment.pdf_apartment_plan_url,
    },
    { label: t("detail.pdfFloor"), url: apartment.pdf_floor_plan_url },
    {
      label: t("detail.pdfParking"),
      url: apartment.pdf_parking_storage_url,
    },
    {
      label: t("detail.pdfDevelopment"),
      url: apartment.pdf_development_url,
    },
  ].filter((p) => p.url);

  return (
    <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
      {/* Details grid */}
      <div className="space-y-1.5">
        <DetailRow label={t("detail.balcony")} value={`${apartment.balcony_area_sqm} ${t("results.areaUnit")}`} />
        <DetailRow label={t("detail.storage")} value={`${apartment.storage_area_sqm} ${t("results.areaUnit")}`} />
        <DetailRow label={t("detail.storageId")} value={apartment.storage_id} />
        <DetailRow label={t("detail.parking")} value={String(apartment.parking_count)} />
        <DetailRow label={t("detail.type")} value={apartment.type} />
        <DetailRow label={t("detail.airDirection")} value={directionLabel} />
        <DetailRow
          label={t("detail.pricePerSqm")}
          value={`₪${apartment.price_per_sqm.toLocaleString("en", {
            maximumFractionDigits: 0,
          })}`}
        />
      </div>

      {/* Score breakdown */}
      <div className="space-y-1.5">
        <p className="font-medium text-gray-700 text-xs uppercase tracking-wide">
          Score Breakdown
        </p>
        {Object.entries(breakdown)
          .sort(([, a], [, b]) => b - a)
          .map(([paramId, contribution]) => (
            <div
              key={paramId}
              className="flex justify-between text-xs text-gray-600"
            >
              <span>{paramId}</span>
              <span className="font-mono">{contribution.toFixed(1)}</span>
            </div>
          ))}
      </div>

      {/* PDF links */}
      {pdfs.length > 0 && (
        <div className="col-span-full pt-2 flex flex-wrap gap-2">
          {pdfs.map((pdf) => (
            <a
              key={pdf.label}
              href={pdf.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs
                         font-medium text-blue-600 bg-blue-50 rounded-md
                         hover:bg-blue-100 transition-colors"
            >
              📄 {pdf.label}
            </a>
          ))}
          <a
            href={apartment.detail_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs
                       font-medium text-gray-600 bg-gray-100 rounded-md
                       hover:bg-gray-200 transition-colors"
          >
            🔗 {t("detail.openOnSite")}
          </a>
        </div>
      )}

      {/* Notes */}
      {onNoteChange && (
        <div className="col-span-full pt-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t("detail.notes")}
          </label>
          <textarea
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                       text-gray-900 bg-gray-100
                       placeholder:text-gray-400
                       focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-y"
            rows={2}
            placeholder={t("detail.notesPlaceholder")}
            value={note ?? ""}
            onChange={(e) => onNoteChange(apartment.property_slug, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
