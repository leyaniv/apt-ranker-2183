import { useEffect, useState } from "react";

/**
 * Returns true when the viewport is wide enough to display the desktop
 * results-table layout without horizontal overflow.
 *
 * Pinned to 768px — Tailwind's classic `md` breakpoint and a common
 * tablet/desktop boundary. The desktop row uses an 11-column fixed-px grid
 * sized to fit comfortably within this width (sum + gaps + padding ≈ 720px,
 * leaving headroom for scrollbars and viewport margins).
 *
 * Tailwind's `sm:` breakpoint is overridden in `index.css` to match this
 * value so layout transitions across the app stay in lockstep.
 */
const DESKTOP_BREAKPOINT_PX = 768;

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}
