import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface MultiSelectPopoverProps {
  /** Localized field label rendered on the trigger and as the popover header. */
  label: string;
  /** Full set of selectable option keys. */
  options: string[];
  /** Currently selected option keys. */
  value: string[];
  /** Called whenever the selection changes (toggle, clear, etc.). */
  onChange: (next: string[]) => void;
  /** Optional renderer for an option's display text. Defaults to the key. */
  renderOption?: (option: string) => ReactNode;
  /** When true, renders a search input that filters options by their key. */
  searchable?: boolean;
  /**
   * When true, options are grouped by their leading letter with a small
   * sticky-style header per group. Useful for codes like "A4-5"/"B3-1".
   */
  groupByFirstLetter?: boolean;
}

const FIRST_LETTER_RE = /^[A-Za-z]/;

/**
 * Anchored popover with a checkbox list, optional search, and grouping by
 * leading letter. Matches the visual language of the existing native
 * `<select>` triggers in the results filter row, but supports multi-select.
 *
 * Positioning uses the same `position: fixed` + viewport-clamp approach as
 * `InfoTooltip` — anchors to the trigger's start edge (left in LTR, right in
 * RTL) and re-positions on scroll/resize.
 */
export function MultiSelectPopover({
  label,
  options,
  value,
  onChange,
  renderOption,
  searchable = false,
  groupByFirstLetter = false,
}: MultiSelectPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const isRTL =
    typeof document !== "undefined" && document.documentElement.dir === "rtl";

  const reposition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const desiredWidth = Math.max(220, rect.width);
    const width = Math.min(window.innerWidth - margin * 2, desiredWidth);
    // Anchor to the trigger's start edge — left in LTR, right in RTL —
    // then clamp inside the viewport so we never overflow.
    let left = isRTL ? rect.right - width : rect.left;
    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - margin - width;
    }
    if (left < margin) left = margin;
    setPos({ top: rect.bottom + 4, left, width });
  }, [isRTL]);

  // Reset the search query at every close call site so a fresh open always
  // starts from a clean slate. Doing this here (rather than in an effect on
  // `open`) avoids a setState-in-effect cascade.
  const closePopover = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    setTimeout(() => searchRef.current?.focus(), 0);
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        popoverRef.current?.contains(t)
      ) {
        return;
      }
      closePopover();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopover();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition, closePopover]);

  const visibleOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const grouped = useMemo(() => {
    if (!groupByFirstLetter) return null;
    const map = new Map<string, string[]>();
    for (const opt of visibleOptions) {
      const m = opt.match(FIRST_LETTER_RE);
      const key = (m ? m[0] : "#").toUpperCase();
      const arr = map.get(key) ?? [];
      arr.push(opt);
      map.set(key, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [groupByFirstLetter, visibleOptions]);

  const toggle = useCallback(
    (key: string) => {
      if (selectedSet.has(key)) {
        onChange(value.filter((v) => v !== key));
      } else {
        onChange([...value, key]);
      }
    },
    [onChange, selectedSet, value]
  );

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const count = value.length;

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePopover() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 border rounded-md px-2 py-1 text-sm bg-white transition-colors ${
          count > 0
            ? "border-blue-300 text-blue-700 hover:bg-blue-50"
            : "border-gray-300 text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span>{label}</span>
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1
                           text-xs font-medium rounded-full bg-blue-100 text-blue-700">
            {count}
          </span>
        )}
        {count > 0 ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={t("results.clearSelection")}
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                clearAll();
              }
            }}
            className="text-gray-400 hover:text-gray-600 cursor-pointer leading-none px-0.5"
          >
            ×
          </span>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {open && pos && (
        <div
          ref={popoverRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: Math.min(window.innerHeight * 0.6, 420),
          }}
          className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg
                     flex flex-col overflow-hidden"
        >
          {searchable && (
            <div className="flex-shrink-0 p-2 border-b border-gray-100">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("results.filterSearchPlaceholder")}
                aria-label={t("results.filterSearchPlaceholder")}
                className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm
                           focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto py-1">
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-400">
                {t("results.filterNoMatches")}
              </div>
            ) : grouped ? (
              grouped.map(([letter, opts]) => (
                <div key={letter}>
                  <div className="px-3 py-1 text-xs font-semibold text-gray-400 bg-gray-50">
                    {letter}
                  </div>
                  {opts.map((o) => (
                    <OptionRow
                      key={o}
                      option={o}
                      selected={selectedSet.has(o)}
                      onToggle={toggle}
                      renderOption={renderOption}
                    />
                  ))}
                </div>
              ))
            ) : (
              visibleOptions.map((o) => (
                <OptionRow
                  key={o}
                  option={o}
                  selected={selectedSet.has(o)}
                  onToggle={toggle}
                  renderOption={renderOption}
                />
              ))
            )}
          </div>

          {count > 0 && (
            <div className="flex-shrink-0 border-t border-gray-100 px-2 py-1.5 flex justify-end">
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded
                           hover:bg-blue-50"
              >
                {t("results.clearSelection")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface OptionRowProps {
  option: string;
  selected: boolean;
  onToggle: (key: string) => void;
  renderOption?: (option: string) => ReactNode;
}

function OptionRow({ option, selected, onToggle, renderOption }: OptionRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onToggle(option)}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-start
                  hover:bg-gray-50 transition-colors ${
                    selected ? "text-blue-700" : "text-gray-700"
                  }`}
    >
      <span
        className={`inline-flex items-center justify-center w-4 h-4 rounded-sm border flex-shrink-0 ${
          selected ? "bg-blue-600 border-blue-600" : "bg-white border-gray-400"
        }`}
        aria-hidden
      >
        {selected && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-3 h-3">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
        )}
      </span>
      <span className="truncate">
        {renderOption ? renderOption(option) : option}
      </span>
    </button>
  );
}
