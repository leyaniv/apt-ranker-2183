/**
 * Multi-profile apartment detail popup for the Compare tab.
 *
 * Renders a modal similar in shape to the popup used by the Buildings
 * tab and the inline detail view in the Ranking tab, but with two
 * deliberate twists tuned to comparison:
 *  - The score breakdown table grows a column per compared profile so
 *    the user can see, side-by-side, which profile values each
 *    parameter higher and which dragged a given apartment down.
 *  - Notes are surfaced read-only — one block per compared profile —
 *    rather than a single editable textarea. Editing notes belongs
 *    inside the profile that owns them, so we keep this view a pure
 *    diff.
 *
 * No mark-as-sold / mark-as-excluded / manual-adjustment controls:
 *   those are per-profile actions that don't have a single
 *   well-defined target when several profiles are open at once.
 */
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  Apartment,
  BucketMap,
  ParameterId,
  Profile,
  RankedApartment,
} from "../../types";
import { rankApartments } from "../../utils/scoring";
import { resolveLocale } from "../../utils/locale";
import { PARAMETER_CONFIGS } from "../../utils/parameterConfigs";

/** Default importance weight when a parameter has no explicit weight set
 *  (kept in sync with `DEFAULT_WEIGHT` in `utils/scoring.ts`). */
const DEFAULT_WEIGHT = 3;

interface Props {
  apartment: Apartment;
  apartments: Apartment[];
  profiles: Profile[];
  buckets: BucketMap;
  notes: Record<string, string | undefined>;
  onClose: () => void;
}

interface DetailRowDef {
  key: string;
  label: string;
  value: string;
  paramId?: ParameterId;
}

