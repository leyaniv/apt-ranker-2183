/**
 * LocalStorage persistence for profiles.
 *
 * All data is stored under the key "eshel-profiles" as a JSON array.
 * Individual profiles are identified by UUID.
 */

import type { Profile, ValueScores, ImportanceWeights } from "../types";

const STORAGE_KEY = "eshel-profiles";
const ACTIVE_PROFILE_KEY = "eshel-active-profile";

/* ─── Profile CRUD ────────────────────────────── */

/** Load all profiles from LocalStorage */
export function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Profile[];
  } catch {
    return [];
  }
}

/** Save all profiles to LocalStorage */
export function saveProfiles(profiles: Profile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

/** Get a single profile by ID */
export function getProfile(id: string): Profile | undefined {
  return loadProfiles().find((p) => p.id === id);
}

/** Create a new profile with default scores/weights */
export function createProfile(name: string): Profile {
  const profile: Profile = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    scores: {},
    weights: {},
  };
  const profiles = loadProfiles();
  profiles.push(profile);
  saveProfiles(profiles);
  return profile;
}

/** Duplicate an existing profile with a new name */
export function duplicateProfile(sourceId: string, newName: string): Profile | null {
  const profiles = loadProfiles();
  const source = profiles.find((p) => p.id === sourceId);
  if (!source) return null;
  const clone: Profile = {
    id: crypto.randomUUID(),
    name: newName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    scores: structuredClone(source.scores),
    weights: { ...source.weights },
    ...(source.manualOrder ? { manualOrder: [...source.manualOrder] } : {}),
    ...(source.notes ? { notes: { ...source.notes } } : {}),
  };
  profiles.push(clone);
  saveProfiles(profiles);
  return clone;
}

/** Update an existing profile */
export function updateProfile(updated: Profile): void {
  const profiles = loadProfiles();
  const idx = profiles.findIndex((p) => p.id === updated.id);
  if (idx >= 0) {
    profiles[idx] = { ...updated, updatedAt: Date.now() };
    saveProfiles(profiles);
  }
}

/** Delete a profile by ID */
export function deleteProfile(id: string): void {
  const profiles = loadProfiles().filter((p) => p.id !== id);
  saveProfiles(profiles);
}

/** Rename a profile */
export function renameProfile(id: string, newName: string): void {
  const profiles = loadProfiles();
  const profile = profiles.find((p) => p.id === id);
  if (profile) {
    profile.name = newName;
    profile.updatedAt = Date.now();
    saveProfiles(profiles);
  }
}

/* ─── Active profile ──────────────────────────── */

export function getActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

export function setActiveProfileId(id: string): void {
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
}

/* ─── Reorder ─────────────────────────────────── */

/** Reorder profiles by providing the full ordered array of IDs */
export function reorderProfiles(orderedIds: string[]): void {
  const profiles = loadProfiles();
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const reordered = orderedIds
    .map((id) => byId.get(id))
    .filter((p): p is Profile => p !== undefined);
  saveProfiles(reordered);
}

/* ─── Export / Import ─────────────────────────── */

/**
 * Schema version for exported profile files.
 *
 * Bump this whenever the Profile shape (or any nested structure such as
 * ParameterId values, scores layout, weights, etc.) changes in a way that
 * older importers cannot handle. When bumping, add a migration step in
 * `migrateProfileEnvelope` so files exported by previous versions can still
 * be read.
 */
export const PROFILE_SCHEMA_VERSION = 1;

/** Discriminator for the kind of payload contained in an export file */
type EnvelopeKind = "profile" | "profiles";

interface ProfileEnvelope {
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  kind: "profile";
  profile: Profile;
}

interface ProfilesEnvelope {
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  kind: "profiles";
  profiles: Profile[];
}

/** Reason an import failed — surfaced to the UI for a clearer message */
export type ImportFailureReason =
  | "legacy" // unversioned / pre-v1 file
  | "newer" // exported by a newer schema we don't understand
  | "wrong-kind" // tried to import an export-all file as a single profile
  | "invalid"; // malformed JSON or failed validation

