import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { AboutModal } from "../Settings/AboutModal";
import { SettingsModal } from "../Settings/SettingsModal";

export function Header() {
  const { t } = useTranslation();
  const { apartments, settings, updateSettings, onboarding } = useApp();
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Title */}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">
            {t("app.title")}
          </h1>
          <p className="text-sm text-gray-500">
            {t("app.subtitle", { count: apartments.length })}
          </p>
        </div>

        {/* Warning + Settings + About */}
        <div className="flex items-center gap-3" data-tour-id="header-actions">
          <button
            onClick={() => setShowDisclaimer(true)}
            title={t("about.disclaimer")}
            aria-label={t("header.disclaimer")}
            className="p-1.5 rounded-md text-amber-500 hover:bg-amber-50 hover:text-amber-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 translate-y-[2px]">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => onboarding.open()}
            title={t("onboarding.helpButton")}
            aria-label={t("onboarding.helpButton")}
            className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-3.75a1.5 1.5 0 0 0-1.342.83.75.75 0 1 1-1.342-.67A3 3 0 0 1 13 7.75c0 1.074-.704 1.855-1.404 2.286A5.32 5.32 0 0 1 10.75 10.5v.25a.75.75 0 0 1-1.5 0v-.75c0-.504.35-.829.612-.996A3.84 3.84 0 0 1 10.75 8.66c.504-.31.75-.64.75-.91a1.5 1.5 0 0 0-1.5-1.5ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title={t("settings.title")}
            aria-label={t("settings.title")}
            className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => setShowAbout(true)}
            title={t("about.title")}
            aria-label={t("about.title")}
            className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      {showSettings && (
        <SettingsModal
          settings={settings}
          totalApartments={apartments.length}
          onUpdate={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showDisclaimer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowDisclaimer(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowDisclaimer(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
              <p className="text-sm text-amber-800 leading-relaxed">
                ⚠️ {t("about.disclaimer")}
              </p>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowDisclaimer(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
