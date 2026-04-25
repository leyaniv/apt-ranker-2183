import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useTranslation } from "react-i18next";
import type { ParameterConfig } from "../../types";
import { WeightSlider } from "./ScoreButtonGroup";
import { CategoricalScorer } from "./CategoricalScorer";
import { BucketedScorer } from "./BucketedScorer";
import { useApp } from "../../context/AppContext";
import { resolveLocale } from "../../utils/locale";

interface ParameterCardProps {
  config: ParameterConfig;
}

/**
 * Collapsible card for a single parameter.
 * Shows the parameter name + importance weight in the header,
 * and the value scoring grid when expanded.
 */
export function ParameterCard({ config }: ParameterCardProps) {
  const { i18n, t } = useTranslation();
  const { resetScores } = useApp();
  const lang = resolveLocale(i18n.language);
  const [open, setOpen] = useState(!config.advanced);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="bg-white rounded-lg border border-gray-200 overflow-visible">
        {/* Header — always visible */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 py-3">
          <Collapsible.Trigger className="flex items-center gap-2 flex-1 min-w-0 text-start">
            <span
              className="text-xs text-gray-400 transition-transform duration-200"
              style={{ transform: open ? "rotate(90deg)" : lang === "he" ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
            <span className="font-medium text-gray-900 truncate">
              {config.label[lang]}
            </span>
          </Collapsible.Trigger>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <span className="sm:hidden text-xs text-gray-500">
              {t("scoring.weight")}:
            </span>
            <div className="flex items-center gap-2">
              <WeightSlider paramId={config.id} />
              <button
                onClick={() => resetScores(config.id)}
                className="text-xs text-gray-400 hover:text-gray-600 px-1"
                title={t("scoring.resetParam")}
                aria-label={`${t("scoring.resetParam")} ${config.label[lang]}`}
              >
                ↺
              </button>
            </div>
          </div>
        </div>

        {/* Expandable content — value scores */}
        <Collapsible.Content>
          <div className="px-4 pb-4 pt-1 border-t border-gray-100">
            {config.kind === "categorical" ? (
              <CategoricalScorer config={config} />
            ) : (
              <BucketedScorer config={config} />
            )}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}
