import { useTranslation } from "react-i18next";
import type { ParameterConfig } from "../../types";
import { ScoreButtonGroup } from "./ScoreButtonGroup";
import { resolveLocale } from "../../utils/locale";

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

  return (
    <div className="grid gap-2">
      {config.values.map((value) => {
        const label = config.valueLabels[value]?.[lang] ?? value;
        return (
          <div
            key={value}
            className="flex items-center justify-between gap-3 py-1"
          >
            <span className="text-sm text-gray-700 min-w-[140px] font-mono">
              {label}
            </span>
            <ScoreButtonGroup paramId={config.id} valueKey={value} />
          </div>
        );
      })}
    </div>
  );
}
