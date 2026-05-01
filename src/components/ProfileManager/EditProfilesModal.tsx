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
        className="bg-white rounded-lg shadow-xl w-full max-w-md sm:max-w-2xl mx-4 p-6"
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
                className={`relative flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 py-2 px-1 rounded ${
                  profile.id === activeProfile?.id
                    ? "bg-blue-50 ps-3"
                    : ""
                }`}
              >
                {profile.id === activeProfile?.id && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 bottom-1 start-0 w-1 rounded-full bg-blue-500"
                  />
                )}
                <div className="flex items-center gap-2 sm:flex-1 sm:min-w-0">
                  {/* Reorder buttons — stacked on desktop only */}
                  <div className="hidden sm:flex flex-col gap-0.5">
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

                  {/* Mobile-only move-up button (sits inline with the name) */}
                  <button
                    onClick={() => moveProfile(index, -1)}
                    disabled={index === 0}
                    className="sm:hidden shrink-0 inline-flex items-center justify-center w-7 h-7 text-base text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-default border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                    title={t("profile.moveUp")}
                    aria-label={t("profile.moveUp")}
                  >
                    ▲
                  </button>

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
                        className={`block text-sm truncate ${
                          profile.id === activeProfile?.id
                            ? "font-semibold text-blue-700"
                            : "text-gray-800"
                        }`}
                        onDoubleClick={() => startRename(profile.id, profile.name)}
                        title={profile.name}
                      >
                        {profile.name}
                      </span>
                    )}
                  </div>

                  {/* Mobile-only inline rename button (desktop has it in the action row) */}
                  <button
                    onClick={() => startRename(profile.id, profile.name)}
                    className="sm:hidden ms-auto shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-600 hover:text-blue-600
                               border border-gray-200 rounded hover:bg-blue-50
                               transition-colors"
                    aria-label={t("profile.rename")}
                  >
                    <span aria-hidden="true">✏️</span>
                    <span>{t("profile.rename")}</span>
                  </button>
                </div>

                {/* Action buttons (labeled) */}
                <div className="flex items-center justify-between gap-1 sm:justify-start sm:ps-0 sm:shrink-0 [&>button]:flex-1 sm:[&>button]:flex-none [&>button]:justify-center sm:[&>button]:justify-start">
                  {/* Mobile-only move-down button (sits inline with the action buttons) */}
                  <button
                    onClick={() => moveProfile(index, 1)}
                    disabled={index === profiles.length - 1}
                    className="sm:hidden !flex-none shrink-0 inline-flex items-center justify-center w-7 h-7 text-base text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-default border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                    title={t("profile.moveDown")}
                    aria-label={t("profile.moveDown")}
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => startRename(profile.id, profile.name)}
                    className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-600 hover:text-blue-600
                               border border-gray-200 rounded hover:bg-blue-50
                               transition-colors"
                    aria-label={t("profile.rename")}
                  >
                    <span aria-hidden="true">✏️</span>
                    <span>{t("profile.rename")}</span>
                  </button>
                  <button
                    onClick={() => handleDuplicate(profile)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-600 hover:text-purple-600
                               border border-gray-200 rounded hover:bg-purple-50
                               transition-colors"
                    aria-label={t("profile.duplicate")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className="w-3.5 h-3.5"
                    >
                      <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
                      <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
                    </svg>
                    <span>{t("profile.duplicate")}</span>
                  </button>
                  <button
                    onClick={() => handleExport(profile)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-600 hover:text-green-600
                               border border-gray-200 rounded hover:bg-green-50
                               transition-colors"
                    aria-label={t("profile.export")}
                  >
                    <span aria-hidden="true">📤</span>
                    <span>{t("profile.export")}</span>
                  </button>
                  <button
                    onClick={() => handleDelete(profile.id, profile.name)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-red-500 hover:text-red-700
                               border border-gray-200 rounded hover:bg-red-50
                               transition-colors"
                    aria-label={t("profile.delete")}
                  >
                    <span aria-hidden="true">🗑️</span>
                    <span>{t("profile.delete")}</span>
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
