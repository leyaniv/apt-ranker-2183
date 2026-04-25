import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { TourPopover } from "./TourPopover";
import { TOUR_STEPS } from "./tourSteps";
import { track } from "../../utils/analytics";
import type { ImportanceWeights, ValueScores } from "../../types";

/** localStorage key for tracking demo-profile IDs across reloads. */
const DEMO_IDS_KEY = "eshel-onboarding-demo-ids";

function readDemoIds(): string[] {
  try {
    const raw = localStorage.getItem(DEMO_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeDemoIds(ids: string[]) {
  try {
    if (ids.length === 0) localStorage.removeItem(DEMO_IDS_KEY);
    else localStorage.setItem(DEMO_IDS_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Root onboarding tour component. Listens to `onboarding` state on AppContext
 * and renders the current step's popover. Handles tab switching between steps,
 * and seeds/removes temporary demo profiles when no profiles exist.
 */
export function OnboardingTour() {
  const { t } = useTranslation();
  const {
    onboarding,
    requestTabChange,
    profiles,
    addProfile,
    saveProfile,
    removeProfile,
    selectProfile,
    parameterConfigs,
  } = useApp();
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);

  const wasOpenRef = useRef(false);
  const didCleanupOnMountRef = useRef(false);

  const step = TOUR_STEPS[onboarding.stepIndex];
  const isBeyondLast = onboarding.stepIndex >= TOUR_STEPS.length;

  // If step somehow overruns, close the tour
  useEffect(() => {
    if (onboarding.isOpen && isBeyondLast) {
      onboarding.close();
    }
  }, [onboarding, isBeyondLast]);

  // Safety net: if the app mounts with the tour closed but demo profile IDs
  // are stranded in localStorage (e.g. user reloaded mid-tour, or a previous
  // close path failed), clean them up once.
  useEffect(() => {
    if (didCleanupOnMountRef.current) return;
    if (onboarding.isOpen) return;
    didCleanupOnMountRef.current = true;
    const stranded = readDemoIds();
    if (stranded.length === 0) return;
    for (const id of stranded) {
      removeProfile(id);
    }
    writeDemoIds([]);
    try {
      sessionStorage.removeItem("eshel-compare-state");
      sessionStorage.removeItem("eshel-combine-state");
    } catch {
      // Ignore storage errors.
    }
  }, [onboarding.isOpen, removeProfile]);

  // Seed two temporary demo profiles when opening if the user has none.
  // Remove whatever we created when the tour closes.
  useEffect(() => {
    const justOpened = onboarding.isOpen && !wasOpenRef.current;
    const justClosed = !onboarding.isOpen && wasOpenRef.current;
    wasOpenRef.current = onboarding.isOpen;

    if (justOpened && profiles.length === 0 && parameterConfigs.length > 0) {
      const randomizedProfile = (name: string) => {
        const p = addProfile(name);
        const scores: ValueScores = {};
        const weights: ImportanceWeights = {};
        for (const config of parameterConfigs) {
          scores[config.id] = {};
          for (const v of config.values) {
            scores[config.id][v] = Math.floor(Math.random() * 5) + 1;
          }
          weights[config.id] = Math.floor(Math.random() * 5) + 1;
        }
        saveProfile({ ...p, scores, weights });
        return p.id;
      };

      const id1 = randomizedProfile(t("onboarding.demoProfile1"));
      const id2 = randomizedProfile(t("onboarding.demoProfile2"));
      // Persist ids so we can still clean up if the page reloads mid-tour.
      writeDemoIds([id1, id2]);
      // addProfile makes the newly-added profile active, so id2 would be
      // selected. Switch back to id1 so the "primary" demo is the active one.
      selectProfile(id1);

      // Pre-select the demo profiles in the Compare + Combine views so those
      // tabs have visible content during the tour. These views read their
      // selection from sessionStorage on mount.
      try {
        sessionStorage.setItem(
          "eshel-compare-state",
          JSON.stringify({ selectedIds: [id1, id2], selectedSlug: null, selectedProfileId: null })
        );
        sessionStorage.setItem(
          "eshel-combine-state",
          JSON.stringify({ selectedIds: [id1, id2], profileWeights: {} })
        );
      } catch {
        // Ignore storage errors (quota, disabled, etc.) — tour still works.
      }
    }

    if (justClosed) {
      const ids = readDemoIds();
      if (ids.length > 0) {
        for (const id of ids) {
          removeProfile(id);
        }
        writeDemoIds([]);
        try {
          sessionStorage.removeItem("eshel-compare-state");
          sessionStorage.removeItem("eshel-combine-state");
        } catch {
          // Ignore storage errors.
        }
      }
    }
  }, [onboarding.isOpen, profiles.length, parameterConfigs, addProfile, saveProfile, removeProfile, selectProfile, t]);

  // Switch tabs when the step requires it
  useEffect(() => {
    if (!onboarding.isOpen || !step) return;
    if (step.tab) {
      requestTabChange(step.tab);
    }
  }, [onboarding.isOpen, onboarding.stepIndex, step, requestTabChange]);

  // Locate the target element (re-query after tab switch + DOM settles)
  useEffect(() => {
    if (!onboarding.isOpen || !step) {
      setTargetEl(null);
      return;
    }
    if (!step.targetTourId) {
      setTargetEl(null);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const tryLocate = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(
        `[data-tour-id="${step.targetTourId}"]`
      );
      if (el) {
        setTargetEl(el);
        return;
      }
      attempts++;
      if (attempts < 20) {
        // Retry for up to ~1 second while tab content mounts
        setTimeout(tryLocate, 50);
      } else {
        // Give up → step renders as centered modal
        setTargetEl(null);
      }
    };
    tryLocate();

    return () => {
      cancelled = true;
    };
  }, [onboarding.isOpen, onboarding.stepIndex, step]);

  if (!onboarding.isOpen || !step) return null;

  const handleFinish = (reason: "completed" | "skipped") => {
    track(reason === "completed" ? "onboarding_completed" : "onboarding_skipped", {
      step: onboarding.stepIndex,
    });
    requestTabChange("scoring");
    onboarding.close();
  };

  const handleNext = () => {
    if (onboarding.stepIndex >= TOUR_STEPS.length - 1) {
      handleFinish("completed");
    } else {
      onboarding.next();
    }
  };

  return (
    <TourPopover
      key={step.id}
      targetEl={targetEl}
      placement={step.placement ?? "auto"}
      title={t(`onboarding.${step.id}.title`)}
      body={t(`onboarding.${step.id}.body`)}
      stepIndex={onboarding.stepIndex}
      totalSteps={TOUR_STEPS.length}
      onNext={handleNext}
      onPrev={onboarding.prev}
      onSkip={() => handleFinish("skipped")}
    />
  );
}
