import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { EditProfilesModal } from "./EditProfilesModal";
import { InfoTooltip } from "../Layout/InfoTooltip";

type ModalMode = null | "create";

export function ProfileSelector() {
  const { t } = useTranslation();
  const {
    profiles,
    activeProfile,
    selectProfile,
    addProfile,
  } = useApp();

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [showEditProfiles, setShowEditProfiles] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modalMode) inputRef.current?.focus();
  }, [modalMode]);

  const openCreate = () => {
    setNameValue(t("profile.defaultName"));
    setModalMode("create");
  };

  const handleConfirm = () => {
    const trimmed = nameValue.trim();
    if (!trimmed) return;
    if (modalMode === "create") {
      addProfile(trimmed);
    }
    setModalMode(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setModalMode(null);
    if (e.key === "Enter") {
      e.stopPropagation();
      handleConfirm();
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap" data-tour-id="profile-selector">
        {/* Profile dropdown */}
        <span className="text-sm text-gray-600 font-medium">
          {t("profile.currentProfile")}
        </span>
        <select
          value={activeProfile?.id ?? ""}
          onChange={(e) => {
            if (e.target.value === "__new__") {
              openCreate();
            } else {
              selectProfile(e.target.value);
            }
          }}
          aria-label={t("profile.currentProfile")}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm
                     bg-white max-w-[40vw] sm:min-w-[140px] truncate"
        >
          {profiles.length === 0 && (
            <option value="">{t("profile.select")}</option>
          )}
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__new__">+ {t("profile.create")}</option>
        </select>

        <InfoTooltip text={t("profile.profileTip")} />

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowEditProfiles(true)}
            className="px-2 py-1.5 text-xs font-medium text-gray-600
                       border border-gray-200 rounded-md hover:bg-gray-50
                       transition-colors"
            title={t("profile.editProfiles")}
          >
            {t("common.edit")}
          </button>
        </div>
      </div>

      {/* Edit Profiles modal */}
      {showEditProfiles && (
        <EditProfilesModal
          onClose={() => setShowEditProfiles(false)}
          onCreateProfile={() => {
            setShowEditProfiles(false);
            openCreate();
          }}
        />
      )}

      {/* Name modal */}
      {modalMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setModalMode(null)}
          onKeyDown={handleKeyDown}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t("profile.create")}
            </h2>

            <div className="space-y-2">
              <label
                htmlFor="profileName"
                className="block text-sm font-medium text-gray-700"
              >
                {t("profile.namePrompt")}
              </label>
              <input
                ref={inputRef}
                id="profileName"
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                           focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setModalMode(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800
                           border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!nameValue.trim()}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md
                           hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {modalMode === "create" ? t("profile.create") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
