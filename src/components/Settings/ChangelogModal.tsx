import { useTranslation } from "react-i18next";
import changelogMd from "../../../CHANGELOG.md?raw";

interface ChangelogModalProps {
  onClose: () => void;
}

interface Block {
  type: "h1" | "h2" | "h3" | "p" | "li";
  text: string;
}

function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", text: trimmed.slice(4) });
    } else if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", text: trimmed.slice(3) });
    } else if (trimmed.startsWith("# ")) {
      blocks.push({ type: "h1", text: trimmed.slice(2) });
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      blocks.push({ type: "li", text: trimmed.slice(2) });
    } else {
      blocks.push({ type: "p", text: trimmed });
    }
  }
  return blocks;
}

export function ChangelogModal({ onClose }: ChangelogModalProps) {
  const { t } = useTranslation();
  const blocks = parseMarkdown(changelogMd);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("about.changelog")}
        </h2>

        <div className="text-sm text-gray-700 space-y-2">
          {blocks.map((block, idx) => {
            switch (block.type) {
              case "h1":
                return (
                  <h3 key={idx} className="text-base font-semibold text-gray-900 mt-2">
                    {block.text}
                  </h3>
                );
              case "h2":
                return (
                  <h4 key={idx} className="text-sm font-semibold text-gray-900 mt-3">
                    {block.text}
                  </h4>
                );
              case "h3":
                return (
                  <h5 key={idx} className="text-sm font-medium text-gray-800 mt-2">
                    {block.text}
                  </h5>
                );
              case "li":
                return (
                  <li key={idx} className="ms-5 list-disc">
                    {block.text}
                  </li>
                );
              case "p":
              default:
                return (
                  <p key={idx} className="text-gray-700">
                    {block.text}
                  </p>
                );
            }
          })}
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
