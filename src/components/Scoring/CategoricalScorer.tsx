import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ParameterConfig } from "../../types";
import { ScoreButtonGroup } from "./ScoreButtonGroup";
import { resolveLocale } from "../../utils/locale";
import { useApp } from "../../context/AppContext";

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

  // For the "type" parameter, build a map: type → { pdfUrl, example label }
  const typePdfMap = useMemo(() => {
    if (config.id !== "type") return null;
    const map = new Map<string, { url: string; label: string }>();
    for (const apt of apartments) {
      if (!map.has(apt.type) && apt.pdf_apartment_plan_url) {
        map.set(apt.type, {
          url: apt.pdf_apartment_plan_url,
          label: `${apt.buildingKey} #${apt.apartment_number}`,
        });
      }
    }
    return map;
  }, [config.id, apartments]);

  return (
    <div className="grid gap-2">
      {config.values.map((value) => {
        const label = config.valueLabels[value]?.[lang] ?? value;
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
