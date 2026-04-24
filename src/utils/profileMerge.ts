/**
 * Merge several profiles into a single profile's scoring data.
 *
 * Strategy (matches the design decisions for the Combine tab):
 * - Parameter value scores and importance weights are merged via weighted
 *   average, where each source profile contributes according to its
 *   profile-importance weight (1–5, default 3) as set in the Combine tab.
 * - Only parameters/values that at least one source profile has touched
 *   are included — the merged profile stays as clean as possible.
 * - Per-apartment notes are concatenated across sources, each line prefixed
 *   with the source profile's name.
 * - An optional manualOrder (e.g. the combined ranking) can be attached
 *   so the merged profile faithfully reproduces the ranking the user saw.
 *
 * Note: averaged scores are continuous (e.g. 3.4). The scoring engine uses
 * them correctly, but the Scoring-tab UI compares with `===` against 1–5
 * and will not highlight any button for fractional values. Clicking a button
 * overrides the value with an integer.
 */

import type {
  ImportanceWeights,
  Profile,
  ValueScores,
} from "../types";

export interface MergedProfileData {
  scores: ValueScores;
  weights: ImportanceWeights;
  notes?: Record<string, string>;
  manualOrder?: string[];
}

export interface MergeProfilesOptions {
  /** Per-source-profile importance (1–5). Missing entries default to 3. */
  profileWeights?: Record<string, number>;
  /** If provided, becomes the merged profile's manualOrder. */
  manualOrder?: string[];
}

const DEFAULT_PROFILE_WEIGHT = 3;

export function mergeProfiles(
  sources: Profile[],
  options: MergeProfilesOptions = {}
): MergedProfileData {
  const { profileWeights, manualOrder } = options;
  const mergedScores: ValueScores = {};
  const mergedWeights: ImportanceWeights = {};

  const weightOf = (p: Profile) =>
    profileWeights?.[p.id] ?? DEFAULT_PROFILE_WEIGHT;

  // Collect every parameter id any source profile has data for
  const paramIds = new Set<string>();
  for (const p of sources) {
    for (const k of Object.keys(p.scores)) paramIds.add(k);
    for (const k of Object.keys(p.weights)) paramIds.add(k);
  }

  for (const pid of paramIds) {
    // Importance weight: weighted-average across profiles that set it
    let wSum = 0;
    let wTot = 0;
    for (const p of sources) {
      const w = p.weights[pid];
      if (w === undefined) continue;
      const pw = weightOf(p);
      wSum += w * pw;
      wTot += pw;
    }
    if (wTot > 0) {
      mergedWeights[pid] = wSum / wTot;
    }

    // Value scores: union of scored value keys, weighted-average per key
    const valueKeys = new Set<string>();
    for (const p of sources) {
      const ps = p.scores[pid];
      if (ps) for (const v of Object.keys(ps)) valueKeys.add(v);
    }
    for (const v of valueKeys) {
      let sSum = 0;
      let sTot = 0;
      for (const p of sources) {
        const s = p.scores[pid]?.[v];
        if (s === undefined) continue;
        const pw = weightOf(p);
        sSum += s * pw;
        sTot += pw;
      }
      if (sTot > 0) {
        if (!mergedScores[pid]) mergedScores[pid] = {};
        mergedScores[pid][v] = sSum / sTot;
      }
    }
  }

  // Notes: concatenate across sources, prefixed with source profile name
  const notes: Record<string, string> = {};
  const slugs = new Set<string>();
  for (const p of sources) {
    if (p.notes) for (const s of Object.keys(p.notes)) slugs.add(s);
  }
  for (const slug of slugs) {
    const parts: string[] = [];
    for (const p of sources) {
      const note = p.notes?.[slug];
      if (note && note.trim()) parts.push(`${p.name}: ${note.trim()}`);
    }
    if (parts.length > 0) notes[slug] = parts.join("\n\n");
  }

  const result: MergedProfileData = {
    scores: mergedScores,
    weights: mergedWeights,
  };
  if (Object.keys(notes).length > 0) result.notes = notes;
  if (manualOrder && manualOrder.length > 0) result.manualOrder = manualOrder;
  return result;
}
