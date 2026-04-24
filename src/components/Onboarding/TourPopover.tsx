import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TourPlacement } from "./tourSteps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TourPopoverProps {
  /** Target element to highlight. If null, popover renders centered without cutout. */
  targetEl: HTMLElement | null;
  placement?: TourPlacement;
  title: string;
  body: string;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

const BUBBLE_WIDTH = 360;
const BUBBLE_GAP = 12;
const VIEWPORT_MARGIN = 12;
const MOBILE_BREAKPOINT = 640;

/** Compute bounding rect relative to the viewport */
function getRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Pick a placement that fits; flips if requested placement overflows. */
function resolvePlacement(
  rect: Rect,
  preferred: TourPlacement,
  bubbleHeight: number,
  isRTL: boolean
): { placement: Exclude<TourPlacement, "auto">; top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Mirror left/right in RTL
  let pref: TourPlacement = preferred;
  if (isRTL) {
    if (pref === "left") pref = "right";
    else if (pref === "right") pref = "left";
  }

  const fits = {
    bottom: rect.top + rect.height + BUBBLE_GAP + bubbleHeight < vh - VIEWPORT_MARGIN,
    top: rect.top - BUBBLE_GAP - bubbleHeight > VIEWPORT_MARGIN,
    right: rect.left + rect.width + BUBBLE_GAP + BUBBLE_WIDTH < vw - VIEWPORT_MARGIN,
    left: rect.left - BUBBLE_GAP - BUBBLE_WIDTH > VIEWPORT_MARGIN,
  };

  const order: Array<Exclude<TourPlacement, "auto">> =
    pref === "auto" || !fits[pref as keyof typeof fits]
      ? (["bottom", "top", "right", "left"] as const).filter((p) => fits[p]).concat(["bottom"])
      : [pref as Exclude<TourPlacement, "auto">];

  const chosen = order[0];

  let top: number;
  let left: number;

  if (chosen === "bottom") {
    top = rect.top + rect.height + BUBBLE_GAP;
    left = rect.left + rect.width / 2 - BUBBLE_WIDTH / 2;
  } else if (chosen === "top") {
    top = rect.top - BUBBLE_GAP - bubbleHeight;
    left = rect.left + rect.width / 2 - BUBBLE_WIDTH / 2;
  } else if (chosen === "right") {
    top = rect.top + rect.height / 2 - bubbleHeight / 2;
    left = rect.left + rect.width + BUBBLE_GAP;
  } else {
    top = rect.top + rect.height / 2 - bubbleHeight / 2;
    left = rect.left - BUBBLE_GAP - BUBBLE_WIDTH;
  }

  // Clamp to viewport
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - BUBBLE_WIDTH - VIEWPORT_MARGIN));
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - bubbleHeight - VIEWPORT_MARGIN));

  return { placement: chosen, top, left };
}

