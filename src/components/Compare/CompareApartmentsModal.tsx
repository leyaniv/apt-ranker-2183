/**
 * Multi-apartment side-by-side comparison popup for the Ranking tab.
 *
 * The Ranking tab's "Compare" button puts the table into selection mode and
 * lets the user pick up to N apartments (4 desktop / 2 mobile). This modal
 * renders the chosen apartments in a single table similar to the score
 * breakdown, with two columns per apartment — one for the apartment's value
 * for the field, one for its weighted contribution to the total score.
 *
 * All apartments share a single profile here (the active one), so the
 * breakdowns are taken straight from the `RankedApartment` entries the
 * Ranking tab already computed via `rankApartments`. No re-ranking happens
 * inside this modal.
 *
 * Mirrors `CompareDetailModal`'s structure (overlay + Esc-to-close + dynamic
 * `gridTemplateColumns`) but iterates over apartments instead of profiles.
 */
import { Fragment, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  ImportanceWeights,
  ParameterId,
  RankedApartment,
} from "../../types";
import { resolveLocale } from "../../utils/locale";
import { PARAMETER_CONFIGS } from "../../utils/parameterConfigs";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { RankChip } from "../Results/RankChip";

/** Default importance weight when a parameter has no explicit weight set
 *  (kept in sync with `DEFAULT_WEIGHT` in `utils/scoring.ts`). */
const DEFAULT_WEIGHT = 3;

interface Props {
  /** Selected apartments (ranked under the active profile, in the order the
   *  user picked them — preserved so columns stay stable while toggling). */
  selected: RankedApartment[];
  /** Map: slug → display rank under the active profile. Sourced from
   *  `ResultsTable`'s `rankLabelMap` so the chip in this popup matches
   *  the chip the user clicked from. `null` for sold/excluded entries
   *  (no rank assigned), which renders as a placeholder. */
  ranks: Map<string, number | null>;
  /** Active profile's effective importance weights (used to derive the raw
   *  value-score for the Score column tooltip). */
  weights: ImportanceWeights;
  /** Active profile's manual nudges (slug → ±10), surfaced in a dedicated
   *  row when any selected apartment has a non-zero entry. */
  manualAdjustments: Record<string, number>;
  /** Active profile's free-text notes (slug → note). Rendered read-only as
   *  a per-apartment card under the score table. */
  notes: Record<string, string>;
  onClose: () => void;
}

interface DetailRowDef {
  key: string;
  label: string;
  /** Per-apartment displayed value (formatted). */
  valueFor: (apt: RankedApartment) => string;
  paramId?: ParameterId;
}

