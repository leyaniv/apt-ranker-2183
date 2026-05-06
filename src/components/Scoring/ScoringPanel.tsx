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
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

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
    <div className="px-2 pt-2 pb-20 sm:p-6 sm:pb-6 space-y-3 max-w-3xl mx-auto w-full">
      <div className="px-2 sm:px-0 flex items-center gap-2">
        <TabHeader title={t("scoring.title")} tooltip={t("scoring.howToUse")} />
        <div className="ms-auto flex items-center gap-1.5 shrink-0">
          {settings.developerTools && (
            <button
              onClick={() => randomizeScores()}
              title={t("scoring.randomize")}
              aria-label={t("scoring.randomize")}
              className="inline-flex items-center px-2 py-1 text-sm text-purple-600
                         bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              🎲
            </button>
          )}
          <button
            onClick={() => setConfirmResetOpen(true)}
            className="inline-flex items-center px-2 py-1 text-sm text-red-600 whitespace-nowrap
                       bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            {t("scoring.resetAll")}
          </button>
        </div>
      </div>

      {resolvedScoringInputStyle === "slider" && (
        <div className="flex items-center justify-end gap-3 mb-2">
          <button
            onClick={() => setConfirmRoundOpen(true)}
            className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            {t("scoring.roundToInteger")}
          </button>
        </div>
      )}

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

      {confirmResetOpen && (
        <ConfirmDialog
          title={t("scoring.resetAll")}
          message={t("scoring.confirmResetAll")}
          confirmLabel={t("scoring.resetAll")}
          onConfirm={() => {
            resetScores();
            setConfirmResetOpen(false);
          }}
          onCancel={() => setConfirmResetOpen(false)}
        />
      )}
    </div>
  );
}
