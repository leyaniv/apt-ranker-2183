import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { TabHeader } from "../Layout/TabHeader";
import { ConfirmDialog } from "../Layout/ConfirmDialog";

function formatRelativeTime(timestamp: number, locale: string): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const isHe = locale === "he";

  if (seconds < 60) return isHe ? "לפני רגע" : "just now";
  if (minutes < 60) return isHe ? `לפני ${minutes} דקות` : `${minutes}m ago`;
  if (hours < 24) return isHe ? `לפני ${hours} שעות` : `${hours}h ago`;
  return isHe ? `לפני ${days} ימים` : `${days}d ago`;
}

function formatAbsoluteTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChangeHistory() {
  const { t, i18n } = useTranslation();
  const { activeProfile, changeHistory, restoreToHistoryEntry } = useApp();
  const lang = i18n.language as "en" | "he";
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);

  if (!activeProfile) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">{t("profile.select")}</p>
      </div>
    );
  }

  if (changeHistory.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-400">{t("history.empty")}</p>
      </div>
    );
  }

  // Show newest first
  const reversed = [...changeHistory].reverse();

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto w-full">
      <TabHeader title={t("history.title")} tooltip={t("history.howToUse")} />
      <div className="space-y-2 mt-4">
        {reversed.map((entry, idx) => {
          const isLatest = idx === 0;
          return (
            <div
              key={entry.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors
                ${isLatest
                  ? "bg-blue-50 border-blue-200"
                  : "bg-white border-gray-200 hover:bg-gray-50"
                }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">
                  {(() => {
                    const desc = entry.description[lang] || entry.description.en;
                    // Stale entries from when i18n keys were missing contain raw keys
                    return desc.startsWith("changeHistory.") ? t("changeHistory.unknownChange") : desc;
                  })()}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatRelativeTime(entry.timestamp, lang)}
                  {" · "}
                  {formatAbsoluteTime(entry.timestamp)}
                </p>
              </div>
              <div className="ms-3 flex-shrink-0">
                {isLatest ? (
                  <span className="text-xs text-blue-600 font-medium">
                    {t("history.current")}
                  </span>
                ) : (
                  <button
                    onClick={() => setPendingRestoreId(entry.id)}
                    className="px-3 py-1 text-xs font-medium text-orange-600
                               border border-orange-300 rounded-md
                               hover:bg-orange-50
                               transition-colors"
                  >
                    {t("history.restore")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pendingRestoreId && (
        <ConfirmDialog
          title={t("history.restore")}
          message={t("history.confirmRestore")}
          confirmLabel={t("history.restore")}
          danger
          onConfirm={() => {
            restoreToHistoryEntry(pendingRestoreId);
            setPendingRestoreId(null);
          }}
          onCancel={() => setPendingRestoreId(null)}
        />
      )}
    </div>
  );
}
