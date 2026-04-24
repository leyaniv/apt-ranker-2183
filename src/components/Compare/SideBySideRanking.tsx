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

  // Quick rank lookup: profileId → slug → rank (1-based)
  const rankLookup = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const [profileId, ranked] of profileRankedLists) {
      const slugMap = new Map<string, number>();
      ranked.forEach((r, idx) =>
        slugMap.set(r.apartment.property_slug, idx + 1),
      );
      map.set(profileId, slugMap);
    }
    return map;
  }, [profileRankedLists]);

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
                {ranked.map((item, idx) => {
                  const slug = item.apartment.property_slug;
                  const isSelected = selectedSlug === slug;
                  const isHovered = hoveredSlug === slug && !isSelected;
                  const isActive = activeSlug === slug;
                  const rank = idx + 1;

                  // Rank delta vs the clicked profile
                  // Positive delta = ranks higher (better) in this profile
                  const originRank = selectedProfileId
                    ? rankLookup.get(selectedProfileId)?.get(slug) ?? rank
                    : rank;
                  const delta = originRank - rank;
                  const showDelta = isSelected && selectedProfileId !== profile.id && delta !== 0;

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
                          #{rank}
                        </span>
                        <span className="font-medium truncate flex-1 text-xs">
                          {item.apartment.buildingKey} #
                          {item.apartment.apartment_number}
                        </span>
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
