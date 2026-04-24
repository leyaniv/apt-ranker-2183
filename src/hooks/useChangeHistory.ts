import { useState, useCallback, useRef } from "react";
import type { ChangeHistoryEntry, ValueScores, ImportanceWeights, ParameterConfig, UndoAction } from "../types";
import i18n from "../i18n";

const STORAGE_PREFIX = "eshel-change-history-";
const MAX_ENTRIES = 50;

/* ─── Persistence ─────────────────────────────── */

function loadEntries(profileId: string): ChangeHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + profileId);
    if (!raw) return [];
    return JSON.parse(raw) as ChangeHistoryEntry[];
  } catch {
    return [];
  }
}

function persistEntries(profileId: string, entries: ChangeHistoryEntry[]): void {
  localStorage.setItem(STORAGE_PREFIX + profileId, JSON.stringify(entries));
}

/* ─── Human-readable descriptions ─────────────── */

function getParamLabel(
  paramId: string,
  configs: ParameterConfig[]
): { en: string; he: string } {
  const cfg = configs.find((c) => c.id === paramId);
  return cfg?.label ?? { en: paramId, he: paramId };
}

function getValueLabel(
  paramId: string,
  valueKey: string,
  configs: ParameterConfig[]
): { en: string; he: string } {
  const cfg = configs.find((c) => c.id === paramId);
  const vl = cfg?.valueLabels[valueKey];
  return vl ?? { en: valueKey, he: valueKey };
}

function buildDescriptionForLang(
  lng: "en" | "he",
  action: UndoAction,
  configs: ParameterConfig[]
): string {
  const t = (key: string, params?: Record<string, unknown>) =>
    i18n.t(key, { lng, ...params });

  switch (action.type) {
    case "set-score": {
      const { paramId, valueKey, score } = action.next as {
        paramId: string;
        valueKey: string;
        score: number;
      };
      const prevScore = (action.prev as { score?: number }).score;
      const param = getParamLabel(paramId, configs)[lng];
      const value = getValueLabel(paramId, valueKey, configs)[lng];
      const from = prevScore !== undefined ? String(prevScore) : t("changeHistory.unset");
      return t("changeHistory.scoreChanged", { param, value, from, to: score });
    }
    case "set-weight": {
      const { paramId, weight } = action.next as {
        paramId: string;
        weight: number;
      };
      const prevWeight = (action.prev as { weight?: number }).weight;
      const param = getParamLabel(paramId, configs)[lng];
      const from = prevWeight !== undefined ? String(prevWeight) : t("changeHistory.unset");
      return t("changeHistory.weightChanged", { param, from, to: weight });
    }
    case "reset-scores": {
      const { paramId } = action.next as { paramId?: string };
      if (paramId) {
        const param = getParamLabel(paramId, configs)[lng];
        return t("changeHistory.paramReset", { param });
      }
      return t("changeHistory.allReset");
    }
    case "randomize-scores": {
      return t("changeHistory.allRandomized");
    }
    case "round-scores": {
      return t("changeHistory.allRounded");
    }
    case "set-manual-order": {
      return t("changeHistory.manualOrderChanged");
    }
    case "reset-manual-order": {
      return t("changeHistory.manualOrderReset");
    }
    default:
      return t("changeHistory.unknownChange");
  }
}

export function buildDescription(
  action: UndoAction,
  configs: ParameterConfig[]
): { en: string; he: string } {
  return {
    en: buildDescriptionForLang("en", action, configs),
    he: buildDescriptionForLang("he", action, configs),
  };
}

/* ─── Snapshot type ───────────────────────────── */

export interface HistorySnapshot {
  scores: ValueScores;
  weights: ImportanceWeights;
  manualOrder?: string[];
}

/* ─── Unified Hook ────────────────────────────── */