export function CompareApartmentsModal({
  selected,
  ranks,
  weights,
  manualAdjustments,
  notes,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = resolveLocale(i18n.language);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Field label resolver. On mobile we prefer the parameter's
  // `shortLabel` (e.g. "Air Dir" instead of "Air Direction") to keep
  // the table from horizontally overflowing; on desktop we use the
  // full label since space isn't an issue. Falls back to the full
  // label if no `shortLabel` was defined for the parameter.
  const paramLabel = (id: ParameterId): string => {
    const cfg = PARAMETER_CONFIGS.find((p) => p.id === id);
    if (!cfg) return id;
    if (!isDesktop && cfg.shortLabel) return cfg.shortLabel[lang];
    return cfg.label[lang];
  };

  const areaUnit = t("results.areaUnit");
  const fmtPrice = (n: number) =>
    `₪${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  // Per-balcony directions: data is stored as Hebrew strings; for `en` we
  // map each token to its English cardinal. Mirrors the helper used in
  // `ApartmentDetail` / `CompareDetailModal`.
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

  const balconyDirectionLabel = (apt: RankedApartment): string => {
    const parts = [
      formatBalconyDir(apt.apartment.balcony_1_direction),
      formatBalconyDir(apt.apartment.balcony_2_direction),
    ].filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(" / ") : "—";
  };

  const directionLabel = (apt: RankedApartment): string =>
    lang === "he"
      ? apt.apartment.air_direction
      : apt.apartment.directions.join(", ");

  // Logical row order — score-bearing rows only. Display-only fields like
  // the storage ID / property slug are skipped because the comparison view
  // is meant to focus on what drove the score.
  const rows: DetailRowDef[] = [
    {
      key: "rooms",
      paramId: "rooms",
      label: paramLabel("rooms"),
      valueFor: (a) => a.apartment.rooms,
    },
    {
      key: "building",
      paramId: "building",
      label: paramLabel("building"),
      valueFor: (a) => a.apartment.buildingKey,
    },
    {
      key: "floor",
      paramId: "floor",
      label: paramLabel("floor"),
      valueFor: (a) => a.apartment.floor,
    },
    {
      key: "layout",
      paramId: "layout",
      label: paramLabel("layout"),
      valueFor: (a) => t(`results.layout_${a.apartment.layout}`),
    },
    {
      key: "type",
      paramId: "type",
      label: t("detail.type"),
      valueFor: (a) => a.apartment.type,
    },
    {
      key: "area_sqm",
      paramId: "area_sqm",
      label: paramLabel("area_sqm"),
      valueFor: (a) => `${a.apartment.area_sqm} ${areaUnit}`,
    },
    {
      key: "balcony_area_sqm",
      paramId: "balcony_area_sqm",
      label: paramLabel("balcony_area_sqm"),
      valueFor: (a) => `${a.apartment.balcony_area_sqm} ${areaUnit}`,
    },
    {
      key: "storage_area_sqm",
      paramId: "storage_area_sqm",
      label: paramLabel("storage_area_sqm"),
      // Storage unit ID intentionally omitted in the compare view — the
      // ID is identifying metadata that doesn't affect scoring and would
      // crowd the value column under tight cap-of-4 layouts.
      valueFor: (a) => `${a.apartment.storage_area_sqm} ${areaUnit}`,
    },
    {
      key: "air_direction",
      paramId: "air_direction",
      label: paramLabel("air_direction"),
      valueFor: directionLabel,
    },
    {
      key: "air_direction_count",
      paramId: "air_direction_count",
      label: paramLabel("air_direction_count"),
      valueFor: (a) => String(a.apartment.directionCount),
    },
    {
      key: "balcony_direction",
      paramId: "balcony_direction",
      label: paramLabel("balcony_direction"),
      valueFor: balconyDirectionLabel,
    },
    {
      key: "price",
      paramId: "price",
      label: paramLabel("price"),
      valueFor: (a) => fmtPrice(a.apartment.price),
    },
  ];

  // Per-apartment overall match % (matches `ApartmentDetail`'s formula):
  // sum of weighted contributions ÷ (totalWeight × 5) × 100, plus the
  // active profile's manual nudge (skipped for excluded apts to stay
  // consistent with the engine's behavior).
  const totals = useMemo(() => {
    return selected.map((r) => {
      const totalContribution = Object.values(r.breakdown).reduce(
        (s, v) => s + v,
        0,
      );
      const maxPossible = r.totalWeight * 5;
      const base = maxPossible > 0 ? (totalContribution / maxPossible) * 100 : null;
      const adj = r.excluded
        ? 0
        : manualAdjustments[r.apartment.property_slug] ?? 0;
      const total = base != null ? base + adj : null;
      return { base, adj, total };
    });
  }, [selected, manualAdjustments]);

  // ── Layout strategy ───────────────────────────────────────────────
  //
  // Plain HTML `<table>`. Browsers natively share column widths
  // across all rows, which is exactly what previous CSS-grid
  // attempts kept fighting against. Per-apt we spend two `<td>`s —
  // SCORE first, then VALUE — so the user sees the score column
  // line up vertically with itself across every row, and likewise
  // for value.
  //
  // Best / worst is rendered as a "highlighter swipe": when an apt
  // wins (or loses) a row, both its SCORE and VALUE `<td>`s get a
  // tinted background. Because the cells touch (border-collapse),
  // the tints visually merge into a single continuous strip — the
  // paper-marker effect the user asked for.
  //
  // The inter-apt gap is delivered by a dedicated empty spacer
  // `<td>` between apartments rather than by `ps-` padding on the
  // next apt's score cell. This is essential for the highlighter:
  // if the inter-apt gap lived inside the next apt's score cell as
  // padding, that gap would inherit the tint when the apt was a
  // winner / loser, bleeding the highlighter into the
  // between-apartments whitespace.
  //
  // Result: each apt's [score|value] pair is a self-contained
  // strip, separated by clean white columns.
  //
  // All cell content uses `text-start`. Numbers carry `tabular-nums`
  // so `8.0` and `12.0` line up character-wise.
  const scoreCellBase =
    "text-start py-1 ps-2 pe-1 tabular-nums text-xs whitespace-nowrap align-baseline";
  const valueCellBase = "text-start py-1 pe-2 align-baseline";

  // Spacer column between apartments. Kept narrow (24 px) so apts
  // stay close enough to scan across, but wide enough that the
  // highlighter strips on adjacent winning apts don't visually
  // merge. Always `<td className={spacerClass} />` — never holds
  // content, never gets a tint.
  const spacerClass = "w-6";

  const showAdjustmentRow = totals.some((t) => t.adj !== 0);
  const hasAnyNote = selected.some((r) => {
    const n = notes[r.apartment.property_slug];
    return !!n && n.trim().length > 0;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-2 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-white rounded-lg shadow-xl border border-gray-200 max-w-4xl w-full max-h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 truncate min-w-0">
            {t("compareApts.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label={t("common.close")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="p-3 sm:p-4 space-y-4 text-sm">
          {selected.length === 0 ? (
            <div className="text-center text-gray-400 py-6">
              {t("compareApts.noSelection")}
            </div>
          ) : (
            <>
              {/* ── Score breakdown ─────────────────────────────────
                  Real `<table>`: the browser keeps every column the
                  same width across every row, which is the property
                  the previous grid-based layout kept losing. Per-apt
                  we use SCORE then VALUE columns so the user sees
                  vertical stacks of like-with-like (all scores
                  together, all values together).

                  `border-collapse` so the only borders are the
                  ones we explicitly add (sub-header bottom, total
                  top). `align-top` keeps content baseline-stable
                  even when cells wrap. */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  {/* Title row: rank chip + apt name + total-score
                      pill, spanning that apt's score+value columns.
                      `colSpan={2}` keeps it grouped over its apt's
                      pair of columns without misaligning them. */}
                  <tr>
                    <th />
                    {selected.map((r, i) => {
                      const rank = ranks.get(r.apartment.property_slug);
                      const aptLabel = `${r.apartment.buildingKey}#${r.apartment.apartment_number}`;
                      return (
                        <Fragment key={r.apartment.property_slug}>
                          {i > 0 && <th className={spacerClass} />}
                          <th
                            colSpan={2}
                            className="text-start font-semibold pb-2 ps-2"
                          >
                            {/* Order: apt label · rank · total-score.
                                The label leads because it's the
                                identifier (what the user clicked
                                from); rank and score chips trail as
                                ranking-context decoration. */}
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="truncate min-w-0 text-gray-800 text-xs"
                                title={aptLabel}
                              >
                                {aptLabel}
                              </span>
                              {rank != null && (
                                <span className="shrink-0">
                                  <RankChip rank={rank} />
                                </span>
                              )}
                              <span
                                dir="ltr"
                                className={`shrink-0 text-xs font-bold rounded-full px-2 py-0.5 ${scoreChipColor(r.totalScore)}`}
                                title={t("results.score")}
                              >
                                {r.totalScore.toFixed(2)}
                              </span>
                            </span>
                          </th>
                        </Fragment>
                      );
                    })}
                  </tr>

                  {/* Column sub-header: FIELD · per-apt (SCORE · VALUE),
                      with empty spacer columns between apts. Bottom
                      border anchors the start of the body. */}
                  <tr className="text-[10px] font-medium uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="text-start font-medium pb-1 pe-3">
                      {t("detail.colField")}
                    </th>
                    {selected.map((r, i) => (
                      <Fragment key={r.apartment.property_slug}>
                        {i > 0 && <th className={spacerClass} />}
                        <th className="text-start font-medium pb-1 ps-2 pe-1">
                          {t("compareApts.colScore")}
                        </th>
                        <th className="text-start font-medium pb-1 pe-2">
                          {t("compareApts.colValue")}
                        </th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {/* Parameter rows. For each row we compute the apt
                      index(es) holding the highest weighted score and
                      (when 3+ apts are compared) the lowest. Both the
                      score and value cells of the winning apt(s) get
                      the same chip tint, so the row's winner / loser
                      is unambiguous at a glance. */}
                  {rows.map((row) => {
                    const rowScores: Array<number | undefined> = selected.map(
                      (r) => (row.paramId ? r.breakdown[row.paramId] : undefined),
                    );
                    const bestSet = maxIndices(rowScores);
                    const worstSet =
                      selected.length >= 3 ? minIndices(rowScores) : new Set<number>();
                    return (
                      <tr key={row.key}>
                        <td className="text-gray-500 py-1 pe-3 align-baseline">
                          {row.label}
                        </td>
                        {selected.map((r, i) => {
                          const c = rowScores[i];
                          const w = row.paramId
                            ? weights[row.paramId] ?? DEFAULT_WEIGHT
                            : undefined;
                          const valueScore =
                            c != null && w != null && w > 0 ? c / w : undefined;
                          const isBest = bestSet.has(i);
                          const isWorst = worstSet.has(i);
                          // Highlighter swipe: tint applied to *both*
                          // cells of the winning apt. Browsers paint
                          // the two adjacent `<td>`s' backgrounds as
                          // a single visual strip across this row.
                          const highlight = isBest
                            ? BEST_CHIP_BG
                            : isWorst
                              ? WORST_CHIP_BG
                              : "";
                          const scoreTitle =
                            valueScore != null && w != null
                              ? `${t("detail.colScore")} ${valueScore.toFixed(1)} · ${t("detail.colWeight")} ${w}`
                              : undefined;
                          const extremaTitle = isBest
                            ? t("compareApts.bestScoreTooltip")
                            : isWorst
                              ? t("compareApts.worstScoreTooltip")
                              : undefined;
                          // Score text color: use the highlighter's
                          // `text-{green,red}-900` when tinted (both
                          // for legibility against the bg and to
                          // suppress the muted `contributionColor`),
                          // else fall back to the contribution scale.
                          const scoreText =
                            highlight ||
                            (c == null ? "text-gray-300" : contributionColor(c));
                          const valueText = highlight || "text-gray-800";
                          return (
                            <Fragment key={r.apartment.property_slug}>
                              {i > 0 && <td className={spacerClass} />}
                              <td
                                className={`${scoreCellBase} ${scoreText}`}
                                title={scoreTitle ?? extremaTitle}
                              >
                                {c != null ? c.toFixed(1) : "—"}
                              </td>
                              <td
                                className={`${valueCellBase} font-medium ${valueText}`}
                                title={extremaTitle}
                              >
                                {row.valueFor(r)}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Manual adjustment row — only when at least one
                      apt has a non-zero nudge under the active
                      profile. Lives in the score column (it's a
                      score-only adjustment); the value column is
                      empty. */}
                  {showAdjustmentRow && (
                    <tr>
                      <td className="text-gray-500 py-1 pe-3 text-xs align-baseline">
                        {t("detail.manualAdjustment")}
                      </td>
                      {selected.map((r, i) => {
                        const adj = totals[i].adj;
                        const adjColor =
                          adj > 0
                            ? "text-blue-700"
                            : adj < 0
                              ? "text-amber-700"
                              : "text-gray-300";
                        return (
                          <Fragment key={r.apartment.property_slug}>
                            {i > 0 && <td className={spacerClass} />}
                            <td className={`${scoreCellBase} ${adjColor}`}>
                              {adj === 0
                                ? "—"
                                : `${adj > 0 ? "+" : "−"}${Math.abs(adj)}%`}
                            </td>
                            <td className={valueCellBase} />
                          </Fragment>
                        );
                      })}
                    </tr>
                  )}
                </tbody>

                <tfoot>
                  {/* Total row. Best/worst chips highlight the score
                      cell only (no per-apt value at this level).
                      Excluded apartments are skipped from the extrema
                      pool so the chip never lands on an "excluded"
                      red total. */}
                  {(() => {
                    const totalsForExtrema: Array<number | null> = totals.map(
                      ({ total }, i) => (selected[i].excluded ? null : total),
                    );
                    const bestTotalSet = maxIndices(totalsForExtrema);
                    const worstTotalSet =
                      selected.length >= 3 ? minIndices(totalsForExtrema) : new Set<number>();
                    return (
                      <tr className="border-t border-gray-200 text-sm font-semibold">
                        <td className="text-gray-700 pt-2 pe-3 align-baseline">
                          {t("detail.totalScore")}
                        </td>
                        {selected.map((r, i) => {
                          const { total, adj } = totals[i];
                          const excluded = !!r.excluded;
                          const isBest = bestTotalSet.has(i);
                          const isWorst = worstTotalSet.has(i);
                          // Total row's highlighter spans both the
                          // score cell (carrying the %) and the empty
                          // value cell, so the strip occupies the
                          // full width of the apt — same paper-marker
                          // shape as the parameter rows above.
                          const highlight = isBest
                            ? BEST_CHIP_BG
                            : isWorst
                              ? WORST_CHIP_BG
                              : "";
                          const extremaTitle = isBest
                            ? t("compareApts.bestScoreTooltip")
                            : isWorst
                              ? t("compareApts.worstScoreTooltip")
                              : undefined;
                          const excludedTitle = excluded
                            ? t("compare.excludedByProfile")
                            : undefined;
                          const totalText =
                            highlight ||
                            (excluded
                              ? "text-red-600"
                              : adj > 0
                                ? "text-blue-700"
                                : adj < 0
                                  ? "text-amber-700"
                                  : "text-gray-800");
                          return (
                            <Fragment key={r.apartment.property_slug}>
                              {i > 0 && <td className={spacerClass} />}
                              <td
                                className={`text-start pt-2 pb-1 ps-2 pe-1 tabular-nums whitespace-nowrap align-baseline ${totalText}`}
                                title={extremaTitle ?? excludedTitle}
                              >
                                {total != null ? `${total.toFixed(0)}%` : "—"}
                              </td>
                              <td
                                className={`pt-2 pb-1 pe-2 align-baseline ${highlight}`}
                              />
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>

              {/* ── Notes per apartment (read-only) ─────────────────
                  Hidden when none of the selected apartments have a note,
                  to keep the popup compact in the common case. */}
              {hasAnyNote && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {t("compareApts.notesPerApt")}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selected.map((r) => {
                      const note = notes[r.apartment.property_slug];
                      const hasNote = !!note && note.trim().length > 0;
                      const aptLabel = `${r.apartment.buildingKey}#${r.apartment.apartment_number}`;
                      return (
                        <div
                          key={r.apartment.property_slug}
                          className="rounded-md border border-gray-200 bg-gray-50 p-2 flex flex-col gap-1 min-h-[60px]"
                        >
                          <div
                            className="text-[11px] font-medium text-gray-600 truncate"
                            title={aptLabel}
                          >
                            {aptLabel}
                          </div>
                          <div
                            className={`text-xs whitespace-pre-wrap break-words ${
                              hasNote ? "text-gray-800" : "text-gray-400 italic"
                            }`}
                          >
                            {hasNote ? note : t("compareApts.noNote")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Color the weighted contribution cell on a coarse scale. Mirrors the
 * helper used in `CompareDetailModal` so the two compare popups read the
 * same: green = heavy positive contribution, gray = mild, red ranges are
 * skipped because contributions are non-negative after normalization.
 */
function contributionColor(contrib: number): string {
  if (contrib >= 15) return "text-green-700";
  if (contrib >= 10) return "text-green-600";
  if (contrib >= 5) return "text-gray-700";
  if (contrib >= 1) return "text-gray-500";
  return "text-gray-400";
}

/**
 * Background+text palette for the small total-score pill rendered next
 * to each compared apartment's title. Inlined (rather than imported) to
 * keep `ApartmentRow`'s internal helper private — the two functions are
 * intentionally kept in sync by hand because the score scale (1–5) is a
 * shared product convention, not a coincidence. Mirrors the buckets used
 * in `ApartmentRow#scoreColor` so the chip color matches what the user
 * already saw in the ranking row.
 */
function scoreChipColor(score: number): string {
  if (score >= 4.2) return "bg-green-100 text-green-800";
  if (score >= 3.5) return "bg-lime-100 text-lime-800";
  if (score >= 2.8) return "bg-yellow-100 text-yellow-800";
  if (score >= 2.0) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

/**
 * Returns the set of indices that hold the maximum value across `values`,
 * skipping `null`/`undefined`. Empty result when all values are null or
 * when every defined value is the same (no winner). Ties are surfaced —
 * e.g. two apts tied for the highest "rooms" score both get marked.
 */
function maxIndices(values: Array<number | null | undefined>): Set<number> {
  let max = -Infinity;
  let anyDefined = false;
  let allSame = true;
  let firstDefined: number | undefined;
  for (const v of values) {
    if (v == null) continue;
    if (!anyDefined) {
      firstDefined = v;
      anyDefined = true;
    } else if (v !== firstDefined) {
      allSame = false;
    }
    if (v > max) max = v;
  }
  if (!anyDefined || allSame) return new Set();
  const out = new Set<number>();
  values.forEach((v, i) => {
    if (v != null && v === max) out.add(i);
  });
  return out;
}

/**
 * Mirror of `maxIndices` for the lowest defined value. Used only when
 * 3+ apartments are compared — with just 2, "best" and "worst" point at
 * the same pair of cells and the worst marker adds noise.
 */
function minIndices(values: Array<number | null | undefined>): Set<number> {
  let min = Infinity;
  let anyDefined = false;
  let allSame = true;
  let firstDefined: number | undefined;
  for (const v of values) {
    if (v == null) continue;
    if (!anyDefined) {
      firstDefined = v;
      anyDefined = true;
    } else if (v !== firstDefined) {
      allSame = false;
    }
    if (v < min) min = v;
  }
  if (!anyDefined || allSame) return new Set();
  const out = new Set<number>();
  values.forEach((v, i) => {
    if (v != null && v === min) out.add(i);
  });
  return out;
}

/** Background + text-color tokens for the highlighter swipe over a
 *  row's best apartment. Applied to BOTH the score and value `<td>`s
 *  of the winning apt; because the cells touch, the two backgrounds
 *  read as a single continuous green strip — the paper-highlighter
 *  effect. The dark text color (`text-green-900`) is paired with
 *  the light bg here so the digits stay legible against the tint
 *  without a separate text-color rule. */
const BEST_CHIP_BG = "bg-green-100 text-green-900";
/** Mirror of `BEST_CHIP_BG` for the row's worst apartment. */
const WORST_CHIP_BG = "bg-red-100 text-red-900";
