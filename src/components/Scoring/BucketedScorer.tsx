import { useTranslation } from "react-i18next";
import type { ParameterConfig } from "../../types";
import { ScoreButtonGroup } from "./ScoreButtonGroup";
import { resolveLocale } from "../../utils/locale";
import { useIsDesktop } from "../../hooks/useIsDesktop";

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

  return (
    <div className="grid gap-2">
      {config.values.map((value) => {
        const fullLabel = config.valueLabels[value]?.[lang] ?? value;
        // Tighten the en-dash on mobile to free up horizontal space:
        // "₪1.2 – 1.5M" → "₪1.2–1.5M". Desktop has room for the spacing.
        const label = isDesktop ? fullLabel : fullLabel.replace(/ – /g, "–");
        return (
          <div
            key={value}
            className="flex items-center justify-between gap-2 sm:gap-3 py-1"
          >
            <span className="text-sm text-gray-700 sm:min-w-[140px] font-mono truncate">
              {label}
            </span>
            <ScoreButtonGroup paramId={config.id} valueKey={value} />
          </div>
        );
      })}
    </div>
  );
}
