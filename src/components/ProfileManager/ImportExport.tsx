import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { AlertDialog } from "../Layout/ConfirmDialog";

export function ImportExport() {
  const { t } = useTranslation();
  const { activeProfile, exportProfile, importProfile } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const handleExport = () => {
    if (activeProfile) exportProfile(activeProfile);
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

    // Reset so the same file can be re-imported
    e.target.value = "";
  };

  return (
    <>
      <button
        onClick={handleExport}
        className="px-2 py-1.5 text-xs text-gray-600
                   border border-gray-200 rounded-md hover:bg-gray-50
                   transition-colors"
        title={t("profile.export")}
      >
        📤
      </button>
      <button
        onClick={handleImportClick}
        className="px-2 py-1.5 text-xs text-gray-600
                   border border-gray-200 rounded-md hover:bg-gray-50
                   transition-colors"
        title={t("profile.import")}
      >
        📥
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
      {alertMessage && (
        <AlertDialog
          message={alertMessage}
          onClose={() => setAlertMessage(null)}
        />
      )}
    </>
  );
}
