import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as Slider from "@radix-ui/react-slider";
import { useApp } from "../../context/AppContext";
import { CombinedRanking } from "./CombinedRanking";
import { InfoTooltip } from "../Layout/InfoTooltip";
import { computeCombinedRanking } from "../../utils/scoring";
import { mergeProfiles } from "../../utils/profileMerge";

const MAX_SELECTED = 3;

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
      else if (s.size < MAX_SELECTED) s.add(id);
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
  const unselectedProfiles = profiles.filter((p) => !selectedIds.has(p.id));

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
    <div className="flex flex-col flex-1 min-h-0 max-w-5xl mx-auto w-full">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col pb-20 sm:pb-0">
      <div className="flex-shrink-0 p-4 sm:p-6 pb-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold text-gray-700 truncate">
              <span className="sm:hidden">{t("combine.titleShort")}</span>
              <span className="hidden sm:inline">{t("combine.title")}</span>
            </h2>
            <InfoTooltip text={t("combine.howToUse")} />
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={clearSelection}
              className="shrink-0 px-3 py-1 text-xs rounded-md border border-gray-200
                         text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
            >
              {t("compare.clearCombine")}
            </button>
          )}
        </div>

        {/* Unified profile selection + importance weights */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            {t("combine.profilesToCombine")}
          </p>
          <div className="flex flex-col gap-2">
            {/* Selected profiles — expanded rows with inline slider */}
            {selectedProfiles.map((p) => {
              const w = weightsMap[p.id];
              const totalWeight = Object.values(weightsMap).reduce(
                (s, v) => s + v,
                0
              );
              const pct =
                totalWeight > 0 ? Math.round((w / totalWeight) * 100) : 0;
              const showWeight = selectedProfiles.length >= 2;
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1
                             bg-blue-50/60 border border-blue-200 rounded-md px-3 py-2"
                >
                  <span className="text-sm font-medium text-blue-800 truncate min-w-0 flex-1 sm:flex-initial sm:min-w-[80px]">
                    {p.name}
                  </span>
                  {showWeight && (
                    <>
                      <Slider.Root
                        className="relative flex items-center select-none touch-none
                                   flex-1 sm:flex-initial sm:w-[160px] h-5 min-w-[120px]"
                        value={[w]}
                        min={1}
                        max={5}
                        step={1}
                        onValueChange={(vs) => setProfileWeight(p.id, vs[0])}
                        aria-label={`${p.name} ${t("combine.importanceLabel")}`}
                        dir="ltr"
                      >
                        <Slider.Track className="bg-blue-200 relative grow rounded-full h-1.5">
                          <Slider.Range className="absolute rounded-full h-full bg-blue-500" />
                        </Slider.Track>
                        <Slider.Thumb
                          className="block w-5 h-5 bg-white border-2 border-blue-500 rounded-full shadow
                                     focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </Slider.Root>
                      <span
                        className="text-xs text-gray-600 tabular-nums whitespace-nowrap"
                        title={t("combine.importanceLabel")}
                      >
                        <span className="font-medium">{w}</span>
                        <span className="text-gray-400"> · {pct}%</span>
                      </span>
                    </>
                  )}
                  <button
                    onClick={() => toggleProfile(p.id)}
                    aria-label={`${t("combine.removeProfile")}: ${p.name}`}
                    className="shrink-0 w-6 h-6 flex items-center justify-center rounded
                               text-blue-400 hover:bg-blue-100 hover:text-blue-700
                               transition-colors text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              );
            })}

            {/* Unselected profiles — compact "+ Name" chips */}
            {unselectedProfiles.length > 0 &&
              selectedIds.size < MAX_SELECTED && (
                <div className="flex flex-wrap gap-2">
                  {unselectedProfiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => toggleProfile(p.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md
                                 border border-dashed border-gray-300 text-sm
                                 text-gray-600 bg-white
                                 hover:bg-gray-50 hover:border-gray-400 hover:text-gray-800
                                 transition-colors"
                    >
                      <span className="text-gray-400">+</span>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>

      {selectedProfiles.length >= 2 && (
        <div className="flex-1 min-h-[280px] flex flex-col px-4 sm:px-6 pt-1">
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

      {selectedProfiles.length < 2 && (
        <p className="text-sm text-gray-400 text-center px-4 sm:px-6 pt-6">
          {t("combine.profilesToCombineHint")}
        </p>
      )}
      </div>

      {/* Merge-to-profile controls — fixed at bottom on mobile, in-flow on desktop */}
      {selectedProfiles.length >= 2 && (
        <div
          className="fixed bottom-0 inset-x-0 z-30
                     sm:static sm:inset-auto
                     flex-shrink-0 flex flex-wrap items-center gap-3
                     px-4 sm:px-6 pt-3 pb-4 sm:pb-6 bg-gray-50
                     border-t border-gray-100 sm:border-t-0"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={openMergeModal}
            title={t("combine.createMergedProfileTip")}
            className="shrink-0 px-4 py-2 sm:px-3 sm:py-1.5 text-sm rounded-md bg-blue-600 text-white
                       hover:bg-blue-700 transition-colors font-medium"
          >
            <span className="sm:hidden">
              {t("combine.createMergedProfileShort")}
            </span>
            <span className="hidden sm:inline">
              {t("combine.createMergedProfile")}
            </span>
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