export type ImportResult =
  | { ok: true; profile: Profile }
  | { ok: false; reason: ImportFailureReason };

function buildEnvelope(profile: Profile): ProfileEnvelope;
function buildEnvelope(profiles: Profile[]): ProfilesEnvelope;
function buildEnvelope(payload: Profile | Profile[]): ProfileEnvelope | ProfilesEnvelope {
  const base = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown",
    exportedAt: Date.now(),
  };
  return Array.isArray(payload)
    ? { ...base, kind: "profiles", profiles: payload }
    : { ...base, kind: "profile", profile: payload };
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export a profile as a downloadable JSON file (versioned envelope) */
export function exportProfile(profile: Profile): void {
  const envelope = buildEnvelope(profile);
  downloadJson(envelope, `eshel-profile-${profile.name.replace(/\s+/g, "-")}.json`);
}

/** Export all profiles as a single downloadable JSON file (versioned envelope) */
export function exportAllProfiles(): void {
  const envelope = buildEnvelope(loadProfiles());
  downloadJson(envelope, "eshel-profiles-all.json");
}

/** Validate the inner Profile payload structure */
function isValidProfilePayload(parsed: unknown): parsed is Profile {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (typeof p.name !== "string") return false;
  if (!p.scores || typeof p.scores !== "object") return false;
  if (!p.weights || typeof p.weights !== "object") return false;

  for (const paramScores of Object.values(p.scores as ValueScores)) {
    if (!paramScores || typeof paramScores !== "object") return false;
    for (const score of Object.values(paramScores)) {
      if (typeof score !== "number" || score < 1 || score > 5) return false;
    }
  }
  for (const weight of Object.values(p.weights as ImportanceWeights)) {
    if (typeof weight !== "number" || weight < 1 || weight > 5) return false;
  }
  return true;
}

/**
 * Run any schema migrations on the envelope's inner payload.
 *
 * Currently a no-op since we are at v1. When introducing v2, add a branch
 * here that transforms the v1 payload into the v2 shape before validation.
 */
function migrateProfileEnvelope<T extends ProfileEnvelope | ProfilesEnvelope>(envelope: T): T {
  return envelope;
}

function materializeImportedProfile(source: Profile): Profile {
  return {
    id: crypto.randomUUID(),
    name: source.name + " (imported)",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    scores: source.scores,
    weights: source.weights,
    ...(Array.isArray(source.manualOrder) ? { manualOrder: source.manualOrder } : {}),
    ...(source.notes && typeof source.notes === "object" ? { notes: source.notes } : {}),
  };
}

/**
 * Import a profile from a JSON file.
 *
 * Only versioned envelopes (schemaVersion >= 1) are accepted. Files exported
 * before envelope versioning was introduced are rejected with reason "legacy".
 */
export function importProfileFromJson(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "invalid" };
  }

  const env = parsed as {
    schemaVersion?: unknown;
    kind?: unknown;
    profile?: unknown;
    profiles?: unknown;
  };

  if (typeof env.schemaVersion !== "number") {
    return { ok: false, reason: "legacy" };
  }
  if (env.schemaVersion > PROFILE_SCHEMA_VERSION) {
    return { ok: false, reason: "newer" };
  }

  const kind = env.kind as EnvelopeKind | undefined;
  if (kind !== "profile" && kind !== "profiles") {
    return { ok: false, reason: "invalid" };
  }
  if (kind === "profiles") {
    return { ok: false, reason: "wrong-kind" };
  }

  const migrated = migrateProfileEnvelope(parsed as ProfileEnvelope);
  if (!isValidProfilePayload(migrated.profile)) {
    return { ok: false, reason: "invalid" };
  }

  const profile = materializeImportedProfile(migrated.profile);
  const profiles = loadProfiles();
  profiles.push(profile);
  saveProfiles(profiles);
  return { ok: true, profile };
}
