import { useState, useRef, useEffect, useCallback } from "react";

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const btn = wrapperRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // Use physical directions: if less room on the right, anchor to the right edge
    setAlignEnd(window.innerWidth - rect.right < 300);
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, reposition]);

  return (
    <div className="relative inline-flex" ref={wrapperRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full
                   text-gray-400 hover:text-gray-600 hover:bg-gray-100
                   transition-colors text-xs font-bold leading-none"
        aria-label={text}
      >
        ?
      </button>
      {open && (
        <div
          ref={popoverRef}
          className={`absolute top-full mt-1 z-20 w-64 sm:w-80
                      bg-white border border-gray-200 rounded-lg shadow-lg
                      px-3 py-2 text-sm text-gray-600 leading-relaxed
                      ${alignEnd ? "right-0" : "left-0"}`}
        >
          {text}
        </div>
      )}
    </div>
  );
}
