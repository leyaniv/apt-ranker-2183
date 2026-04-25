import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../hooks/useSettings";

interface SettingsModalProps {
  settings: AppSettings;
  totalApartments: number;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

export function SettingsModal({
  settings,
  totalApartments,
  onUpdate,
  onClose,
}: SettingsModalProps) {
  const { i18n, t } = useTranslation();
  const [localMax, setLocalMax] = useState<string>(
    settings.maxResults != null ? String(settings.maxResults) : ""
  );

  const LANGUAGES = [
    { code: "he", label: "עברית" },
    { code: "en", label: "English" },
  ];

  const THEMES = [
    { code: "system" as const, labelKey: "settings.themeSystem" },
    { code: "light" as const, labelKey: "settings.themeLight" },
    { code: "dark" as const, labelKey: "settings.themeDark" },
  ];

  const handleSave = () => {
    const parsed = parseInt(localMax, 10);
    if (localMax === "" || isNaN(parsed)) {
      onUpdate({ maxResults: null });
    } else {
      onUpdate({ maxResults: Math.max(1, Math.min(parsed, totalApartments)) });
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter") handleSave();
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      {/* Modal */}
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("settings.title")}
        </h2>

        {/* Max results setting */}
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="maxResults"
            className="text-sm font-medium text-gray-700"
            title={t("settings.maxResultsHint", { total: totalApartments })}
          >
            {t("settings.maxResults")}
          </label>
          <input
            id="maxResults"
            type="number"
            min={1}
            max={totalApartments}
            placeholder={String(totalApartments)}
            value={localMax}
            onChange={(e) => setLocalMax(e.target.value)}
            className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm
                       focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {t("settings.maxResultsHint", { total: totalApartments })}
        </p>

        {/* Language */}
        <div className="flex items-center justify-between gap-4 mt-4">
          <label
            htmlFor="language"
            className="text-sm font-medium text-gray-700"
          >
            {t("settings.language")}
          </label>
          <select
            id="language"
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm
                       focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Theme */}
        <div className="flex items-center justify-between gap-4 mt-4">
          <label
            htmlFor="theme"
            className="text-sm font-medium text-gray-700"
          >
            {t("settings.theme")}
          </label>
          <select
            id="theme"
            value={settings.theme}
            onChange={(e) =>
              onUpdate({ theme: e.target.value as "system" | "light" | "dark" })
            }
            className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm
                       focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
          >
            {THEMES.map((th) => (
              <option key={th.code} value={th.code}>
                {t(th.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Scoring input style */}
        <div className="flex items-center justify-between mt-4">
          <label
            htmlFor="scoringInputStyle"
            className="text-sm font-medium text-gray-700"
          >
            {t("settings.useSliderForScoring")}
          </label>
          <button
            id="scoringInputStyle"
            type="button"
            role="switch"
            aria-checked={settings.scoringInputStyle === "slider"}
            onClick={() =>
              onUpdate({
                scoringInputStyle:
                  settings.scoringInputStyle === "slider" ? "buttons" : "slider",
              })
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.scoringInputStyle === "slider"
                ? "bg-blue-600"
                : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.scoringInputStyle === "slider"
                  ? "translate-x-6 rtl:-translate-x-6"
                  : "translate-x-1 rtl:-translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Developer Tools */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
          <label
            htmlFor="developerTools"
            className="text-sm font-medium text-gray-700"
          >
            {t("settings.developerTools")}
          </label>
          <button
            id="developerTools"
            type="button"
            role="switch"
            aria-checked={settings.developerTools}
            onClick={() =>
              onUpdate({ developerTools: !settings.developerTools })
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.developerTools ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.developerTools
                  ? "translate-x-6 rtl:-translate-x-6"
                  : "translate-x-1 rtl:-translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800
                       border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md
                       hover:bg-blue-700 transition-colors"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
