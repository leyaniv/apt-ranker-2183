import { useState, useRef, useEffect, useCallback } from "react";

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const btn = wrapperRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const maxWidth = Math.min(window.innerWidth - margin * 2, 320);
    // Try to align to button's start edge, then clamp inside viewport
    let left = rect.left;
    if (left + maxWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - maxWidth;
    }
    if (left < margin) left = margin;
    setPos({ top: rect.bottom + 4, left, width: maxWidth });
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
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
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
      {open && pos && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
          className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg
                     px-3 py-2 text-sm text-gray-600 leading-relaxed whitespace-pre-line"
        >
          {text}
        </div>
      )}
    </div>
  );
}
