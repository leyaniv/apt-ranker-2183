import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { CombinedRanking } from "./CombinedRanking";
import { TabHeader } from "../Layout/TabHeader";
import { computeCombinedRanking } from "../../utils/scoring";
import { mergeProfiles } from "../../utils/profileMerge";

const STORAGE_KEY = "eshel-combine-state";

interface CombineState {
  selectedIds: string[];
  /** Profile importance weights: profileId → 1–5. Missing = 3 */
  profileWeights: Record<string, number>;
  /** Whether creating a merged profile should lock the combined ranking as manual order */
  lockOrder: boolean;
}

function loadState(): CombineState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { selectedIds: [], profileWeights: {}, lockOrder: false };
    return { profileWeights: {}, lockOrder: false, ...JSON.parse(raw) };
  } catch {
    return { selectedIds: [], profileWeights: {}, lockOrder: false };
  }
}

function saveState(state: CombineState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const WEIGHT_LABELS = [1, 2, 3, 4, 5];

export function CombineView() {
  const { t } = useTranslation();
  const { profiles, apartments, buckets, addProfile, saveProfile, requestTabChange } = useApp();

  const [state, setState] = useState<CombineState>(loadState);

  useEffect(() => {
    saveState(state);
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

  const setProfileWeight = (profileId: string, weight: number) => {
    setState((prev) => ({
      ...prev,
      profileWeights: { ...prev.profileWeights, [profileId]: weight },
    }));
  };

  const clearSelection = () => {
    setState({ selectedIds: [], profileWeights: {}, lockOrder: false });
  };

  const selectedProfiles = profiles.filter((p) => selectedIds.has(p.id));

  // Build weights map for selected profiles (default 3)
  const weightsMap: Record<string, number> = {};
  for (const p of selectedProfiles) {
    weightsMap[p.id] = state.profileWeights[p.id] ?? 3;
  }

  // Combined ranking (used for the optional manual-order snapshot on merge)
  const combinedOrder = useMemo(() => {
    if (selectedProfiles.length < 2) return [];
    return computeCombinedRanking(
      selectedProfiles,
      apartments,
      buckets,
      weightsMap
    ).map((c) => c.apartment.property_slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfiles, apartments, buckets, state.profileWeights]);

  const toggleLockOrder = () => {
    setState((prev) => ({ ...prev, lockOrder: !prev.lockOrder }));
  };

  // Merge-name modal state
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeName, setMergeName] = useState("");
  const mergeInputRef = useRef<HTMLInputElement>(null);

  const defaultMergedName = () =>
    t("combine.mergedNamePrefix") +
    selectedProfiles.map((p) => p.name).join(t("combine.mergedNameJoiner"));

  const openMergeModal = () => {
    if (selectedProfiles.length < 2) return;
    setMergeName(defaultMergedName());
    setMergeModalOpen(true);
  };

  useEffect(() => {
    if (mergeModalOpen) {
      // Focus + select the default name for quick overwrite
      setTimeout(() => {
        mergeInputRef.current?.focus();
        mergeInputRef.current?.select();
      }, 0);
    }
  }, [mergeModalOpen]);

  const confirmCreateMergedProfile = () => {
    const name = mergeName.trim();
    if (!name || selectedProfiles.length < 2) return;

    const merged = mergeProfiles(selectedProfiles, {
      profileWeights: weightsMap,
      manualOrder: state.lockOrder ? combinedOrder : undefined,
    });

    // addProfile creates a blank profile and makes it active; then we
    // overwrite its scoring data with the merged result.
    const created = addProfile(name);
    saveProfile({
      ...created,
      scores: merged.scores,
      weights: merged.weights,
      ...(merged.notes ? { notes: merged.notes } : {}),
      ...(merged.manualOrder ? { manualOrder: merged.manualOrder } : {}),
    });

    setMergeModalOpen(false);
    // Jump to the Results tab so the user sees the ranking immediately
    requestTabChange("results");
  };

  const handleMergeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setMergeModalOpen(false);
    if (e.key === "Enter") confirmCreateMergedProfile();
  };

  if (profiles.length < 2) {
    return (
      <div className="p-6 text-center text-gray-500">
        {t("compare.noProfiles")}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 max-w-5xl mx-auto w-full">
      <div className="flex-shrink-0 p-4 sm:p-6 pb-0 space-y-4">
        <TabHeader title={t("combine.title")} tooltip={t("combine.howToUse")} />
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
            onClick={clearSelection}
            className="shrink-0 px-3 py-1.5 text-xs rounded-md border border-gray-200
                       text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            {t("compare.clearCombine")}
          </button>
        )}
      </div>

      {/* Profile importance weights */}
      {selectedProfiles.length >= 2 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            {t("combine.profileImportance")}
          </p>
          <div className="flex flex-wrap gap-4">
            {selectedProfiles.map((p) => {
              const w = weightsMap[p.id];
              const totalWeight = Object.values(weightsMap).reduce((s, v) => s + v, 0);
              const pct = totalWeight > 0 ? Math.round((w / totalWeight) * 100) : 0;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2"
                >
                  <span className="text-sm font-medium text-gray-700 min-w-[60px]">
                    {p.name}
                  </span>
                  <div className="flex gap-1">
                    {WEIGHT_LABELS.map((v) => (
                      <button
                        key={v}
                        onClick={() => setProfileWeight(p.id, v)}
                        aria-label={`${p.name} ${t("combine.profileImportance")} ${v}`}
                        className={`w-7 h-7 rounded text-xs font-medium border transition-colors
                          ${
                            w === v
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                          }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400 min-w-[32px] text-end">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      </div>

      {selectedProfiles.length >= 2 && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 sm:px-6 pt-0">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            {t("combine.previewTitle")}
          </h3>
          <CombinedRanking
            profiles={selectedProfiles}
            apartments={apartments}
            buckets={buckets}
            profileWeights={weightsMap}
          />
        </div>
      )}

      {/* Merge-to-profile controls — bottom of page */}
      {selectedProfiles.length >= 2 && (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-4 sm:px-6 pt-3 pb-4 sm:pb-6">
          <button
            onClick={openMergeModal}
            title={t("combine.createMergedProfileTip")}
            className="shrink-0 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white
                       hover:bg-blue-700 transition-colors font-medium"
          >
            {t("combine.createMergedProfile")}
          </button>
          <label
            className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer"
            title={t("combine.lockRankingTip")}
          >
            <input
              type="checkbox"
              checked={state.lockOrder}
              onChange={toggleLockOrder}
              className="rounded"
            />
            {t("combine.lockRanking")}
          </label>
        </div>
      )}

      {selectedProfiles.length === 1 && (
        <p className="text-sm text-gray-400 text-center px-4 sm:px-6 pt-4">
          {t("compare.selectProfiles")}
        </p>
      )}

      {/* Merge name modal */}
      {mergeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setMergeModalOpen(false)}
          onKeyDown={handleMergeKeyDown}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t("combine.createMergedProfile")}
            </h2>

            <div className="space-y-2">
              <label
                htmlFor="mergeName"
                className="block text-sm font-medium text-gray-700"
              >
                {t("profile.namePrompt")}
              </label>
              <input
                ref={mergeInputRef}
                id="mergeName"
                type="text"
                value={mergeName}
                onChange={(e) => setMergeName(e.target.value)}
                onKeyDown={handleMergeKeyDown}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                           focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setMergeModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800
                           border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmCreateMergedProfile}
                disabled={!mergeName.trim()}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md
                           hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {t("combine.createMergedProfile")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
