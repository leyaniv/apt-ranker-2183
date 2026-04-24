import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { ConfirmDialog, AlertDialog } from "../Layout/ConfirmDialog";

interface Props {
  onClose: () => void;
  onCreateProfile: () => void;
}

export function EditProfilesModal({ onClose, onCreateProfile }: Props) {
  const { t } = useTranslation();
  const {
    profiles,
    activeProfile,
    removeProfile,
    renameProfile,
    reorderProfiles,
    exportProfile,
    exportAllProfiles,
    importProfile,
    selectProfile,
    duplicateProfile,
  } = useApp();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingId) {
          setEditingId(null);
        } else {
          onClose();
        }
      }
    },
    [editingId, onClose]
  );

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      renameProfile(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      commitRename();
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      setEditingId(null);
    }
  };

  const handleDuplicate = (profile: { id: string; name: string }) => {
    const newName = `${profile.name} (${t("profile.copy")})`;
    duplicateProfile(profile.id, newName);
  };

  const handleDelete = (id: string, name: string) => {
    setPendingDelete({ id, name });
  };

  const performDelete = () => {
    if (!pendingDelete) return;
    removeProfile(pendingDelete.id);
    setPendingDelete(null);
    // If we deleted the active profile, the hook auto-switches to another one.
    // Removing the last profile is allowed; the UI handles the empty state.
  };

  const moveProfile = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= profiles.length) return;
    const ids = profiles.map((p) => p.id);
    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
    reorderProfiles(ids);
  };

  const handleExport = (profile: { id: string; name: string; createdAt: number; updatedAt: number; scores: Record<string, Record<string, number>>; weights: Record<string, number>; manualOrder?: string[] }) => {
    exportProfile(profile);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importProfile(reader.result as string);
      if (result.ok) {
        setAlertMessage(t("profile.importSuccess"));
      } else {
        setAlertMessage(t(`profile.importError_${result.reason}`));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("profile.editProfiles")}
        </h2>

        {/* Profile list */}
        {profiles.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            {t("profile.noProfiles")}
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 max-h-[50vh] overflow-y-auto">
            {profiles.map((profile, index) => (
              <li
                key={profile.id}
                className={`flex items-center gap-2 py-2 px-1 ${
                  profile.id === activeProfile?.id
                    ? "bg-blue-50 rounded"
                    : ""
                }`}
              >
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveProfile(index, -1)}
                    disabled={index === 0}
                    className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default leading-none px-0.5"
                    title={t("profile.moveUp")}
                    aria-label={t("profile.moveUp")}
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveProfile(index, 1)}
                    disabled={index === profiles.length - 1}
                    className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default leading-none px-0.5"
                    title={t("profile.moveDown")}
                    aria-label={t("profile.moveDown")}
                  >
                    ▼
                  </button>
                </div>

                {/* Profile name (inline editable) */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => {
                    if (editingId !== profile.id) {
                      selectProfile(profile.id);
                    }
                  }}
                >
                  {editingId === profile.id ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={handleRenameKeyDown}
                      className="w-full text-sm rounded-md border border-gray-300 px-2 py-0.5
                                 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  ) : (
                    <span
                      className="block text-sm text-gray-800 truncate"
                      onDoubleClick={() => startRename(profile.id, profile.name)}
                      title={profile.name}
                    >
                      {profile.name}
                      {profile.id === activeProfile?.id && (
                        <span className="ms-1 text-xs text-blue-500">●</span>
                      )}
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startRename(profile.id, profile.name)}
                    className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-blue-600
                               border border-gray-200 rounded hover:bg-blue-50
                               transition-colors"
                    title={t("profile.rename")}
                    aria-label={t("profile.rename")}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDuplicate(profile)}
                    className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-purple-600
                               border border-gray-200 rounded hover:bg-purple-50
                               transition-colors"
                    title={t("profile.duplicate")}
                    aria-label={t("profile.duplicate")}
                  >
                    📋
                  </button>
                  <button
                    onClick={() => handleExport(profile)}
                    className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-green-600
                               border border-gray-200 rounded hover:bg-green-50
                               transition-colors"
                    title={t("profile.export")}
                    aria-label={t("profile.export")}
                  >
                    📤
                  </button>
                  <button
                    onClick={() => handleDelete(profile.id, profile.name)}
                    className="px-1.5 py-0.5 text-xs text-red-400 hover:text-red-600
                               border border-gray-200 rounded hover:bg-red-50
                               transition-colors"
                    title={t("profile.delete")}
                    aria-label={t("profile.delete")}
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCreateProfile}
            className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800
                       border border-blue-200 rounded-md hover:bg-blue-50
                       transition-colors me-auto"
          >
            + {t("profile.create")}
          </button>
          <button
            onClick={() => exportAllProfiles()}
            disabled={profiles.length === 0}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800
                       border border-gray-300 rounded-md hover:bg-gray-50
                       transition-colors disabled:opacity-50"
          >
            📤 {t("profile.exportAll")}
          </button>
          <button
            onClick={handleImportClick}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800
                       border border-gray-300 rounded-md hover:bg-gray-50
                       transition-colors"
          >
            📥 {t("profile.import")}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800
                       border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            {t("common.close")}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={t("profile.delete")}
          message={t("profile.confirmDelete", { name: pendingDelete.name })}
          confirmLabel={t("profile.delete")}
          danger
          onConfirm={performDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {alertMessage && (
        <AlertDialog
          message={alertMessage}
          onClose={() => setAlertMessage(null)}
        />
      )}
    </div>
  );
}
