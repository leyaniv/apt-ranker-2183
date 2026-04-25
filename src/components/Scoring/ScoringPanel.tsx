import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { ParameterCard } from "./ParameterCard";
import { TabHeader } from "../Layout/TabHeader";
import { ConfirmDialog } from "../Layout/ConfirmDialog";

/**
 * Main scoring panel: displays all parameter cards.
 * Standard parameters are shown expanded; advanced (type) is collapsed.
 */
export function ScoringPanel() {
  const { t } = useTranslation();
  const { parameterConfigs, activeProfile, resetScores, randomizeScores, roundScores, addProfile, settings, resolvedScoringInputStyle } = useApp();
  const [confirmRoundOpen, setConfirmRoundOpen] = useState(false);

  if (!activeProfile) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 mb-3">{t("profile.select")}</p>
        <button
          onClick={() => addProfile(t("profile.defaultName"))}
          className="px-4 py-2 bg-blue-600 text-white rounded-md
                     hover:bg-blue-700 transition-colors text-sm"
        >
          {t("profile.create")}
        </button>
      </div>
    );
  }

  const standardParams = parameterConfigs.filter((c) => !c.advanced);
  const advancedParams = parameterConfigs.filter((c) => c.advanced);

  return (
    <div className="p-4 sm:p-6 pb-20 sm:pb-6 space-y-3 max-w-3xl mx-auto w-full">
      <TabHeader title={t("scoring.title")} tooltip={t("scoring.howToUse")} />

      <div className="flex items-center justify-end gap-3 mb-2">
        {resolvedScoringInputStyle === "slider" && (
          <button
            onClick={() => setConfirmRoundOpen(true)}
            className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            {t("scoring.roundToInteger")}
          </button>
        )}
        {settings.developerTools && (
          <button
            onClick={() => randomizeScores()}
            className="text-xs text-purple-500 hover:text-purple-700 transition-colors"
          >
            🎲 {t("scoring.randomize")}
          </button>
        )}
        <button
          onClick={() => resetScores()}
          className="text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          {t("scoring.resetAll")}
        </button>
      </div>

      {/* Standard parameters */}
      {standardParams.map((config, idx) => (
        <div key={config.id} data-tour-id={idx === 0 ? "parameter-card" : undefined}>
          <ParameterCard config={config} />
        </div>
      ))}

      {/* Advanced parameters */}
      {advancedParams.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-gray-500 pt-3">
            {t("scoring.advanced")}
          </h3>
          {advancedParams.map((config) => (
            <ParameterCard key={config.id} config={config} />
          ))}
        </>
      )}

      {confirmRoundOpen && (
        <ConfirmDialog
          title={t("scoring.roundToInteger")}
          message={t("scoring.confirmRound")}
          confirmLabel={t("scoring.roundToInteger")}
          onConfirm={() => {
            roundScores();
            setConfirmRoundOpen(false);
          }}
          onCancel={() => setConfirmRoundOpen(false)}
        />
      )}
    </div>
  );
}
