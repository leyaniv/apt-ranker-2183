import { useEffect } from "react";
import { useTranslation } from "react-i18next";

interface ConfirmDialogProps {
  /** Title text shown in the dialog header */
  title?: string;
  /** Main message body */
  message: string;
  /** Label for the confirm button (defaults to common.save / "OK") */
  confirmLabel?: string;
  /** Label for the cancel button (defaults to common.cancel) */
  cancelLabel?: string;
  /** Whether the confirm button should look destructive (red) */
  danger?: boolean;
  /** Called when user confirms */
  onConfirm: () => void;
  /** Called when user cancels or dismisses */
  onCancel: () => void;
}

/**
 * Styled replacement for `window.confirm` that matches the rest of the
 * site's modals (Settings, Edit Profiles, etc.).
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        {title && (
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
        )}
        <p className="text-sm text-gray-700 whitespace-pre-line">{message}</p>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800
                       border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`px-4 py-2 text-sm text-white rounded-md transition-colors ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmLabel ?? t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AlertDialogProps {
  title?: string;
  message: string;
  onClose: () => void;
}

/**
 * Styled replacement for `window.alert` that matches the site's modals.
 */
export function AlertDialog({ title, message, onClose }: AlertDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        {title && (
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
        )}
        <p className="text-sm text-gray-700 whitespace-pre-line">{message}</p>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            autoFocus
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md
                       hover:bg-blue-700 transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
