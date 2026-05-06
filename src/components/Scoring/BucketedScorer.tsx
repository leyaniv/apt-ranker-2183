import { useTranslation } from "react-i18next";
import type { ParameterConfig } from "../../types";
import { ScoreButtonGroup } from "./ScoreButtonGroup";
import { resolveLocale } from "../../utils/locale";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useApp } from "../../context/AppContext";
import { useValueStats } from "../../hooks/useValueStats";
import { StatsBar } from "./StatsBar";

interface BucketedScorerProps {
  config: ParameterConfig;
}

/**
 * Renders bucket range labels with 1–5 score button groups.
 * Used for numeric parameters that have been split into quantile buckets.
 */
export function BucketedScorer({ config }: BucketedScorerProps) {
  const { i18n } = useTranslation();
  const lang = resolveLocale(i18n.language);
  const isDesktop = useIsDesktop();
  const { apartments, buckets } = useApp();
  const valueStats = useValueStats(apartments, config.id, buckets);

  return (
    <div className="grid gap-1">
      {config.values.map((value) => {
        const fullLabel = config.valueLabels[value]?.[lang] ?? value;
        // Tighten the en-dash on mobile to free up horizontal space:
        // "₪1.2 – 1.5M" → "₪1.2–1.5M". Desktop has room for the spacing.
        const label = isDesktop ? fullLabel : fullLabel.replace(/ – /g, "–");
        return isDesktop ? (
          <div
            key={value}
            className="flex items-center justify-between gap-2 sm:gap-3 py-1"
          >
            <span className="text-sm text-gray-700 sm:min-w-[140px] font-mono truncate">
              {label}
            </span>
            <StatsBar stats={valueStats[value]} />
            <ScoreButtonGroup paramId={config.id} valueKey={value} />
          </div>
        ) : (
          <div key={value} className="flex items-center justify-between gap-2 py-0.5">
            <div className="min-w-0 flex-1">
              <span className="text-sm text-gray-700 font-mono truncate block">
                {label}
              </span>
              <StatsBar stats={valueStats[value]} />
            </div>
            <ScoreButtonGroup paramId={config.id} valueKey={value} />
          </div>
        );
      })}
    </div>
  );
}
