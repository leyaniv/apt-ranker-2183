import { createContext, useContext, useMemo, useCallback, useRef, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type {
  Apartment,
  BucketMap,
  ParameterConfig,
  Profile,
  ValueScores,
  ImportanceWeights,
  ChangeHistoryEntry,
  UndoAction,
} from "../types";
import { useApartments } from "../hooks/useApartments";
import { useProfiles } from "../hooks/useProfiles";
import type { ImportResult } from "../utils/storage";
import { rankApartments } from "../utils/scoring";
import { useSettings, type AppSettings } from "../hooks/useSettings";
import { useUserSoldMarks, type UserSoldMarks } from "../hooks/useUserSoldMarks";
import { useChangeHistory } from "../hooks/useChangeHistory";
import { track } from "../utils/analytics";
import type { RankedApartment } from "../types";

interface AppContextValue {
  // Data
  apartments: Apartment[];
  /** Open-market ("שיווק חופשי") apartments. Excluded from ranking and
   *  every view except the Buildings view. */
  freeMarketingApartments: Apartment[];
  buckets: BucketMap;
  parameterConfigs: ParameterConfig[];
  loading: boolean;
  error: string | null;

  // Profiles
  profiles: Profile[];
  activeProfile: Profile | null;
  selectProfile: (id: string) => void;
  addProfile: (name: string) => Profile;
  duplicateProfile: (sourceId: string, newName: string) => Profile | null;
  removeProfile: (id: string) => void;
  renameProfile: (id: string, name: string) => void;
  reorderProfiles: (orderedIds: string[]) => void;
  saveProfile: (profile: Profile) => void;
  exportProfile: (profile: Profile) => void;
  exportAllProfiles: () => void;
  importProfile: (json: string) => ImportResult;

  // Notes per apartment (property_slug → text)
  notes: Record<string, string>;
  setNote: (slug: string, text: string) => void;

  /**
   * Per-apartment manual scoring nudge (property_slug → integer in [-10, 10]).
   * Stored on the active profile. Slugs at 0 are not stored.
   */
  manualAdjustments: Record<string, number>;
  setManualAdjustment: (slug: string, value: number) => void;

  // Scoring — read/write scores and weights for active profile
  scores: ValueScores;
  weights: ImportanceWeights;
  setScore: (paramId: string, valueKey: string, score: number) => void;
  setWeight: (paramId: string, weight: number) => void;
  resetScores: (paramId?: string) => void;
  randomizeScores: () => void;
  /** Round every score and weight in the active profile to the nearest integer */
  roundScores: () => void;

  // Undo / Redo
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Record the manual-order change to change history (call on save/reset) */
  commitManualOrderToHistory: (order: string[] | undefined) => void;
  /** Called by ResultsTable to register its setManualOrder callback */
  registerManualOrderSetter: (fn: ((order: string[] | null) => void) | null) => void;

  /** Whether the results tab has unsaved manual order changes */
  hasUnsavedManualOrder: boolean;
  setHasUnsavedManualOrder: (v: boolean) => void;
  /** Register save/discard callbacks from ResultsTable */
  registerManualOrderActions: (actions: { save: () => void; discard: () => void } | null) => void;
  /** Save the unsaved manual order to the current profile */
  saveUnsavedManualOrder: () => void;
  /** Discard the unsaved manual order */
  discardUnsavedManualOrder: () => void;

  // Ranked results
  rankedApartments: RankedApartment[];

  // Change History
  changeHistory: ChangeHistoryEntry[];
  restoreToHistoryEntry: (entryId: string) => void;

  // Settings (cross-profile)
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;

  // User-applied sold marks (cross-profile)
  userSoldMarks: UserSoldMarks;
  toggleUserSoldMark: (slug: string) => void;

  /**
   * Set of property_slugs the user has marked as excluded *in the active
   * profile*. Excluded apartments are still ranked; the results tab hides
   * them by default (controlled by `settings.showExcluded`) and badges
   * them when shown. Per-profile (lives on `Profile.excludedSlugs`).
   */
  userExcludedSet: Set<string>;
  toggleUserExcluded: (slug: string) => void;
  /**
   * Effective scoring input style for the active profile.
   * Equals `settings.scoringInputStyle`, except that profiles containing any
   * fractional score/weight are forced to `"slider"` so values display
   * faithfully (e.g. merged profiles).
   */
  resolvedScoringInputStyle: "buttons" | "slider";

  // Tab navigation (controlled by App.tsx; exposed for programmatic switching)
  /** App.tsx registers its guarded tab setter here */
  registerTabSetter: (fn: ((tab: string) => void) | null) => void;
  /** Programmatically switch tabs (respects App's unsaved-order guard) */
  requestTabChange: (tab: string) => void;

  // First-run onboarding tour
  onboarding: {
    isOpen: boolean;
    stepIndex: number;
    open: () => void;
    close: () => void;
    next: () => void;
    prev: () => void;
    goTo: (index: number) => void;
  };
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { apartments: rawApartments, freeMarketingApartments, buckets, parameterConfigs, loading, error } =
    useApartments();
  const {
    profiles,
    activeProfile,
    selectProfile,
    addProfile,
    duplicateProfile,
    removeProfile,
    rename,
    reorderProfiles,
    saveProfile,
    doExport,
    doExportAll,
    doImport,
  } = useProfiles();

  const { settings, updateSettings } = useSettings();
  const { userSoldMarks, toggleUserSoldMark } = useUserSoldMarks();
  const changeHistoryHook = useChangeHistory();

  /**
   * Apartments enriched with user-applied sold marks. Marks live in their own
   * cross-profile localStorage key (see `useUserSoldMarks`); we merge them in
   * here so all downstream consumers (ranking, results table, compare views)
   * see a single, coherent `isSold` regardless of how the apartment was marked.
   */
  const apartments = useMemo<Apartment[]>(() => {
    if (rawApartments.length === 0) return rawApartments;
    return rawApartments.map((apt) => {
      const userMarkedSold = !!userSoldMarks[apt.property_slug];
      return {
        ...apt,
        userMarkedSold,
        isSold: apt.isSold || userMarkedSold,
      };
    });
  }, [rawApartments, userSoldMarks]);

  // Sync change history when active profile changes
  useEffect(() => {
    if (activeProfile) {
      changeHistoryHook.loadProfile(activeProfile.id, {
        scores: activeProfile.scores,
        weights: activeProfile.weights,
        manualOrder: activeProfile.manualOrder,
      });
    }
  }, [activeProfile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref for the manual order setter (registered by ResultsTable)
  const manualOrderSetterRef = useRef<((order: string[] | null) => void) | null>(null);

  // Unsaved manual order tracking
  const [hasUnsavedManualOrder, setHasUnsavedManualOrder] = useState(false);
  const manualOrderActionsRef = useRef<{ save: () => void; discard: () => void } | null>(null);

  const registerManualOrderActions = useCallback(
    (actions: { save: () => void; discard: () => void } | null) => {
      manualOrderActionsRef.current = actions;
    },
    []
  );

  const saveUnsavedManualOrder = useCallback(() => {
    manualOrderActionsRef.current?.save();
  }, []);

  const discardUnsavedManualOrder = useCallback(() => {
    manualOrderActionsRef.current?.discard();
  }, []);

  const registerManualOrderSetter = useCallback(
    (fn: ((order: string[] | null) => void) | null) => {
      manualOrderSetterRef.current = fn;
    },
    []
  );

  // Tab setter registration (App.tsx wires up its guarded setter)
  const tabSetterRef = useRef<((tab: string) => void) | null>(null);
  const registerTabSetter = useCallback(
    (fn: ((tab: string) => void) | null) => {
      tabSetterRef.current = fn;
    },
    []
  );
  const requestTabChange = useCallback((tab: string) => {
    tabSetterRef.current?.(tab);
  }, []);

  // Onboarding state
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const openOnboarding = useCallback(() => {
    track("onboarding_started");
    setOnboardingStep(0);
    setOnboardingOpen(true);
  }, []);
  const closeOnboarding = useCallback(() => {
    setOnboardingOpen(false);
    updateSettings({ onboardingCompleted: true });
  }, [updateSettings]);
  const nextOnboarding = useCallback(() => {
    setOnboardingStep((s) => s + 1);
  }, []);
  const prevOnboarding = useCallback(() => {
    setOnboardingStep((s) => Math.max(0, s - 1));
  }, []);
  const goToOnboarding = useCallback((index: number) => {
    setOnboardingStep(Math.max(0, index));
  }, []);

  // Debounce ref for weight changes
  const weightDebounceRef = useRef<{
    paramId: string;
    profileId: string;
    originalWeight: number | undefined;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Debounce ref for score changes (slider drags)
  const scoreDebounceRef = useRef<{
    paramId: string;
    valueKey: string;
    profileId: string;
    originalScore: number | undefined;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const scores = activeProfile?.scores ?? {};
  const weights = activeProfile?.weights ?? {};
  const notes = activeProfile?.notes ?? {};
  const manualAdjustments = activeProfile?.manualAdjustments ?? {};

  const setNote = useCallback(
    (slug: string, text: string) => {
      if (!activeProfile) return;
      const newNotes = { ...activeProfile.notes };
      if (text.trim()) {
        newNotes[slug] = text;
      } else {
        delete newNotes[slug];
      }
      saveProfile({ ...activeProfile, notes: newNotes });
    },
    [activeProfile, saveProfile]
  );

  const setManualAdjustment = useCallback(
    (slug: string, value: number) => {
      if (!activeProfile) return;
      // Clamp to the supported slider range and round to integer; the engine
      // does the same defensively, but clean storage keeps profiles tidy.
      const clamped = Math.max(-10, Math.min(10, Math.round(value)));
      const next: Record<string, number> = { ...(activeProfile.manualAdjustments ?? {}) };
      if (clamped === 0) {
        delete next[slug];
      } else {
        next[slug] = clamped;
      }
      const updated: Profile = { ...activeProfile };
      if (Object.keys(next).length > 0) updated.manualAdjustments = next;
      else delete updated.manualAdjustments;
      saveProfile(updated);
    },
    [activeProfile, saveProfile]
  );

  const setScore = useCallback(
    (paramId: string, valueKey: string, score: number) => {
      if (!activeProfile) return;
      const prevScore = activeProfile.scores[paramId]?.[valueKey];
      const updated: Profile = {
        ...activeProfile,
        scores: {
          ...activeProfile.scores,
          [paramId]: {
            ...(activeProfile.scores[paramId] ?? {}),
            [valueKey]: score,
          },
        },
      };
      saveProfile(updated);

      // Debounce: continuous drags (slider) collapse into one history entry
      const pending = scoreDebounceRef.current;
      const sameTarget =
        pending &&
        pending.paramId === paramId &&
        pending.valueKey === valueKey &&
        pending.profileId === activeProfile.id;
      if (sameTarget) {
        clearTimeout(pending.timer);
        const originalScore = pending.originalScore;
        pending.timer = setTimeout(() => {
          scoreDebounceRef.current = null;
        }, 400);
        const replaceAction: UndoAction = {
          type: "set-score",
          profileId: activeProfile.id,
          prev: { paramId, valueKey, score: originalScore },
          next: { paramId, valueKey, score },
        };
        changeHistoryHook.replaceLast(replaceAction, parameterConfigs, {
          scores: updated.scores,
          weights: updated.weights,
          manualOrder: updated.manualOrder,
        });
      } else {
        if (pending) clearTimeout(pending.timer);
        const timer = setTimeout(() => {
          scoreDebounceRef.current = null;
        }, 400);
        scoreDebounceRef.current = {
          paramId,
          valueKey,
          profileId: activeProfile.id,
          originalScore: prevScore,
          timer,
        };
        const action: UndoAction = {
          type: "set-score",
          profileId: activeProfile.id,
          prev: { paramId, valueKey, score: prevScore },
          next: { paramId, valueKey, score },
        };
        changeHistoryHook.push(action, parameterConfigs, {
          scores: updated.scores,
          weights: updated.weights,
          manualOrder: updated.manualOrder,
        });
      }
    },
    [activeProfile, saveProfile, changeHistoryHook, parameterConfigs]
  );

  const setWeight = useCallback(
    (paramId: string, weight: number) => {
      if (!activeProfile) return;
      const updated: Profile = {
        ...activeProfile,
        weights: {
          ...activeProfile.weights,
          [paramId]: weight,
        },
      };
      saveProfile(updated);

      // Debounce: if the same param is being adjusted, update the last action
      const pending = weightDebounceRef.current;
      if (pending && pending.paramId === paramId && pending.profileId === activeProfile.id) {
        clearTimeout(pending.timer);
        const originalWeight = pending.originalWeight;
        pending.timer = setTimeout(() => {
          weightDebounceRef.current = null;
        }, 400);
        const replaceAction: UndoAction = {
          type: "set-weight",
          profileId: activeProfile.id,
          prev: { paramId, weight: originalWeight },
          next: { paramId, weight },
        };
        changeHistoryHook.replaceLast(replaceAction, parameterConfigs, {
          scores: updated.scores,
          weights: updated.weights,
          manualOrder: updated.manualOrder,
        });
      } else {
        // New weight drag — capture original value
        if (pending) clearTimeout(pending.timer);
        const originalWeight = activeProfile.weights[paramId];
        const timer = setTimeout(() => {
          weightDebounceRef.current = null;
        }, 400);
        weightDebounceRef.current = {
          paramId,
          profileId: activeProfile.id,
          originalWeight,
          timer,
        };
        const pushAction: UndoAction = {
          type: "set-weight",
          profileId: activeProfile.id,
          prev: { paramId, weight: originalWeight },
          next: { paramId, weight },
        };
        changeHistoryHook.push(pushAction, parameterConfigs, {
          scores: updated.scores,
          weights: updated.weights,
          manualOrder: updated.manualOrder,
        });
      }
    },
    [activeProfile, saveProfile, changeHistoryHook, parameterConfigs]
  );

  const resetScores = useCallback(
    (paramId?: string) => {
      if (!activeProfile) return;
      const action: UndoAction = {
        type: "reset-scores",
        profileId: activeProfile.id,
        prev: {
          paramId,
          scores: { ...activeProfile.scores },
          weights: { ...activeProfile.weights },
        },
        next: { paramId },
      };

      const resetSnapshot = paramId
        ? (() => {
            const newScores = { ...activeProfile.scores };
            delete newScores[paramId];
            const newWeights = { ...activeProfile.weights };
            delete newWeights[paramId];
            return { scores: newScores, weights: newWeights, manualOrder: activeProfile.manualOrder };
          })()
        : { scores: {} as ValueScores, weights: {} as ImportanceWeights, manualOrder: activeProfile.manualOrder };
      changeHistoryHook.push(action, parameterConfigs, resetSnapshot);

      if (paramId) {
        const newScores = { ...activeProfile.scores };
        delete newScores[paramId];
        const newWeights = { ...activeProfile.weights };
        delete newWeights[paramId];
        saveProfile({ ...activeProfile, scores: newScores, weights: newWeights });
      } else {
        saveProfile({ ...activeProfile, scores: {}, weights: {} });
      }
    },
    [activeProfile, saveProfile, changeHistoryHook, parameterConfigs]
  );

  const randomizeScores = useCallback(() => {
    if (!activeProfile) return;
    const randScore = () => Math.floor(Math.random() * 5) + 1;
    const newScores: ValueScores = {};
    const newWeights: ImportanceWeights = {};
    for (const config of parameterConfigs) {
      for (const val of config.values) {
        if (!newScores[config.id]) newScores[config.id] = {};
        newScores[config.id][val] = randScore();
      }
      newWeights[config.id] = randScore();
    }
    const updated: Profile = { ...activeProfile, scores: newScores, weights: newWeights };
    saveProfile(updated);
    const action: UndoAction = {
      type: "randomize-scores",
      profileId: activeProfile.id,
      prev: { scores: { ...activeProfile.scores }, weights: { ...activeProfile.weights } },
      next: { scores: newScores, weights: newWeights },
    };
    changeHistoryHook.push(action, parameterConfigs, {
      scores: newScores,
      weights: newWeights,
      manualOrder: activeProfile.manualOrder,
    });
  }, [activeProfile, parameterConfigs, saveProfile, changeHistoryHook]);

  const roundScores = useCallback(() => {
    if (!activeProfile) return;
    const newScores: ValueScores = {};
    for (const [pid, paramScores] of Object.entries(activeProfile.scores)) {
      const rounded: Record<string, number> = {};
      for (const [v, s] of Object.entries(paramScores)) {
        rounded[v] = Math.round(s);
      }
      newScores[pid] = rounded;
    }
    const newWeights: ImportanceWeights = {};
    for (const [pid, w] of Object.entries(activeProfile.weights)) {
      newWeights[pid] = Math.round(w);
    }
    const updated: Profile = { ...activeProfile, scores: newScores, weights: newWeights };
    saveProfile(updated);
    const action: UndoAction = {
      type: "round-scores",
      profileId: activeProfile.id,
      prev: { scores: { ...activeProfile.scores }, weights: { ...activeProfile.weights } },
      next: { scores: newScores, weights: newWeights },
    };
    changeHistoryHook.push(action, parameterConfigs, {
      scores: newScores,
      weights: newWeights,
      manualOrder: activeProfile.manualOrder,
    });
  }, [activeProfile, parameterConfigs, saveProfile, changeHistoryHook]);

  const commitManualOrderToHistory = useCallback(
    (order: string[] | undefined) => {
      if (!activeProfile) return;
      const action: UndoAction = {
        type: order ? "set-manual-order" : "reset-manual-order",
        profileId: activeProfile.id,
        prev: activeProfile.manualOrder ?? null,
        next: order ?? null,
      };
      changeHistoryHook.push(action, parameterConfigs, {
        scores: activeProfile.scores,
        weights: activeProfile.weights,
        manualOrder: order,
      });
    },
    [activeProfile, changeHistoryHook, parameterConfigs]
  );

  /** Apply a snapshot from the history system to the active profile */
  const applySnapshot = useCallback(
    (snapshot: { scores: ValueScores; weights: ImportanceWeights; manualOrder?: string[] }) => {
      if (!activeProfile) return;
      saveProfile({
        ...activeProfile,
        scores: snapshot.scores,
        weights: snapshot.weights,
        manualOrder: snapshot.manualOrder,
      });
      manualOrderSetterRef.current?.(snapshot.manualOrder ?? null);
    },
    [activeProfile, saveProfile]
  );

  const undo = useCallback(() => {
    const snapshot = changeHistoryHook.undo();
    if (snapshot) applySnapshot(snapshot);
  }, [changeHistoryHook, applySnapshot]);

  const redo = useCallback(() => {
    const snapshot = changeHistoryHook.redo();
    if (snapshot) applySnapshot(snapshot);
  }, [changeHistoryHook, applySnapshot]);

  const restoreToHistoryEntry = useCallback(
    (entryId: string) => {
      const snapshot = changeHistoryHook.restoreTo(entryId);
      if (snapshot) applySnapshot(snapshot);
    },
    [changeHistoryHook, applySnapshot]
  );

  const rankedApartments = useMemo(() => {
    if (apartments.length === 0) return [];
    // Include scoring-excluded apts in the result (tagged with
    // `excluded: true`) so the Results table can choose to surface them
    // when "Show excluded" is on, alongside manually-excluded apts.
    return rankApartments(apartments, scores, weights, buckets, true, true, manualAdjustments);
  }, [apartments, scores, weights, buckets, manualAdjustments]);

  /** Active profile's excluded slugs as a Set for O(1) membership tests. */
  const userExcludedSet = useMemo(
    () => new Set(activeProfile?.excludedSlugs ?? []),
    [activeProfile?.excludedSlugs]
  );

  const toggleUserExcluded = useCallback(
    (slug: string) => {
      if (!activeProfile) return;
      const current = activeProfile.excludedSlugs ?? [];
      const has = current.includes(slug);
      const nextList = has
        ? current.filter((s) => s !== slug)
        : [...current, slug];
      // Drop the field entirely when empty so unaffected profiles stay clean
      // and exports don't carry an empty list.
      const next: Profile = { ...activeProfile };
      if (nextList.length > 0) next.excludedSlugs = nextList;
      else delete next.excludedSlugs;
      saveProfile(next);
    },
    [activeProfile, saveProfile]
  );

  /**
   * Scoring input style resolution:
   * - If the active profile contains any fractional score or weight,
   *   we force the slider so values render faithfully. Otherwise we
   *   defer to the user's setting.
   */
  const resolvedScoringInputStyle: "buttons" | "slider" = useMemo(() => {
    if (settings.scoringInputStyle === "slider") return "slider";
    if (!activeProfile) return "buttons";
    const hasFractional = (n: number | undefined) =>
      n !== undefined && !Number.isInteger(n);
    for (const paramScores of Object.values(activeProfile.scores)) {
      for (const s of Object.values(paramScores)) {
        if (hasFractional(s)) return "slider";
      }
    }
    for (const w of Object.values(activeProfile.weights)) {
      if (hasFractional(w)) return "slider";
    }
    return "buttons";
  }, [settings.scoringInputStyle, activeProfile]);

  const value: AppContextValue = {
    apartments,
    freeMarketingApartments,
    buckets,
    parameterConfigs,
    loading,
    error,
    profiles,
    activeProfile,
    selectProfile,
    addProfile,
    duplicateProfile,
    removeProfile,
    renameProfile: rename,
    reorderProfiles,
    saveProfile,
    exportProfile: doExport,
    exportAllProfiles: doExportAll,
    importProfile: doImport,
    notes,
    setNote,
    manualAdjustments,
    setManualAdjustment,
    scores,
    weights,
    setScore,
    setWeight,
    resetScores,
    randomizeScores,
    roundScores,
    canUndo: changeHistoryHook.canUndo,
    canRedo: changeHistoryHook.canRedo,
    undo,
    redo,
    commitManualOrderToHistory,
    registerManualOrderSetter,
    hasUnsavedManualOrder,
    setHasUnsavedManualOrder,
    registerManualOrderActions,
    saveUnsavedManualOrder,
    discardUnsavedManualOrder,
    rankedApartments,
    changeHistory: changeHistoryHook.entries,
    restoreToHistoryEntry,
    settings,
    updateSettings,
    userSoldMarks,
    toggleUserSoldMark,
    userExcludedSet,
    toggleUserExcluded,
    resolvedScoringInputStyle,
    registerTabSetter,
    requestTabChange,
    onboarding: {
      isOpen: onboardingOpen,
      stepIndex: onboardingStep,
      open: openOnboarding,
      close: closeOnboarding,
      next: nextOnboarding,
      prev: prevOnboarding,
      goTo: goToOnboarding,
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