export function CompareDetailModal({
  apartment,
  apartments,
  profiles,
  buckets,
  notes,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = resolveLocale(i18n.language);

  // Esc-to-close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Compute per-profile ranked entry for the focused apartment. We re-run
  // `rankApartments` per profile so the breakdown / total reflects each
  // profile's full effective weights and (any) manual adjustments.
  const perProfile = useMemo(() => {
    const slug = apartment.property_slug;
    return profiles.map((p) => {
      const ranked = rankApartments(
        apartments,
        p.scores,
        p.weights,
        buckets,
        true,
        true, // includeExcluded so vetoed apts still appear with breakdown
        p.manualAdjustments,
      );
      const found: RankedApartment | undefined = ranked.find(
        (r) => r.apartment.property_slug === slug,
      );
      return { profile: p, ranked: found };
    });
  }, [apartments, profiles, buckets, apartment.property_slug]);

  const paramLabel = (id: ParameterId): string => {
    const cfg = PARAMETER_CONFIGS.find((p) => p.id === id);
    return cfg ? cfg.label[lang] : id;
  };

  const areaUnit = t("results.areaUnit");
  const fmtPrice = (n: number) =>
    `₪${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  const directionLabel =
    lang === "he" ? apartment.air_direction : apartment.directions.join(", ");

  const formatBalconyDir = (raw: string | undefined): string => {
    if (!raw) return "";
    if (lang === "he") return raw;
    const parts = raw
      .replace("דרופ", "דרום")
      .replace(/\s+/g, "")
      .split("-");
    const map: Record<string, string> = {
      צפון: "N",
      דרום: "S",
      מזרח: "E",
      מערב: "W",
    };
    return parts.map((p) => map[p] ?? p).join(", ");
  };
  const balconyParts = [
    formatBalconyDir(apartment.balcony_1_direction),
    formatBalconyDir(apartment.balcony_2_direction),
  ].filter((s) => s.length > 0);
  const balconyDirectionLabel =
    balconyParts.length > 0 ? balconyParts.join(" / ") : "—";

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
    {
      key: "balcony_direction",
      paramId: "balcony_direction",
      label: paramLabel("balcony_direction"),
      value: balconyDirectionLabel,
    },
    { key: "price", paramId: "price", label: paramLabel("price"), value: fmtPrice(apartment.price) },
  ];

  const scoredRows = rows.filter((r) => r.paramId);

  // Per-profile total % (matches `ApartmentDetail`'s formula): the sum of
  // weighted contributions divided by `totalWeight × 5`, plus the manual
  // adjustment for that slug under that profile.
  const profileTotals = perProfile.map(({ profile, ranked }) => {
    if (!ranked) return { profile, base: null as number | null, adj: 0, total: null as number | null, excluded: false };
    const totalContribution = Object.values(ranked.breakdown).reduce(
      (s, v) => s + v,
      0,
    );
    const maxPossible = ranked.totalWeight * 5;
    const base = maxPossible > 0 ? (totalContribution / maxPossible) * 100 : null;
    const adj = ranked.excluded
      ? 0
      : profile.manualAdjustments?.[apartment.property_slug] ?? 0;
    const total = base != null ? base + adj : null;
    return { profile, base, adj, total, excluded: !!ranked.excluded };
  });

  // PDFs / parking are apartment-level (profile-independent) — show once.
  const pdfs = [
    { label: t("detail.pdfApartment"), url: apartment.pdf_apartment_plan_url },
    { label: t("detail.pdfFloor"), url: apartment.pdf_floor_plan_url },
    { label: t("detail.pdfParking"), url: apartment.pdf_parking_storage_url },
    { label: t("detail.pdfDevelopment"), url: apartment.pdf_development_url },
  ].filter((p) => p.url);

  const parkingSpots = [apartment.parking_spot_1, apartment.parking_spot_2]
    .filter((n): n is number => n != null);

  // Grid template: Field | Value | one fixed-width column per profile.
  // Profile columns are 3rem wide (enough for "+12%" / "100%" without
  // truncating) — keeps the table readable at 2 profiles on phones and
  // 3 profiles on desktop. We build the template inline since the
  // column count varies at runtime; Tailwind class strings can't.
  const gridStyle = {
    gridTemplateColumns: `1fr 1fr ${"3rem ".repeat(perProfile.length).trim()}`,
  } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-2 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-white rounded-lg shadow-xl border border-gray-200 max-w-3xl w-full max-h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 truncate min-w-0">
            {apartment.buildingKey}#{apartment.apartment_number}
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

        <div className="p-3 sm:p-4 space-y-4 text-sm">
          {/* ── Score breakdown ─────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {t("detail.scoreBreakdown")}
            </h3>

            {/* Header row */}
            <div
              className="grid items-baseline gap-x-2 px-1 pb-1 border-b border-gray-200 text-[10px] font-medium uppercase tracking-wide text-gray-500"
              style={gridStyle}
            >
              <span>{t("detail.colField")}</span>
              <span>{t("detail.colValue")}</span>
              {perProfile.map(({ profile }) => (
                <span
                  key={profile.id}
                  className="text-end truncate"
                  title={profile.name}
                >
                  {profile.name}
                </span>
              ))}
            </div>

            {/* Parameter rows */}
            <div className="space-y-1">
              {scoredRows.map((row) => (
                <div
                  key={row.key}
                  className="grid items-baseline gap-x-2"
                  style={gridStyle}
                >
                  <span className="text-gray-500 truncate">{row.label}</span>
                  <span className="font-medium text-gray-800 truncate">{row.value}</span>
                  {perProfile.map(({ profile, ranked }) => {
                    const c = row.paramId && ranked ? ranked.breakdown[row.paramId] : undefined;
                    const w = row.paramId
                      ? profile.weights[row.paramId] ?? DEFAULT_WEIGHT
                      : undefined;
                    const valueScore =
                      c != null && w != null && w > 0 ? c / w : undefined;
                    return (
                      <span
                        key={profile.id}
                        dir="ltr"
                        className={`tabular-nums text-xs text-end ${
                          c == null
                            ? "text-gray-300"
                            : contributionColor(c)
                        }`}
                        title={
                          valueScore != null && w != null
                            ? `${t("detail.colScore")} ${valueScore.toFixed(1)} · ${t("detail.colWeight")} ${w}`
                            : undefined
                        }
                      >
                        {c != null ? c.toFixed(1) : "—"}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Manual adjustment row — only shown if at least one profile
                has a non-zero nudge for this apartment, so it stays out of
                the way for the common case. Each cell shows that profile's
                signed nudge (e.g. "+5%"), color-matched to the badge styles
                used in `ApartmentDetail` (blue for positive, amber for
                negative). */}
            {profileTotals.some(({ adj }) => adj !== 0) && (
              <div
                className="grid items-baseline gap-x-2 mt-1 pt-1 text-xs"
                style={gridStyle}
              >
                <span className="text-gray-500 truncate">
                  {t("detail.manualAdjustment")}
                </span>
                <span />
                {profileTotals.map(({ profile, adj }) => (
                  <span
                    key={profile.id}
                    dir="ltr"
                    className={`tabular-nums text-end ${
                      adj > 0
                        ? "text-blue-700"
                        : adj < 0
                          ? "text-amber-700"
                          : "text-gray-300"
                    }`}
                  >
                    {adj === 0
                      ? "—"
                      : `${adj > 0 ? "+" : "−"}${Math.abs(adj)}%`}
                  </span>
                ))}
              </div>
            )}

            {/* Total row — overall match % per profile, including any
                per-profile manual nudge baked into the sum. Excluded
                apartments are flagged inline with a red dot tooltip. */}
            <div
              className="grid items-baseline gap-x-2 mt-2 pt-2 border-t border-gray-200 text-sm font-semibold"
              style={gridStyle}
            >
              <span className="text-gray-700">{t("detail.totalScore")}</span>
              <span />
              {profileTotals.map(({ profile, total, adj, excluded }) => (
                <span
                  key={profile.id}
                  dir="ltr"
                  className={`tabular-nums text-end ${
                    excluded
                      ? "text-red-600"
                      : adj > 0
                        ? "text-blue-700"
                        : adj < 0
                          ? "text-amber-700"
                          : "text-gray-800"
                  }`}
                  title={excluded ? t("compare.excludedByProfile") : undefined}
                >
                  {total != null ? `${total.toFixed(0)}%` : "—"}
                </span>
              ))}
            </div>
          </section>

          {/* ── Notes per profile (read-only) ──────────────── */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {t("compare.notesPerProfile")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {profiles.map((p) => {
                const note = notes[p.id];
                const hasNote = !!note && note.trim().length > 0;
                return (
                  <div
                    key={p.id}
                    className="rounded-md border border-gray-200 bg-gray-50 p-2 flex flex-col gap-1 min-h-[60px]"
                  >
                    <div className="text-[11px] font-medium text-gray-600 truncate" title={p.name}>
                      {p.name}
                    </div>
                    <div
                      className={`text-xs whitespace-pre-wrap break-words ${
                        hasNote ? "text-gray-800" : "text-gray-400 italic"
                      }`}
                    >
                      {hasNote ? note : t("compare.noNote")}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Apartment-level extras (parking, PDFs) ─────── */}
          {(parkingSpots.length > 0 || pdfs.length > 0) && (
            <section className="space-y-2">
              {parkingSpots.length > 0 && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-gray-500 truncate">{t("detail.parking")}</span>
                  <span dir="ltr" className="font-medium text-gray-800 text-end tabular-nums">
                    {parkingSpots.join(", ")}
                  </span>
                </div>
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
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Color the weighted contribution cell on a coarse scale. Values are
 * already weighted (so they range roughly 1–25 for a max-importance
 * 5-score, vs 1–3 for a low-importance 1-score). We grade by absolute
 * size to highlight which parameters are doing the heavy lifting in
 * each profile's score, similar to `ApartmentDetail`'s `contributionColor`.
 */
function contributionColor(contrib: number): string {
  if (contrib >= 15) return "text-green-700";
  if (contrib >= 10) return "text-green-600";
  if (contrib >= 5) return "text-gray-700";
  if (contrib >= 1) return "text-gray-500";
  return "text-gray-400";
}
