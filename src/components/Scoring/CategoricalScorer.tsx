import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ParameterConfig } from "../../types";
import { ScoreButtonGroup } from "./ScoreButtonGroup";
import { resolveLocale } from "../../utils/locale";
import { useApp } from "../../context/AppContext";
import { useIsDesktop } from "../../hooks/useIsDesktop";

interface CategoricalScorerProps {
  config: ParameterConfig;
}

/**
 * Renders a grid of value labels, each with a 1–5 score button group.
 * Used for categorical parameters like rooms, building, air_direction.
 * For the "type" parameter, also shows a PDF link to an example apartment.
 */
export function CategoricalScorer({ config }: CategoricalScorerProps) {
  const { i18n } = useTranslation();
  const lang = resolveLocale(i18n.language);
  const { apartments } = useApp();
  const isDesktop = useIsDesktop();

  // For the "type" parameter, build a map: type → { pdfUrl, example label }
  const typePdfMap = useMemo(() => {
    if (config.id !== "type") return null;
    const map = new Map<string, { url: string; label: string }>();
    for (const apt of apartments) {
      if (!map.has(apt.type) && apt.pdf_apartment_plan) {
        map.set(apt.type, {
          url: apt.pdf_apartment_plan,
          label: `${apt.buildingKey} #${apt.apartment_number}`,
        });
      }
    }
    return map;
  }, [config.id, apartments]);

  return (
    <div className="grid gap-2">
      {config.values.map((value) => {
        const fullLabel = config.valueLabels[value]?.[lang] ?? value;
        // On mobile the "Building" rows are tight against the score buttons,
        // and the parameter card header already says "Building", so render
        // just the compact "lot/bldg" key (e.g. "207/1") instead of the
        // verbose "Lot 207 / Building 1".
        let label = fullLabel;
        if (!isDesktop) {
          if (config.id === "building") {
            label = value;
          } else if (config.id === "layout" && lang === "en") {
            // Abbreviate "Regular apartment" → "Regular apt." etc. (English only —
            // Hebrew labels are already short enough on mobile).
            label = fullLabel.replace(/ apartment\b/i, " apt.");
          }
        }
        const pdfInfo = typePdfMap?.get(value);
        return (
          <div
            key={value}
            className="flex items-center justify-between gap-2 sm:gap-3 py-1"
          >
            <div className="flex items-center gap-2 min-w-0 sm:min-w-[120px]">
              <span className="text-sm text-gray-700 truncate">{label}</span>
              {pdfInfo && (
                <a
                  href={pdfInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-500 hover:text-blue-700 whitespace-nowrap"
                  title={pdfInfo.label}
                >
                  📄 {pdfInfo.label}
                </a>
              )}
            </div>
            <ScoreButtonGroup paramId={config.id} valueKey={value} />
          </div>
        );
      })}
    </div>
  );
}
