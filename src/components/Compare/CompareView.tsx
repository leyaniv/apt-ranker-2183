import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { SideBySideRanking } from "./SideBySideRanking";
import { TabHeader } from "../Layout/TabHeader";

const COMPARE_STORAGE_KEY = "eshel-compare-state";

interface CompareState {
  selectedIds: string[];
  selectedSlug: string | null;
  selectedProfileId: string | null;
}

function loadCompareState(): CompareState {
  try {
    const raw = sessionStorage.getItem(COMPARE_STORAGE_KEY);
    if (!raw) return { selectedIds: [], selectedSlug: null, selectedProfileId: null };
    return JSON.parse(raw);
  } catch {
    return { selectedIds: [], selectedSlug: null, selectedProfileId: null };
  }
}

function saveCompareState(state: CompareState) {
  sessionStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Compare view: select multiple profiles and see side-by-side rankings.
 */
export function CompareView() {
  const { t } = useTranslation();
  const { profiles, apartments, buckets } = useApp();

  const [state, setState] = useState<CompareState>(loadCompareState);

  // Persist on every change
  useEffect(() => {
    saveCompareState(state);
  }, [state]);

  // Remove deleted profiles from selection
  useEffect(() => {
    const profileIds = new Set(profiles.map((p) => p.id));
    const filtered = state.selectedIds.filter((id) => profileIds.has(id));
    if (filtered.length !== state.selectedIds.length) {
      setState((prev) => ({ ...prev, selectedIds: filtered }));
    }
  }, [profiles]);

  const selectedIds = new Set(state.selectedIds);

  const toggleProfile = (id: string) => {
    setState((prev) => {
      const s = new Set(prev.selectedIds);
      if (s.has(id)) s.delete(id);
      else if (s.size < 3) s.add(id);
      return { ...prev, selectedIds: [...s] };
    });
  };

  const setSelectedSlug = useCallback((slug: string | null) => {
    setState((prev) => ({ ...prev, selectedSlug: slug }));
  }, []);

  const setSelectedProfileId = useCallback((profileId: string | null) => {
    setState((prev) => ({ ...prev, selectedProfileId: profileId }));
  }, []);

  const clearCompare = () => {
    setState({ selectedIds: [], selectedSlug: null, selectedProfileId: null });
  };

  const selectedProfiles = profiles.filter((p) => selectedIds.has(p.id));

  if (profiles.length < 2) {
    return (
      <div className="p-6 text-center text-gray-500">
        {t("compare.noProfiles")}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto w-full h-full flex flex-col gap-4 min-h-0">
      <TabHeader title={t("compare.title")} tooltip={t("compare.howToUse")} />
      {/* Profile checkboxes */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            {t("compare.selectProfiles")}
          </p>
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <label
                key={p.id}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md
                           border text-sm cursor-pointer transition-colors
                           ${
                             selectedIds.has(p.id)
                               ? "bg-blue-50 border-blue-300 text-blue-700"
                               : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                           }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleProfile(p.id)}
                  className="rounded"
                />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={clearCompare}
            className="shrink-0 px-3 py-1.5 text-xs rounded-md border border-gray-200
                       text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            {t("compare.clear")}
          </button>
        )}
      </div>

      {selectedProfiles.length >= 2 && (
        <div className="flex-1 min-h-0">
          <SideBySideRanking
            profiles={selectedProfiles}
            apartments={apartments}
            buckets={buckets}
            selectedSlug={state.selectedSlug}
            selectedProfileId={state.selectedProfileId}
            onSelectedSlugChange={setSelectedSlug}
            onSelectedProfileIdChange={setSelectedProfileId}
          />
        </div>
      )}

      {selectedProfiles.length === 1 && (
        <p className="text-sm text-gray-400 text-center">
          {t("compare.selectProfiles")}
        </p>
      )}
    </div>
  );
}
