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
}

const DEFAULTS: AppSettings = {
  maxResults: null, // show all
  theme: "system",
  developerTools: false,
  onboardingCompleted: false,
  scoringInputStyle: "buttons",
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
