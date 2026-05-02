import { useEffect, useState, type RefObject } from "react";

/**
 * Progressive-disclosure tiers for the desktop results table.
 * - 1: minimum compact desktop layout (kicks in alongside `useIsDesktop` at 768px).
 * - 2: adds a Balcony column once there's room (≥960px available width).
 * - 3: also adds an Air-Directions column on wider screens (≥1100px).
 */
export type TableTier = 1 | 2 | 3;

const TIER_2_PX = 960;
const TIER_3_PX = 1100;

/**
 * Per-tier grid column definitions for the desktop table. Both the header
 * row in `ResultsTable` and the data rows in `ApartmentRow` import this so
 * they always stay in sync.
 *
 * Column order:
 *   drag, rank, building, apt, rooms, floor,
 *   [directions]?, layout, type, area, [balcony]?, price, score
 *
 * `directions` is only present in tier 3; `balcony` in tiers 2 and 3.
 */
export interface TierLayout {
  /** Tailwind grid-template-columns class. */
  grid: string;
  /** Tailwind horizontal padding class for the row/header. */
  padX: string;
  /** Whether the Balcony column is rendered. */
  showBalcony: boolean;
  /** Whether the Air-Directions column is rendered. */
  showDirections: boolean;
}

export const TIER_LAYOUTS: Record<TableTier, TierLayout> = {
  1: {
    grid: "grid-cols-[20px_38px_60px_48px_52px_52px_64px_48px_70px_92px_68px]",
    padX: "px-2",
    showBalcony: false,
    showDirections: false,
  },
  2: {
    grid: "grid-cols-[24px_44px_70px_56px_60px_60px_72px_56px_80px_72px_104px_76px]",
    padX: "px-3",
    showBalcony: true,
    showDirections: false,
  },
  3: {
    grid: "grid-cols-[28px_50px_80px_60px_70px_70px_72px_80px_60px_90px_72px_110px_80px]",
    padX: "px-4",
    showBalcony: true,
    showDirections: true,
  },
};

/**
 * Watches the available width of the element referenced by `ref` (or its
 * parent — passing `useParent: true`) via ResizeObserver and returns the
 * matching column tier. Using a real container measurement (instead of
 * viewport width) keeps the table honest about how much room it actually
 * has, e.g. when the app gains a sidebar or the user zooms.
 */
export function useTableTier(
  ref: RefObject<HTMLElement | null>,
  options: { useParent?: boolean } = {}
): TableTier {
  const { useParent = false } = options;
  const [tier, setTier] = useState<TableTier>(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = useParent ? el.parentElement : el;
    if (!target) return;

    const update = (width: number) => {
      const next: TableTier = width >= TIER_3_PX ? 3 : width >= TIER_2_PX ? 2 : 1;
      setTier((prev) => (prev === next ? prev : next));
    };

    update(target.clientWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        update(entry.contentRect.width);
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [ref, useParent]);

  return tier;
}
