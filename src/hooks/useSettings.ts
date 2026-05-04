/**
 * Global app settings stored in localStorage (cross-profile).
 */

import { useState, useCallback } from "react";

const STORAGE_KEY = "eshel-settings";

export interface AppSettings {
  /** Max apartments to display in results (raffle position). null = show all */
  maxResults: number | null;
  /** Theme preference: system (OS), light, or dark */
  theme: "system" | "light" | "dark";
  /** Show developer/debug tools */
  developerTools: boolean;
  /** Whether the first-run onboarding tour has been completed/skipped */
  onboardingCompleted: boolean;
  /** Scoring input style — buttons (integer 1–5) or slider (continuous) */
  scoringInputStyle: "buttons" | "slider";
  /** Show sold (נמכר) apartments in results and compare views (default: true) */
  showSold: boolean;
  /**
   * Show apartments the user has manually excluded in the active profile.
   * Defaults to `false` — excluded apartments are hidden from results until
   * the user opts in via the toggle.
   */
  showExcluded: boolean;
  /**
   * Active rendering mode for the Results tab.
   *  - "list":      virtualized ranked list (default)
   *  - "buildings": floor / direction grid grouped by building
   * Persisted across reloads.
   */
  resultsViewMode: "list" | "buildings";
}

const DEFAULTS: AppSettings = {
  maxResults: null, // show all
  theme: "system",
  developerTools: false,
  onboardingCompleted: false,
  scoringInputStyle: "buttons",
  showSold: true,
  showExcluded: false,
  resultsViewMode: "list",
};

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(load);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
