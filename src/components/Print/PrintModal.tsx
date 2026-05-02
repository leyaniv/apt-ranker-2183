import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { resolveLocale } from "../../utils/locale";
import {
  PRINT_COLUMNS,
  DEFAULT_PRINT_COLUMNS,
  openPrintView,
  type PrintColumnId,
} from "../../utils/print";
import type { RankedApartment } from "../../types";

type RowScope = "all" | "filtered" | "topN";

interface Prefs {
  columns: PrintColumnId[];
  includeNotes: boolean;
  includeMetadata: boolean;
  scope: RowScope;
  topN: number;
}

const PREFS_KEY = "eshel.print.prefs";
const DEFAULT_PREFS: Prefs = {
  columns: [...DEFAULT_PRINT_COLUMNS],
  includeNotes: false,
  includeMetadata: true,
  scope: "all",
  topN: 10,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const validColIds = new Set(PRINT_COLUMNS.map((c) => c.id));
    const cols = Array.isArray(parsed.columns)
      ? parsed.columns.filter((c): c is PrintColumnId => validColIds.has(c as PrintColumnId))
      : [...DEFAULT_PRINT_COLUMNS];
    return {
      columns: cols.length > 0 ? cols : [...DEFAULT_PRINT_COLUMNS],
      includeNotes: !!parsed.includeNotes,
      includeMetadata: parsed.includeMetadata !== false,
      scope: (parsed.scope === "filtered" || parsed.scope === "topN" ? parsed.scope : "all"),
      topN: typeof parsed.topN === "number" && parsed.topN > 0 ? Math.floor(parsed.topN) : 10,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota errors */
  }
}

interface PrintModalProps {
  /** Full ranked list (ignores filters & maxResults). */
  ranked: RankedApartment[];
  /** Filtered + maxResults-limited list — what the user currently sees on screen. */
  visible: RankedApartment[];
  onClose: () => void;
}

/**
 * Modal that lets the user pick columns, row scope, and extras
 * (notes, metadata) before opening a printable view of the table.
 */
export function PrintModal({ ranked, visible, onClose }: PrintModalProps) {
  const { t, i18n } = useTranslation();
  const { activeProfile, notes } = useApp();
  const locale = resolveLocale(i18n.language);

  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleColumn = (id: PrintColumnId) => {
    setPrefs((p) => {
      const has = p.columns.includes(id);
      if (has) {
        return { ...p, columns: p.columns.filter((c) => c !== id) };
      }
      // Re-insert in canonical PRINT_COLUMNS order so the on-page order
      // is stable regardless of the click sequence.
      const next = PRINT_COLUMNS
        .map((c) => c.id)
        .filter((cid) => p.columns.includes(cid) || cid === id);
      return { ...p, columns: next };
    });
  };

  const selectAll = () =>
    setPrefs((p) => ({
      ...p,
      columns: PRINT_COLUMNS.map((c) => c.id),
      includeNotes: true,
    }));
  const selectNone = () =>
    setPrefs((p) => ({
      ...p,
      columns: [...DEFAULT_PRINT_COLUMNS],
      includeNotes: DEFAULT_PREFS.includeNotes,
    }));

  const rowsToPrint = useMemo<RankedApartment[]>(() => {
    if (prefs.scope === "all") return ranked;
    if (prefs.scope === "filtered") return visible;
    // topN — applied to the visible (filtered) list, capped at length
    const n = Math.max(1, Math.min(prefs.topN, visible.length));
    return visible.slice(0, n);
  }, [prefs.scope, prefs.topN, ranked, visible]);

  const canPrint = prefs.columns.length > 0 && rowsToPrint.length > 0;

  const handlePrint = () => {
    if (!canPrint) return;
    const ok = openPrintView({
      rows: rowsToPrint,
      columnIds: prefs.columns,
      includeNotes: prefs.includeNotes,
      includeMetadata: prefs.includeMetadata,
      notes,
      profile: activeProfile ?? null,
      locale,
      notesLabel: t("detail.notes"),
      titleLabel: t("results.title"),
      printedOnLabel: t("print.printedOn"),
      totalLabel: t("print.total"),
      profileLabel: t("print.profile"),
    });
    if (!ok) {
      // Popup blocked. Surface a message but stay open so the user can retry.
      window.alert(t("print.popupBlocked"));
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("print.title")}
        </h2>

        {/* Columns */}
        <section className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              {t("print.columns")}
            </h3>
            <div className="flex gap-3 text-xs">
              <button
                onClick={selectAll}
                className="text-blue-600 hover:text-blue-800"
              >
                {t("print.selectAll")}
              </button>
              <button
                onClick={selectNone}
                className="text-blue-600 hover:text-blue-800"
              >
                {t("print.selectNone")}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 border border-gray-200 rounded-md p-3">
            {PRINT_COLUMNS.map((c) => {
              const checked = prefs.columns.includes(c.id);
              return (
                <label
                  key={c.id}
                  className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleColumn(c.id)}
                    className="rounded border-gray-300"
                  />
                  <span>{c.label[locale]}</span>
                </label>
              );
            })}
            {/* Notes is rendered as a sub-row, not a column, but we expose
                it here so users find all "what to include" toggles in one
                place. */}
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.includeNotes}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, includeNotes: e.target.checked }))
                }
                className="rounded border-gray-300"
              />
              <span>{t("print.includeNotes")}</span>
            </label>
          </div>

          <div className="mt-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.includeMetadata}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, includeMetadata: e.target.checked }))
                }
                className="rounded border-gray-300"
              />
              <span>{t("print.includeMetadata")}</span>
            </label>
          </div>
        </section>

        {/* Rows */}
        <section className="mb-5">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            {t("print.rows")}
          </h3>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="print-scope"
                checked={prefs.scope === "all"}
                onChange={() => setPrefs((p) => ({ ...p, scope: "all" }))}
              />
              <span>
                {t("print.scopeAll", { count: ranked.length })}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="print-scope"
                checked={prefs.scope === "filtered"}
                onChange={() => setPrefs((p) => ({ ...p, scope: "filtered" }))}
              />
              <span>
                {t("print.scopeFiltered", { count: visible.length })}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="print-scope"
                checked={prefs.scope === "topN"}
                onChange={() => setPrefs((p) => ({ ...p, scope: "topN" }))}
              />
              <span className="flex items-center gap-2 ltr:flex-row-reverse">
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, visible.length)}
                  value={prefs.topN}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setPrefs((p) => ({
                      ...p,
                      topN: Number.isNaN(n) ? 1 : Math.max(1, n),
                      scope: "topN",
                    }));
                  }}
                  onFocus={() => setPrefs((p) => ({ ...p, scope: "topN" }))}
                  className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm"
                />
                {t("print.scopeTopN")}
              </span>
            </label>
          </div>
        </section>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800
                       border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handlePrint}
            disabled={!canPrint}
            autoFocus
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md
                       hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("print.openPrintView")}
          </button>
        </div>
      </div>
    </div>
  );
}
