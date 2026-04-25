/**
 * Privacy-friendly analytics helper.
 *
 * Two providers are layered:
 *
 * 1. **Cloudflare Web Analytics** — auto-injected by Cloudflare Pages.
 *    Handles pageviews, referrers, country, browser and Core Web Vitals.
 *    Cookieless, no PII, no script tag of our own. Cloudflare's beacon does
 *    NOT expose a custom-event API, so this module does not call it.
 *
 * 2. **Umami Cloud** — loaded via a `<script>` tag in index.html. Provides
 *    `window.umami.track(name, props)` for custom product events. Also
 *    cookieless and GDPR-friendly.
 *
 * Use `track(event, props?)` for custom product events (e.g.
 * "profile_created", "tab_viewed"). Calls before Umami loads are silently
 * dropped — acceptable for our purposes.
 *
 * Rules:
 * - Never pass PII, apartment data, profile contents, notes, or anything
 *   user-identifying. Event names + low-cardinality categorical props only.
 * - Never throw — analytics must not break the app.
 */

type TrackProps = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    /** Test / dev override hook (also useful for swapping providers). */
    __eshelTrack?: (event: string, props?: TrackProps) => void;
    /** Umami Cloud tracker. Loaded asynchronously via the script tag. */
    umami?: {
      track: (
        nameOrFn:
          | string
          | ((props: Record<string, unknown>) => Record<string, unknown>),
        data?: Record<string, unknown>
      ) => void;
    };
  }
}

/**
 * Strip undefined props so they don't show up as the literal string
 * "undefined" in the analytics dashboard.
 */
function cleanProps(
  props?: TrackProps
): Record<string, string | number | boolean> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function dispatch(event: string, props?: TrackProps): void {
  if (typeof window === 'undefined') return;
  const cleaned = cleanProps(props);

  // 1) Test / dev override hook.
  const fn = window.__eshelTrack;
  if (typeof fn === 'function') {
    fn(event, cleaned);
  }

  // 2) Umami Cloud. The tracker exposes `window.umami.track` once the script
  // tag in index.html has loaded. Calls before load are dropped silently.
  const umami = window.umami;
  if (umami && typeof umami.track === 'function') {
    if (cleaned) {
      umami.track(event, cleaned);
    } else {
      umami.track(event);
    }
  }
}

export function track(event: string, props?: TrackProps): void {
  try {
    dispatch(event, props);
  } catch {
    // Swallow — analytics must never break the app.
  }
}
