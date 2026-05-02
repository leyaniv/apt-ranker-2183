/**
 * User-applied "sold" marks, persisted across all profiles.
 *
 * The contractor site updates with a delay, so users can manually mark
 * apartments they know to be sold. These marks are stored under a single
 * top-level localStorage key (independent of profiles) so the same set of
 * sold apartments applies everywhere in the UI.
 */

import { useState, useCallback } from "react";

const STORAGE_KEY = "eshel-user-sold-marks";

/** Map of property_slug → true for apartments the user has marked as sold. */
export type UserSoldMarks = Record<string, true>;

function load(): UserSoldMarks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      // Coerce any truthy values to `true` and drop falsy ones.
      const out: UserSoldMarks = {};
      for (const [slug, v] of Object.entries(parsed)) {
        if (v) out[slug] = true;
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

function save(marks: UserSoldMarks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Storage may be full/unavailable; silently ignore.
  }
}

export function useUserSoldMarks() {
  const [userSoldMarks, setMarks] = useState<UserSoldMarks>(load);

  const toggleUserSoldMark = useCallback((slug: string) => {
    setMarks((prev) => {
      const next = { ...prev };
      if (next[slug]) delete next[slug];
      else next[slug] = true;
      save(next);
      return next;
    });
  }, []);

  return { userSoldMarks, toggleUserSoldMark };
}
