import type { CSSProperties } from "react";

/**
 * Rank past which the chip's gradient bottoms out at the floor color.
 * Most of the visual change happens between rank 1 and ~rank 10 thanks
 * to the linear curve, but the plateau means rank 25 and rank 100
 * share the same calm slate appearance.
 */
const RANK_CHIP_PLATEAU = 25;

/**
 * Inline styles for the rank chip: a continuous lerp from the "top"
 * palette (rank 1) to the "bot" palette (rank 25+). Endpoints come
 * from `--rank-chip-*` CSS custom properties defined in `index.css`,
 * so dark mode swaps the gradient automatically (deep blue → slate-800
 * instead of blue-100 → slate-100) without any JS-level theme lookup.
 *
 * The lerp itself is delegated to the browser via `color-mix(in srgb,
 * top X%, bot)` where X is driven by the rank.
 */
function rankChipStyle(rank: number): CSSProperties {
  const t =
    rank <= 1
      ? 0
      : rank >= RANK_CHIP_PLATEAU
      ? 1
      : (rank - 1) / (RANK_CHIP_PLATEAU - 1);
  const topPct = `${((1 - t) * 100).toFixed(2)}%`;
  return {
    background: `color-mix(in srgb, var(--rank-chip-top-bg) ${topPct}, var(--rank-chip-bot-bg))`,
    color: `color-mix(in srgb, var(--rank-chip-top-fg) ${topPct}, var(--rank-chip-bot-fg))`,
  };
}

/**
 * Inline styling for the small `(originalRank)` annotation. Pulled
 * from the `--rank-annotation-color` token so light/dark mode swap
 * the shade without per-instance JS.
 */
export const ANNOTATION_STYLE: CSSProperties = {
  color: "var(--rank-annotation-color)",
};

interface RankChipProps {
  rank: number;
  /**
   * Visual size variant.
   *  - `default` (used in the results table): `text-xs`, `font-bold`,
   *    `min-w-[1.625rem]`. Stands shoulder-to-shoulder with the
   *    surrounding `text-sm` row content.
   *  - `compact` (used inside dense BuildingsView cells): scales down
   *    to match the buildings-view score chip — `text-[9px] sm:text-[10px]`,
   *    `font-semibold`, `min-w-[1.4rem]`.
   */
  size?: "default" | "compact";
}

/**
 * Small colored chip rendering an apartment's display rank. Shape is
 * `rounded-md` (deliberately distinct from the score chip's
 * `rounded-full` pill / `rounded` square in BuildingsView) so users
 * can tell a position from a quality signal at a glance.
 */
export function RankChip({ rank, size = "default" }: RankChipProps) {
  const sizeClasses =
    size === "compact"
      ? "text-[9px] sm:text-[10px] font-semibold px-1 py-0.5 min-w-[1.4rem]"
      : "text-xs font-bold px-2 py-0.5 min-w-[1.625rem]";
  return (
    <span
      className={`inline-block rounded-md tabular-nums text-center ${sizeClasses}`}
      style={rankChipStyle(rank)}
    >
      {rank}
    </span>
  );
}