export function TourPopover({
  targetEl,
  placement = "auto",
  title,
  body,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: TourPopoverProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === "rtl";
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
  );

  const isLast = stepIndex === totalSteps - 1;
  const isFirst = stepIndex === 0;

  // Scroll target into view when step changes.
  // For tall targets, align the top near the top of the viewport so the
  // user still sees page context (title, tabs) above it.
  useEffect(() => {
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const block: ScrollLogicalPosition =
      rect.height > viewportH * 0.6 ? "start" : "center";
    targetEl.scrollIntoView({ block, behavior: "smooth" });
  }, [targetEl]);

  // Measure target + compute popover position
  useLayoutEffect(() => {
    const update = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
      if (!targetEl) {
        setRect(null);
        setPos(null);
        return;
      }
      const r = getRect(targetEl);
      setRect(r);
      const bubbleH = bubbleRef.current?.offsetHeight ?? 200;
      if (window.innerWidth < MOBILE_BREAKPOINT) {
        // Mobile: popover pinned to bottom sheet, skip positioning calc
        setPos(null);
        return;
      }
      const { top, left } = resolvePlacement(r, placement, bubbleH, isRTL);
      setPos({ top, left });
    };

    update();
    // Re-measure after layout settles (fonts, icons)
    const rafId = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [targetEl, placement, isRTL, stepIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
      } else if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!isFirst) onPrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNext, onPrev, onSkip, isFirst]);

  // Focus the popover on mount/step change for accessibility
  useEffect(() => {
    bubbleRef.current?.focus();
  }, [stepIndex]);

  // Backdrop with optional cutout (rendered as 4 rectangles around the target)
  const renderBackdrop = () => {
    const base = "fixed bg-black/40 z-[60] transition-opacity duration-150";
    if (!rect) {
      return <div className={`${base} inset-0`} aria-hidden="true" />;
    }
    const pad = 4;
    const cutout = {
      top: Math.max(0, rect.top - pad),
      left: Math.max(0, rect.left - pad),
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
    return (
      <>
        {/* top */}
        <div
          className={base}
          style={{ top: 0, left: 0, right: 0, height: cutout.top }}
          aria-hidden="true"
        />
        {/* bottom */}
        <div
          className={base}
          style={{ top: cutout.top + cutout.height, left: 0, right: 0, bottom: 0 }}
          aria-hidden="true"
        />
        {/* left */}
        <div
          className={base}
          style={{
            top: cutout.top,
            left: 0,
            width: cutout.left,
            height: cutout.height,
          }}
          aria-hidden="true"
        />
        {/* right */}
        <div
          className={base}
          style={{
            top: cutout.top,
            left: cutout.left + cutout.width,
            right: 0,
            height: cutout.height,
          }}
          aria-hidden="true"
        />
        {/* highlight ring */}
        <div
          className="fixed z-[60] pointer-events-none rounded-lg ring-2 ring-blue-400 ring-offset-2 ring-offset-transparent"
          style={{
            top: cutout.top,
            left: cutout.left,
            width: cutout.width,
            height: cutout.height,
          }}
          aria-hidden="true"
        />
      </>
    );
  };

  // Bubble positioning
  const bubbleStyle: React.CSSProperties = (() => {
    if (isMobile || !rect) {
      // Centered (no target) or mobile bottom sheet
      if (!rect) {
        return {
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: `min(${BUBBLE_WIDTH}px, calc(100vw - 24px))`,
        };
      }
      // Mobile bottom sheet
      return {
        bottom: 12,
        left: 12,
        right: 12,
        width: "auto",
      };
    }
    return {
      top: pos?.top ?? 0,
      left: pos?.left ?? 0,
      width: BUBBLE_WIDTH,
    };
  })();

  const progressPct = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <>
      {renderBackdrop()}
      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
        tabIndex={-1}
        className="fixed z-[70] bg-gray-50 text-gray-900 rounded-lg shadow-2xl border border-gray-200 p-5 focus:outline-none"
        style={bubbleStyle}
      >
        {/* Header row: progress + skip */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">
            {t("onboarding.progress", { current: stepIndex + 1, total: totalSteps })}
          </span>
          <button
            onClick={onSkip}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            {t("onboarding.skip")}
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={
              isRTL
                ? { width: `${progressPct}%`, marginInlineStart: "auto" }
                : { width: `${progressPct}%` }
            }
          />
        </div>

        {/* Title + body */}
        <h2
          id="onboarding-title"
          className="text-base font-semibold text-gray-900 mb-2"
        >
          {title}
        </h2>
        <p
          id="onboarding-body"
          className="text-sm text-gray-600 leading-relaxed mb-5 whitespace-pre-line"
        >
          {body}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onPrev}
            disabled={isFirst}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isFirst
                ? "text-gray-300 cursor-default"
                : "text-gray-700 bg-gray-100 hover:bg-gray-200"
            }`}
          >
            {t("onboarding.back")}
          </button>
          <button
            onClick={onNext}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            {isLast ? t("onboarding.finish") : t("onboarding.next")}
          </button>
        </div>
      </div>
    </>
  );
}
