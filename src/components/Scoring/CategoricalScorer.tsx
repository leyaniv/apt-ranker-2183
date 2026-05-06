import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ParameterConfig } from "../../types";
import { ScoreButtonGroup } from "./ScoreButtonGroup";
import { resolveLocale } from "../../utils/locale";
import { useApp } from "../../context/AppContext";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useValueStats } from "../../hooks/useValueStats";
import { StatsBar } from "./StatsBar";

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
  const { apartments, buckets } = useApp();
  const isDesktop = useIsDesktop();
  const valueStats = useValueStats(apartments, config.id, buckets);

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
    <div className="grid gap-1">
      {config.values.map((value) => {
        const fullLabel = config.valueLabels[value]?.[lang] ?? value;
        let label = fullLabel;
        if (!isDesktop) {
          if (config.id === "building") {
            label = value;
          } else if (config.id === "layout" && lang === "en") {
            label = fullLabel.replace(/ apartment\b/i, " apt.");
          }
        }
        const pdfInfo = typePdfMap?.get(value);
        return isDesktop ? (
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
            <StatsBar stats={valueStats[value]} />
            <ScoreButtonGroup paramId={config.id} valueKey={value} />
          </div>
        ) : (
          <div key={value} className="flex items-center justify-between gap-2 py-0.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
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
              <StatsBar stats={valueStats[value]} />
            </div>
            <ScoreButtonGroup paramId={config.id} valueKey={value} />
          </div>
        );
      })}
    </div>
  );
}
