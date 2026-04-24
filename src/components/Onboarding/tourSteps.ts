/**
 * First-run onboarding tour step definitions.
 *
 * Each step highlights a specific element in the UI (via `data-tour-id` attribute)
 * and may auto-switch the app to a specific tab before being shown.
 */

export type TourPlacement = "top" | "bottom" | "left" | "right" | "auto";

export interface TourStep {
  /** Unique id (also used as the i18n key suffix: onboarding.<id>.title / .body) */
  id: string;
  /** `[data-tour-id="..."]` attribute value on the target element. Omit for a centered modal. */
  targetTourId?: string;
  /** Tab to switch to before showing this step */
  tab?: "scoring" | "results" | "history" | "combine" | "compare";
  /** Preferred placement relative to target (auto-flips to fit viewport) */
  placement?: TourPlacement;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    // No target → centered modal
    tab: "scoring",
  },
  {
    id: "profile",
    targetTourId: "profile-selector",
    tab: "scoring",
    placement: "bottom",
  },
  {
    id: "scoring",
    targetTourId: "parameter-card",
    tab: "scoring",
    placement: "bottom",
  },
  {
    id: "results",
    targetTourId: "results-filters",
    tab: "results",
    placement: "bottom",
  },
  {
    id: "apartmentRow",
    targetTourId: "apartment-row",
    tab: "results",
    placement: "bottom",
  },
  {
    id: "compare",
    targetTourId: "compare-tab",
    tab: "compare",
    placement: "bottom",
  },
  {
    id: "combine",
    targetTourId: "combine-tab",
    tab: "combine",
    placement: "bottom",
  },
  {
    id: "done",
    targetTourId: "header-actions",
    placement: "bottom",
  },
];
