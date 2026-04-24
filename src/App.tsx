import { useEffect, useState, useCallback, useTransition, lazy, Suspense } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useTranslation } from "react-i18next";
import { AppProvider, useApp } from "./context/AppContext";
import { Header } from "./components/Layout/Header";
import { ProfileSelector } from "./components/ProfileManager/ProfileSelector";
import { ScoringPanel } from "./components/Scoring/ScoringPanel";
import { OnboardingTour } from "./components/Onboarding/OnboardingTour";

// Lazy-load heavy tab contents so they don't block initial render and so
// subsequent tab switches can be wrapped in a transition.
const ResultsTable = lazy(() =>
  import("./components/Results/ResultsTable").then((m) => ({ default: m.ResultsTable }))
);
const ChangeHistory = lazy(() =>
  import("./components/History/ChangeHistory").then((m) => ({ default: m.ChangeHistory }))
);
const CompareView = lazy(() =>
  import("./components/Compare/CompareView").then((m) => ({ default: m.CompareView }))
);
const CombineView = lazy(() =>
  import("./components/Compare/CombineView").then((m) => ({ default: m.CombineView }))
);

function TabLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center p-8 text-gray-400 text-sm">
      {t("common.loading")}
    </div>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const { loading, error, undo, redo, canUndo, canRedo, settings, hasUnsavedManualOrder, saveUnsavedManualOrder, discardUnsavedManualOrder, registerTabSetter, apartments, onboarding } = useApp();

  // Controlled tab state with unsaved manual order guard
  const [activeTab, setActiveTab] = useState("scoring");
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  // Transition: keeps the UI responsive while a heavy tab (e.g. Results) mounts.
  const [, startTabTransition] = useTransition();

  const handleTabChange = useCallback(
    (newTab: string) => {
      if (activeTab === "results" && hasUnsavedManualOrder) {
        setPendingTab(newTab);
        return;
      }
      startTabTransition(() => {
        setActiveTab(newTab);
      });
    },
    [activeTab, hasUnsavedManualOrder]
  );

  const handleSaveAndSwitch = useCallback(() => {
    saveUnsavedManualOrder();
    const target = pendingTab!;
    setPendingTab(null);
    startTabTransition(() => {
      setActiveTab(target);
    });
  }, [saveUnsavedManualOrder, pendingTab]);

  const handleDiscardAndSwitch = useCallback(() => {
    discardUnsavedManualOrder();
    const target = pendingTab!;
    setPendingTab(null);
    startTabTransition(() => {
      setActiveTab(target);
    });
  }, [discardUnsavedManualOrder, pendingTab]);

  const handleCancelSwitch = useCallback(() => {
    setPendingTab(null);
  }, []);

  // Escape/Enter shortcuts for the unsaved-order dialog
  useEffect(() => {
    if (!pendingTab) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancelSwitch();
      if (e.key === "Enter") handleSaveAndSwitch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingTab, handleCancelSwitch, handleSaveAndSwitch]);

  // Register the guarded tab setter so the onboarding tour (and other consumers)
  // can programmatically switch tabs via AppContext.
  useEffect(() => {
    registerTabSetter(handleTabChange);
    return () => registerTabSetter(null);
  }, [registerTabSetter, handleTabChange]);

  // Auto-open onboarding tour on first run (once data is loaded)
  useEffect(() => {
    if (loading) return;
    if (settings.onboardingCompleted) return;
    if (apartments.length === 0) return;
    if (onboarding.isOpen) return;
    onboarding.open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, apartments.length, settings.onboardingCompleted]);

  // Apply dark mode class to <html> based on setting + OS preference
  useEffect(() => {
    const root = document.documentElement;
    const apply = (isDark: boolean) => {
      root.classList.toggle("dark", isDark);
    };

    if (settings.theme === "dark") {
      apply(true);
      return;
    }
    if (settings.theme === "light") {
      apply(false);
      return;
    }
    // system — match OS preference
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.theme]);

  // Global keyboard shortcuts: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (isInput) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "Z"))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-400 text-lg">{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <Header />

      <Tabs.Root value={activeTab} onValueChange={handleTabChange} className="flex-1 min-h-0 flex flex-col">
        <Tabs.List className="flex-shrink-0 flex flex-wrap items-center border-b border-gray-200 bg-white px-4 sm:px-6">
          <div className="flex">
            {(["scoring", "results", "history", "compare", "combine"] as const).map((tab) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                data-tour-id={
                  tab === "compare"
                    ? "compare-tab"
                    : tab === "combine"
                      ? "combine-tab"
                      : undefined
                }
                className="px-4 py-2.5 text-sm font-medium text-gray-500
                           border-b-2 border-transparent
                           data-[state=active]:text-blue-600
                           data-[state=active]:border-blue-600
                           hover:text-gray-700 transition-colors"
              >
                {t(`tabs.${tab}`)}
              </Tabs.Trigger>
            ))}
          </div>

          {/* Undo / Redo + Profile selector */}
          <div className="flex items-center gap-3 ms-auto">
            <div className="flex items-center gap-1">
              <button
                onClick={undo}
                disabled={!canUndo}
                title={`${t("common.undo")} (Ctrl+Z)`}
                aria-label={`${t("common.undo")} (Ctrl+Z)`}
                className={`p-1.5 rounded-md transition-colors ${
                  canUndo
                    ? "text-gray-600 hover:bg-gray-100 hover:text-gray-800"
                    : "text-gray-300 cursor-default"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                title={`${t("common.redo")} (Ctrl+Y)`}
                aria-label={`${t("common.redo")} (Ctrl+Y)`}
                className={`p-1.5 rounded-md transition-colors ${
                  canRedo
                    ? "text-gray-600 hover:bg-gray-100 hover:text-gray-800"
                    : "text-gray-300 cursor-default"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M12.207 2.232a.75.75 0 0 0 .025 1.06l4.146 3.958H6.375a5.375 5.375 0 0 0 0 10.75H9.25a.75.75 0 0 0 0-1.5H6.375a3.875 3.875 0 0 1 0-7.75h10.003l-4.146 3.957a.75.75 0 0 0 1.036 1.085l5.5-5.25a.75.75 0 0 0 0-1.085l-5.5-5.25a.75.75 0 0 0-1.06.025Z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <ProfileSelector />
          </div>
        </Tabs.List>

        <Tabs.Content value="scoring" className="flex-1 overflow-y-auto">
          <ScoringPanel />
        </Tabs.Content>

        <Tabs.Content value="results" className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Suspense fallback={<TabLoadingFallback />}>
            <ResultsTable />
          </Suspense>
        </Tabs.Content>

        <Tabs.Content value="history" className="flex-1 overflow-y-auto">
          <Suspense fallback={<TabLoadingFallback />}>
            <ChangeHistory />
          </Suspense>
        </Tabs.Content>

        <Tabs.Content value="combine" className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Suspense fallback={<TabLoadingFallback />}>
            <CombineView />
          </Suspense>
        </Tabs.Content>

        <Tabs.Content value="compare" className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Suspense fallback={<TabLoadingFallback />}>
            <CompareView />
          </Suspense>
        </Tabs.Content>
      </Tabs.Root>

      {/* Unsaved manual order confirmation dialog */}
      {pendingTab && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={handleCancelSwitch}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {t("results.unsavedOrderTitle")}
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {t("results.unsavedOrderMessage")}
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={handleCancelSwitch}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800
                           border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDiscardAndSwitch}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-md
                           hover:bg-red-700 transition-colors"
              >
                {t("results.discardOrder")}
              </button>
              <button
                onClick={handleSaveAndSwitch}
                autoFocus
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md
                           hover:bg-blue-700 transition-colors"
              >
                {t("results.saveToProfile")}
              </button>
            </div>
          </div>
        </div>
      )}

      <OnboardingTour />
    </div>
  );
}

export default function App() {
  const { i18n } = useTranslation();
  const dir = i18n.language === "he" ? "rtl" : "ltr";
  return (
    <DirectionProvider dir={dir}>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </DirectionProvider>
  );
}