export interface UseChangeHistoryResult {
  entries: ChangeHistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;
  push: (
    action: UndoAction,
    configs: ParameterConfig[],
    currentSnapshot: HistorySnapshot
  ) => void;
  /** Replace the last entry (for debounced weight coalescing) */
  replaceLast: (
    action: UndoAction,
    configs: ParameterConfig[],
    currentSnapshot: HistorySnapshot
  ) => void;
  /** Undo the last action — returns snapshot to restore, or null */
  undo: () => HistorySnapshot | null;
  /** Redo the last undone action — returns snapshot to restore, or null */
  redo: () => HistorySnapshot | null;
  /** Restore to a specific history entry — returns snapshot, or null */
  restoreTo: (entryId: string) => HistorySnapshot | null;
  /** Load history for a profile (call on profile switch) */
  loadProfile: (profileId: string, baseline: HistorySnapshot) => void;
}

export function useChangeHistory(): UseChangeHistoryResult {
  // State drives renders; ref mirrors it for synchronous reads in undo/redo
  const [entries, setEntries] = useState<ChangeHistoryEntry[]>([]);
  const entriesRef = useRef<ChangeHistoryEntry[]>([]);

  const profileIdRef = useRef<string | null>(null);
  const redoBufferRef = useRef<ChangeHistoryEntry[]>([]);
  /** Profile state before any history entries (for undoing the first entry) */
  const baselineRef = useRef<HistorySnapshot | null>(null);

  // Bumped on every mutation to trigger re-renders for canUndo/canRedo
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  /** Update both ref and state, and persist to localStorage */
  const commitEntries = useCallback((next: ChangeHistoryEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
    if (profileIdRef.current) {
      persistEntries(profileIdRef.current, next);
    }
  }, []);

  const loadProfile = useCallback(
    (profileId: string, baseline: HistorySnapshot) => {
      const loaded = loadEntries(profileId);
      profileIdRef.current = profileId;
      entriesRef.current = loaded;
      setEntries(loaded);
      redoBufferRef.current = [];
      baselineRef.current = baseline;
      bump();
    },
    []
  );

  const push = useCallback(
    (
      action: UndoAction,
      configs: ParameterConfig[],
      currentSnapshot: HistorySnapshot
    ) => {
      const entry: ChangeHistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: action.type,
        profileId: action.profileId,
        description: buildDescription(action, configs),
        snapshot: currentSnapshot,
      };
      redoBufferRef.current = [];
      const next = [...entriesRef.current, entry];
      if (next.length > MAX_ENTRIES) {
        next.shift();
      }
      commitEntries(next);
      bump();
    },
    [commitEntries]
  );

  const replaceLast = useCallback(
    (
      action: UndoAction,
      configs: ParameterConfig[],
      currentSnapshot: HistorySnapshot
    ) => {
      const current = entriesRef.current;
      if (current.length === 0) {
        push(action, configs, currentSnapshot);
        return;
      }
      const next = [...current];
      next[next.length - 1] = {
        ...next[next.length - 1],
        timestamp: Date.now(),
        description: buildDescription(action, configs),
        snapshot: currentSnapshot,
      };
      commitEntries(next);
      bump();
    },
    [commitEntries, push]
  );

  const undo = useCallback((): HistorySnapshot | null => {
    const current = entriesRef.current;
    if (current.length === 0) return null;

    const removed = current[current.length - 1];
    redoBufferRef.current.push(removed);
    const next = current.slice(0, -1);
    commitEntries(next);
    bump();

    // Return the snapshot to restore to
    if (next.length > 0) {
      return next[next.length - 1].snapshot;
    }
    return baselineRef.current;
  }, [commitEntries]);

  const redo = useCallback((): HistorySnapshot | null => {
    const entry = redoBufferRef.current.pop();
    if (!entry) return null;

    const next = [...entriesRef.current, entry];
    commitEntries(next);
    bump();
    return entry.snapshot;
  }, [commitEntries]);

  const restoreTo = useCallback(
    (entryId: string): HistorySnapshot | null => {
      const current = entriesRef.current;
      const idx = current.findIndex((e) => e.id === entryId);
      if (idx === -1) return null;

      const entry = current[idx];
      const next = current.slice(0, idx + 1);
      redoBufferRef.current = [];
      commitEntries(next);
      bump();
      return entry.snapshot;
    },
    [commitEntries]
  );

  return {
    entries,
    canUndo: entriesRef.current.length > 0,
    canRedo: redoBufferRef.current.length > 0,
    push,
    replaceLast,
    undo,
    redo,
    restoreTo,
    loadProfile,
  };
}
