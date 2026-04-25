import { useState, useEffect, useCallback } from "react";
import type { Profile } from "../types";
import {
  loadProfiles,
  createProfile,
  updateProfile,
  deleteProfile as deleteProfileFromStorage,
  renameProfile as renameProfileInStorage,
  reorderProfiles as reorderProfilesInStorage,
  duplicateProfile as duplicateProfileInStorage,
  getActiveProfileId,
  setActiveProfileId,
  exportProfile,
  exportAllProfiles,
  importProfileFromJson,
  type ImportResult,
} from "../utils/storage";
import { track } from "../utils/analytics";

interface UseProfilesResult {
  profiles: Profile[];
  activeProfile: Profile | null;
  selectProfile: (id: string) => void;
  addProfile: (name: string) => Profile;
  duplicateProfile: (sourceId: string, newName: string) => Profile | null;
  removeProfile: (id: string) => void;
  rename: (id: string, name: string) => void;
  reorderProfiles: (orderedIds: string[]) => void;
  saveProfile: (profile: Profile) => void;
  doExport: (profile: Profile) => void;
  doExportAll: () => void;
  doImport: (json: string) => ImportResult;
}

/**
 * Manages the list of user profiles and the currently active one.
 * Syncs with LocalStorage on every mutation.
 */
export function useProfiles(): UseProfilesResult {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    const loaded = loadProfiles();
    setProfiles(loaded);

    const savedActiveId = getActiveProfileId();
    if (savedActiveId && loaded.some((p) => p.id === savedActiveId)) {
      setActiveId(savedActiveId);
    } else if (loaded.length > 0) {
      setActiveId(loaded[0].id);
      setActiveProfileId(loaded[0].id);
    }
  }, []);

  const activeProfile = profiles.find((p) => p.id === activeId) ?? null;

  const selectProfile = useCallback((id: string) => {
    track("profile_switched");
    setActiveId(id);
    setActiveProfileId(id);
  }, []);

  const addProfile = useCallback((name: string): Profile => {
    const profile = createProfile(name);
    track("profile_created");
    setProfiles(loadProfiles());
    setActiveId(profile.id);
    setActiveProfileId(profile.id);
    return profile;
  }, []);

  const doDuplicate = useCallback((sourceId: string, newName: string): Profile | null => {
    const cloned = duplicateProfileInStorage(sourceId, newName);
    if (cloned) {
      track("profile_duplicated");
      setProfiles(loadProfiles());
      setActiveId(cloned.id);
      setActiveProfileId(cloned.id);
    }
    return cloned;
  }, []);

  const removeProfile = useCallback(
    (id: string) => {
      track("profile_deleted");
      deleteProfileFromStorage(id);
      const remaining = loadProfiles();
      setProfiles(remaining);
      if (activeId === id) {
        const nextId = remaining.length > 0 ? remaining[0].id : null;
        setActiveId(nextId);
        if (nextId) setActiveProfileId(nextId);
      }
    },
    [activeId]
  );

  const rename = useCallback((id: string, name: string) => {
    renameProfileInStorage(id, name);
    setProfiles(loadProfiles());
  }, []);

  const reorderProfiles = useCallback((orderedIds: string[]) => {
    reorderProfilesInStorage(orderedIds);
    setProfiles(loadProfiles());
  }, []);

  const saveProfile = useCallback((profile: Profile) => {
    updateProfile(profile);
    setProfiles(loadProfiles());
  }, []);

  const doExport = useCallback((profile: Profile) => {
    track("profile_exported", { scope: "single" });
    exportProfile(profile);
  }, []);

  const doExportAll = useCallback(() => {
    track("profile_exported", { scope: "all" });
    exportAllProfiles();
  }, []);

  const doImport = useCallback((json: string): ImportResult => {
    const result = importProfileFromJson(json);
    track("profile_import_attempted", { ok: result.ok, reason: result.ok ? undefined : result.reason });
    if (result.ok) {
      setProfiles(loadProfiles());
      setActiveId(result.profile.id);
      setActiveProfileId(result.profile.id);
    }
    return result;
  }, []);

  return {
    profiles,
    activeProfile,
    selectProfile,
    addProfile,
    duplicateProfile: doDuplicate,
    removeProfile,
    rename,
    reorderProfiles,
    saveProfile,
    doExport,
    doExportAll,
    doImport,
  };
}
