/**
 * Privacy-friendly analytics helper.
 *
 * Traffic-level stats (pageviews, referrers, country, browsers, Core Web
 * Vitals) are handled automatically by Cloudflare Web Analytics, which is
 * enabled at the Cloudflare Pages project level — no script tag, no cookies,
 * no PII. See README "Analytics".
 *
 * This module provides a tiny `track(event, props?)` helper for **custom
 * product events** (e.g. "profile_created", "tour_completed"). It is a
 * no-op by default so calls are safe to sprinkle through the codebase.
 *
 * To wire it to a provider later (Plausible, Umami, PostHog, Cloudflare
 * `sendEvent`, …), implement `dispatch` below or set a global
 * `window.__eshelTrack` from a provider snippet in `index.html`.
 *
 * Rules:
 * - Never pass PII, apartment data, profile contents, notes, or anything
 *   user-identifying. Event names + low-cardinality categorical props only.
 * - Never throw — analytics must not break the app.
 */

type TrackProps = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    __eshelTrack?: (event: string, props?: TrackProps) => void;
  }
}

function dispatch(event: string, props?: TrackProps): void {
  if (typeof window === 'undefined') return;
  const fn = window.__eshelTrack;
  if (typeof fn === 'function') {
    fn(event, props);
  }
  // No-op otherwise. Cloudflare Web Analytics already records pageviews
  // automatically; custom events are opt-in via a provider hookup.
}

export function track(event: string, props?: TrackProps): void {
  try {
    dispatch(event, props);
  } catch {
    // Swallow — analytics must never break the app.
  }
}
