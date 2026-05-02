import {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { useTranslation } from "react-i18next";
import type { Apartment, Profile, BucketMap, RankedApartment } from "../../types";
import { rankApartments } from "../../utils/scoring";
import { useApp } from "../../context/AppContext";

interface SideBySideRankingProps {
  profiles: Profile[];
  apartments: Apartment[];
  buckets: BucketMap;
  selectedSlug: string | null;
  selectedProfileId: string | null;
  onSelectedSlugChange: (slug: string | null) => void;
  onSelectedProfileIdChange: (profileId: string | null) => void;
}

interface LineCoord {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function SideBySideRanking({
  profiles,
  apartments,
  buckets,
  selectedSlug,
  selectedProfileId,
  onSelectedSlugChange,
  onSelectedProfileIdChange,
}: SideBySideRankingProps) {
  const { t } = useTranslation();
  const { settings } = useApp();
  const showSold = settings.showSold;
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [lines, setLines] = useState<LineCoord[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const columnScrollRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const rafRef = useRef<number>(0);

  const activeSlug = selectedSlug ?? hoveredSlug;

  // Full ranked list per profile
  const profileRankedLists = useMemo(() => {
    const map = new Map<string, RankedApartment[]>();
    for (const profile of profiles) {
      map.set(
        profile.id,
        rankApartments(apartments, profile.scores, profile.weights, buckets),
      );
    }
    return map;
  }, [profiles, apartments, buckets]);

  // Quick rank lookup: profileId → slug → rank (1-based among non-sold).
  // Sold apartments map to `null` so the delta indicator can hide for them.
  const rankLookup = useMemo(() => {
    const map = new Map<string, Map<string, number | null>>();
    for (const [profileId, ranked] of profileRankedLists) {
      const slugMap = new Map<string, number | null>();
      let counter = 0;
      ranked.forEach((r) => {
        if (r.apartment.isSold) {
          slugMap.set(r.apartment.property_slug, null);
        } else {
          counter += 1;
          slugMap.set(r.apartment.property_slug, counter);
        }
      });
      map.set(profileId, slugMap);
    }
    return map;
  }, [profileRankedLists]);

  // Per-profile set of slugs excluded by that profile's score-0 vetoes.
  // Used to surface an "excluded" banner in the column when the user selects
  // an apartment that one of the profiles has filtered out — otherwise the
  // bezier line would dead-end into nothing.
  const excludedLookup = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [profileId, ranked] of profileRankedLists) {
      const visible = new Set(ranked.map((r) => r.apartment.property_slug));
      const excluded = new Set<string>();
      for (const apt of apartments) {
        if (!visible.has(apt.property_slug)) excluded.add(apt.property_slug);
      }
      map.set(profileId, excluded);
    }
    return map;
  }, [profileRankedLists, apartments]);

  // Apartment lookup for rendering the excluded-banner.
  const apartmentBySlug = useMemo(() => {
    const map = new Map<string, Apartment>();
    for (const apt of apartments) map.set(apt.property_slug, apt);
    return map;
  }, [apartments]);

  /* ── Bezier lines ───────────────────────────── */

  const updateLines = useCallback(() => {
    if (!activeSlug || !containerRef.current || profiles.length < 2) {
      setLines([]);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const newLines: LineCoord[] = [];

    for (let i = 0; i < profiles.length - 1; i++) {
      const fromEl = rowRefs.current.get(`${profiles[i].id}:${activeSlug}`);
      const toEl = rowRefs.current.get(`${profiles[i + 1].id}:${activeSlug}`);
      if (!fromEl || !toEl) continue;

      const fromCol = columnScrollRefs.current.get(profiles[i].id);
      const toCol = columnScrollRefs.current.get(profiles[i + 1].id);
      if (!fromCol || !toCol) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      const fromColRect = fromCol.getBoundingClientRect();
      const toColRect = toCol.getBoundingClientRect();

      // Only draw when both rows are visible in their columns
      const fromVisible =
        fromRect.bottom > fromColRect.top && fromRect.top < fromColRect.bottom;
      const toVisible =
        toRect.bottom > toColRect.top && toRect.top < toColRect.bottom;
      if (!fromVisible || !toVisible) continue;

      // Clamp Y to column bounds
      const clampY = (rect: DOMRect, colRect: DOMRect) =>
        Math.max(
          colRect.top,
          Math.min(colRect.bottom, rect.top + rect.height / 2),
        ) - containerRect.top;

      // Pick inner edges (handles both LTR and RTL layouts)
      const fromCx = fromRect.left + fromRect.width / 2;
      const toCx = toRect.left + toRect.width / 2;
      const x1 =
        (fromCx < toCx ? fromRect.right : fromRect.left) - containerRect.left;
      const x2 =
        (fromCx < toCx ? toRect.left : toRect.right) - containerRect.left;

      newLines.push({
        x1,
        y1: clampY(fromRect, fromColRect),
        x2,
        y2: clampY(toRect, toColRect),
      });
    }

    setLines(newLines);
  }, [activeSlug, profiles]);

  const scheduleUpdateLines = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(updateLines);
  }, [updateLines]);

  // Re-calc lines on scroll / resize
  useEffect(() => {
    scheduleUpdateLines();
    const cols = Array.from(columnScrollRefs.current.values());
    for (const col of cols)
      col.addEventListener("scroll", scheduleUpdateLines, { passive: true });
    window.addEventListener("resize", scheduleUpdateLines);
    return () => {
      cancelAnimationFrame(rafRef.current);
      for (const col of cols)
        col.removeEventListener("scroll", scheduleUpdateLines);
      window.removeEventListener("resize", scheduleUpdateLines);
    };
  }, [scheduleUpdateLines]);

  /* ── Auto-scroll on selection ───────────────── */

  useEffect(() => {
    if (!selectedSlug) return;
    for (const profile of profiles) {
      const colEl = columnScrollRefs.current.get(profile.id);
      const rowEl = rowRefs.current.get(`${profile.id}:${selectedSlug}`);
      if (!colEl || !rowEl) continue;
      const rowTop = rowEl.offsetTop;
      const colHeight = colEl.clientHeight;
      const rowHeight = rowEl.clientHeight;
      colEl.scrollTo({
        top: rowTop - colHeight / 2 + rowHeight / 2,
        behavior: "smooth",
      });
    }
    // Safety update after scroll animation settles
    const timer = setTimeout(scheduleUpdateLines, 400);
    return () => clearTimeout(timer);
  }, [selectedSlug, profiles, scheduleUpdateLines]);

  /* ── Handlers ───────────────────────────────── */

  const handleClick = (slug: string, profileId: string) => {
    if (selectedSlug === slug) {
      onSelectedSlugChange(null);
      onSelectedProfileIdChange(null);
    } else {
      onSelectedSlugChange(slug);
      onSelectedProfileIdChange(profileId);
    }
  };

  /* ── Render ─────────────────────────────────── */

  return (
    <div ref={containerRef} className="relative h-full flex flex-col">

      {/* SVG overlay for bezier connecting lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10 }}
      >
        {lines.map((c, i) => {
          const dx = (c.x2 - c.x1) * 0.4;
          return (
            <path
              key={i}
              d={`M ${c.x1} ${c.y1} C ${c.x1 + dx} ${c.y1}, ${c.x2 - dx} ${c.y2}, ${c.x2} ${c.y2}`}
              stroke="var(--color-primary)"
              strokeWidth={selectedSlug ? 2.5 : 1.5}
              fill="none"
              opacity={selectedSlug ? 0.8 : 0.35}
            />
          );
        })}
      </svg>

      {/* Columns */}
      <div className="flex gap-6 flex-1 min-h-0">
        {profiles.map((profile) => {
          const ranked = profileRankedLists.get(profile.id) ?? [];
          const visible = showSold ? ranked : ranked.filter((r) => !r.apartment.isSold);
          const excludedSet = excludedLookup.get(profile.id);
          // True when the user's clicked apt has been vetoed by this profile.
          const selectedIsExcluded =
            !!selectedSlug && !!excludedSet?.has(selectedSlug);
          const excludedApt = selectedIsExcluded
            ? apartmentBySlug.get(selectedSlug!)
            : null;
          let availableCounter = 0;
          return (
            <div key={profile.id} className="flex-1 min-w-0 flex flex-col min-h-0">
              {/* Column header */}
              <div className="text-xs font-semibold text-center text-gray-600 mb-2 truncate">
                {profile.name}
              </div>

              {/* Scrollable apartment list */}
              <div
                ref={(el) => {
                  if (el) columnScrollRefs.current.set(profile.id, el);
                  else columnScrollRefs.current.delete(profile.id);
                }}
                className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-gray-200 bg-white"
              >
                {/* Excluded banner — sticky at the top of the column when the
                    selected apartment is vetoed by this profile. The bezier
                    line anchors to it via the same `rowRefs` key as a normal
                    row, so the user gets a clear visual link instead of a
                    dead-end. */}
                {excludedApt && (
                  <div
                    ref={(el) => {
                      const k = `${profile.id}:${selectedSlug}`;
                      if (el) rowRefs.current.set(k, el);
                      else rowRefs.current.delete(k);
                    }}
                    onClick={() => handleClick(selectedSlug!, profile.id)}
                    className="sticky top-0 z-10 px-3 py-2 cursor-pointer
                               bg-red-50 border-b-2 border-red-300 text-sm
                               ring-2 ring-red-300 ring-inset
                               dark:bg-red-900/30"
                    title={t("compare.excludedByProfileTip")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-red-500 w-7 shrink-0 text-center">
                        ✕
                      </span>
                      <span className="font-medium truncate flex-1 text-xs text-red-700 dark:text-red-300">
                        {excludedApt.buildingKey} #{excludedApt.apartment_number}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-red-600 dark:text-red-400 font-medium">
                      {t("compare.excludedByProfile")}
                    </div>
                  </div>
                )}
                {visible.map((item) => {
                  const slug = item.apartment.property_slug;
                  const isSold = item.apartment.isSold;
                  if (!isSold) availableCounter += 1;
                  const rank: number | null = isSold ? null : availableCounter;
                  const isSelected = selectedSlug === slug;
                  const isHovered = hoveredSlug === slug && !isSelected;
                  const isActive = activeSlug === slug;

                  // Rank delta vs the clicked profile. Only meaningful when
                  // both endpoints have a numeric rank (i.e. neither is sold).
                  const originRank = selectedProfileId
                    ? rankLookup.get(selectedProfileId)?.get(slug)
                    : rank;
                  const delta =
                    originRank != null && rank != null ? originRank - rank : 0;
                  const showDelta =
                    isSelected &&
                    selectedProfileId !== profile.id &&
                    originRank != null &&
                    rank != null &&
                    delta !== 0;

                  return (
                    <div
                      key={slug}
                      ref={(el) => {
                        const k = `${profile.id}:${slug}`;
                        if (el) rowRefs.current.set(k, el);
                        else rowRefs.current.delete(k);
                      }}
                      onClick={() => handleClick(slug, profile.id)}
                      onMouseEnter={() => setHoveredSlug(slug)}
                      onMouseLeave={() => setHoveredSlug(null)}
                      className={[
                        "sbs-row px-3 py-2 border-b border-gray-50 cursor-pointer transition-colors text-sm",
                        isSold && "opacity-60",
                        isSelected &&
                          "bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-400 ring-inset",
                        isHovered && "bg-blue-50 dark:bg-blue-900/20",
                        !isActive && "hover:bg-gray-50",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-400 w-7 shrink-0">
                          {rank == null ? "—" : `#${rank}`}
                        </span>
                        <span className="font-medium truncate flex-1 text-xs">
                          {item.apartment.buildingKey} #
                          {item.apartment.apartment_number}
                        </span>
                        {isSold && (
                          <span
                            className="text-[10px] font-semibold rounded px-1 py-0.5 bg-gray-200 text-gray-600 dark:text-gray-800 shrink-0"
                            title={t("results.soldTooltip")}
                          >
                            {t("results.sold")}
                          </span>
                        )}
                        <span className="text-xs text-blue-600 font-bold shrink-0">
                          {item.totalScore.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                        <span>
                          {item.apartment.rooms} {t("results.rooms")}
                        </span>
                        <span className="opacity-40">·</span>
                        <span>
                          ₪{item.apartment.price.toLocaleString("en")}
                        </span>
                        {showDelta && (
                          <span
                            className={`ms-auto font-semibold text-xs ${
                              delta > 0
                                ? "text-green-600"
                                : "text-red-500"
                            }`}
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
