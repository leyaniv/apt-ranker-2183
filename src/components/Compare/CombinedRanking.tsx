import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Apartment, Profile, BucketMap } from "../../types";
import { computeCombinedRanking } from "../../utils/scoring";

interface CombinedRankingProps {
  profiles: Profile[];
  apartments: Apartment[];
  buckets: BucketMap;
  /** Per-profile importance weight: profileId → 1–5. Missing = 3 */
  profileWeights?: Record<string, number>;
}

/**
 * Shows a unified ranking by weighted-averaging scores across all selected profiles.
 */
export function CombinedRanking({
  profiles,
  apartments,
  buckets,
  profileWeights,
}: CombinedRankingProps) {
  const { t } = useTranslation();

  const combined = useMemo(
    () => computeCombinedRanking(profiles, apartments, buckets, profileWeights),
    [profiles, apartments, buckets, profileWeights]
  );

  const profileColWidth = profiles.length <= 2 ? "80px" : "70px";
  const profileCols = profiles.map(() => profileColWidth).join(" ");
  const gridCols = `40px 70px 50px 50px 90px ${profileCols} 80px`;

  return (
    <div className="flex flex-col items-center h-full min-h-0 w-full">
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto w-fit max-w-full flex flex-col min-h-0">
        {/* Header */}
        <div
          className="flex-shrink-0 grid items-center gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase"
          style={{ gridTemplateColumns: gridCols }}
        >
          <span>#</span>
          <span className="text-center">{t("results.building")}</span>
          <span className="text-center">{t("results.apt")}</span>
          <span className="text-center">{t("results.rooms")}</span>
          <span className="text-center">{t("results.price")}</span>
          {profiles.map((p) => {
            const w = profileWeights?.[p.id] ?? 3;
            const total = profiles.reduce((s, pr) => s + (profileWeights?.[pr.id] ?? 3), 0);
            const pct = total > 0 ? Math.round((w / total) * 100) : 0;
            return (
              <span key={p.id} className="text-center truncate" title={p.name}>
                {p.name} <span className="text-gray-400 normal-case">({pct}%)</span>
              </span>
            );
          })}
          <span className="text-center">{t("compare.avgScore")}</span>
        </div>

        {/* Rows */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {combined.slice(0, 50).map((item, idx) => (
            <div
              key={item.apartment.property_slug}
              className="grid items-center gap-2 px-4 py-2 border-t border-gray-100 text-sm"
              style={{ gridTemplateColumns: gridCols }}
            >
              <span className="text-gray-400 font-mono text-xs">{idx + 1}</span>
              <span className="text-center text-gray-600">
                {item.apartment.buildingKey}
              </span>
              <span className="text-center text-gray-600">
                {item.apartment.apartment_number}
              </span>
              <span className="text-center text-gray-600">
                {item.apartment.rooms}
              </span>
              <span className="text-center font-mono text-xs text-gray-600">
                ₪{item.apartment.price.toLocaleString("en")}
              </span>
              {item.perProfile.map((score, i) => (
                <span
                  key={profiles[i].id}
                  className="text-center text-xs text-gray-500"
                >
                  {score.toFixed(2)}
                </span>
              ))}
              <span className="text-center font-bold text-blue-600">
                {item.avgScore.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
