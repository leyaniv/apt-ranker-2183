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
   * Layout mode for the Buildings tab.
   *  - "wide" (default): per-lot 3-column layout — big building on the left,
   *    smaller buildings distributed across two narrower columns.
   *  - "narrow": one long top-to-bottom list of buildings (the original
   *    layout). Forced on small viewports regardless of this setting.
   */
  buildingsViewMode: "wide" | "narrow";
  /**
   * When `true` (default), each scored cell in the results table is rendered
   * as a colored chip whose hue reflects the user's value score for that
   * apartment-parameter pair. When `false` the table falls back to plain
   * text — useful for printing-style readability or when the user just
   * wants a calmer view.
   */
  colorByValueScore: boolean;
}

const DEFAULTS: AppSettings = {
  maxResults: null, // show all
  theme: "system",
  developerTools: false,
  onboardingCompleted: false,
  scoringInputStyle: "buttons",
  showSold: true,
  showExcluded: false,
  buildingsViewMode: "wide",
  colorByValueScore: true,
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
