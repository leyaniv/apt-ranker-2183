import { useTranslation } from "react-i18next";
import type { ValueStats } from "../../hooks/useValueStats";
import { useIsDesktop } from "../../hooks/useIsDesktop";

interface StatsBarProps {
  stats: ValueStats | undefined;
}

/**
 * Shows a split progress bar indicating sold vs available apartments,
 * with a sold-percentage label outside the bar.
 *
 * Desktop: rendered inline (horizontal bar between label and buttons).
 * Mobile: rendered as a thin bar below the label text.
 */
export function StatsBar({ stats }: StatsBarProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();

  if (!stats || stats.total === 0) return null;

  const soldPct = (stats.sold / stats.total) * 100;
  const availPct = (stats.available / stats.total) * 100;
  const soldPctRounded = Math.round(soldPct);

  if (isDesktop) {
    return (
      <div className="flex items-center gap-1.5 flex-1 max-w-[200px]">
        <div className="flex-1 relative h-5 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
          <div className="absolute inset-0 flex">
            <div className="bg-red-100 h-full" style={{ width: `${soldPct}%` }} />
            <div className="bg-green-100 h-full" style={{ width: `${availPct}%` }} />
          </div>
          <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-semibold">
            <span className="text-red-700">
              {t("scoring.stats.sold", { count: stats.sold })}
            </span>
            <span className="text-green-800">
              {t("scoring.stats.available", { count: stats.available })}
            </span>
          </div>
        </div>
        <span className="text-[10px] font-semibold text-red-700 whitespace-nowrap">
          {soldPctRounded}%
        </span>
      </div>
    );
  }

  // Mobile: thin bar below the label
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 relative h-3.5 rounded overflow-hidden bg-gray-100 border border-gray-200">
        <div className="absolute inset-0 flex">
          <div className="bg-red-100 h-full" style={{ width: `${soldPct}%` }} />
          <div className="bg-green-100 h-full" style={{ width: `${availPct}%` }} />
        </div>
        <div className="absolute inset-0 flex items-center justify-between px-1.5 text-[9px] font-medium">
          <span className="text-red-700">
            {t("scoring.stats.sold", { count: stats.sold })}
          </span>
          <span className="text-green-800">
            {t("scoring.stats.available", { count: stats.available })}
          </span>
        </div>
      </div>
      <span className="text-[9px] font-semibold text-red-700 whitespace-nowrap">
        {soldPctRounded}%
      </span>
    </div>
  );
}
