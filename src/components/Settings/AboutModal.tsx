import { useState } from "react";
import { useTranslation } from "react-i18next";
import packageJson from "../../../package.json";
import { ChangelogModal } from "./ChangelogModal";
import { track } from "../../utils/analytics";

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  const { t } = useTranslation();
  const [changelogOpen, setChangelogOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("about.title")}
        </h2>

        {/* Description */}
        <p className="text-sm text-gray-700 mb-4">{t("about.description")}</p>

        {/* Version & Changelog */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {t("about.version")}
            </span>
            <span className="text-gray-500">{packageJson.version}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {t("about.changelog")}
            </span>
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => {
                track("changelog_opened");
                setChangelogOpen(true);
              }}
            >
              {t("about.viewChangelog")}
            </button>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
          <p className="text-xs text-amber-800 leading-relaxed">
            ⚠️ {t("about.disclaimer")}
          </p>
        </div>

        {/* Web app links */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {t("about.sourceCode")}
            </span>
            <a
              href="https://github.com/leyaniv/apt-ranker-2183"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
              onClick={() => track("external_link_clicked", { target: "repo" })}
            >
              {t("about.sourceCodeLink")}
            </a>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {t("about.contact")}
            </span>
            <a
              href="https://github.com/leyaniv/apt-ranker-2183/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
              onClick={() => track("external_link_clicked", { target: "discussions" })}
            >
              {t("about.contactLink")}
            </a>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {t("about.reportIssue")}
            </span>
            <a
              href="https://github.com/leyaniv/apt-ranker-2183/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
              onClick={() => track("external_link_clicked", { target: "report_bug" })}
            >
              {t("about.reportIssueLink")}
            </a>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {t("about.donate")}
            </span>
            <a
              href="https://ko-fi.com/yanivlevinsky"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
              onClick={() => track("external_link_clicked", { target: "donation" })}
            >
              {t("about.donateLink")} ☕
            </a>
          </div>
        </div>

        <hr className="border-gray-200 mb-4" />

        {/* Project (real-estate developer) link */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {t("about.developer")}
            </span>
            <a
              href="https://haifa.eshelltd.co.il/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
              onClick={() => track("external_link_clicked", { target: "developer" })}
            >
              {t("about.developerLink")}
            </a>
          </div>
        </div>

        {/* Close button */}
        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
      {changelogOpen && (
        <ChangelogModal onClose={() => setChangelogOpen(false)} />
      )}
    </div>
  );
}
