import { memo, useCallback } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useTranslation } from "react-i18next";
import type { RankedApartment } from "../../types";
import { ApartmentDetail } from "./ApartmentDetail";

interface ApartmentRowProps {
  ranked: RankedApartment;
  rank: number;
  isOpen: boolean;
  onToggle: (slug: string) => void;
  isDesktop: boolean;
  hasNote?: boolean;
  note?: string;
  onNoteChange?: (slug: string, text: string) => void;
  originalRank?: number;
  dropTargetSlug?: string | null;
  onDragStart?: (slug: string) => void;
  onDragOver?: (slug: string) => void;
  onDrop?: (slug: string) => void;
}

function scoreColor(score: number): string {
  if (score >= 4.2) return "bg-green-100 text-green-800";
  if (score >= 3.5) return "bg-lime-100 text-lime-800";
  if (score >= 2.8) return "bg-yellow-100 text-yellow-800";
  if (score >= 2.0) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

/**
 * A single row in the results table. Clicking expands to show full details.
 * Supports native HTML5 drag-and-drop via the grip handle.
 *
 * `open` state is lifted to the parent so a virtualized list can query
 * per-row heights; the detail view is only mounted when `isOpen` is true.
 * Renders only the matching layout for the current viewport.
 */
export const ApartmentRow = memo(function ApartmentRow({
  ranked, rank, isOpen, onToggle, isDesktop,
  hasNote, note, onNoteChange, originalRank, dropTargetSlug,
  onDragStart, onDragOver, onDrop,
}: ApartmentRowProps) {
  const { t } = useTranslation();
  const { apartment, totalScore, breakdown } = ranked;
  const slug = apartment.property_slug;
  const isDropTarget = dropTargetSlug === slug;

  const handleOpenChange = useCallback(() => onToggle(slug), [onToggle, slug]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(slug); }}
      onDrop={(e) => { e.preventDefault(); onDrop?.(slug); }}
      className={isDropTarget ? "border-t-2 border-blue-500" : ""}
    >
      <Collapsible.Root open={isOpen} onOpenChange={handleOpenChange}>
        <div className="border-b border-gray-100 last:border-b-0">
          {isDesktop ? (
            <div
              className={`grid grid-cols-[28px_50px_80px_60px_70px_70px_80px_60px_110px_90px_80px]
                          items-center gap-1 px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm
                          ${isOpen ? "bg-gray-50" : ""}`}
            >
              <span
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", slug);
                  onDragStart?.(slug);
                }}
                className="flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                title={t("results.dragHint")}
                aria-label={t("results.dragHint")}
              >
                ⠿
              </span>

              <Collapsible.Trigger className="text-start">
                <span className="text-gray-400 font-mono text-xs">
                  {rank}
                  {originalRank != null && originalRank !== rank && (
                    <span className="text-gray-300 ms-0.5" title={t("results.originalRank", { rank: originalRank })}>
                      ({originalRank})
                    </span>
                  )}
                </span>
              </Collapsible.Trigger>

              <Collapsible.Trigger className="text-center">
                <span className="text-gray-700">{apartment.buildingKey}</span>
              </Collapsible.Trigger>

              <Collapsible.Trigger className="text-center">
                <span className="text-gray-700">{apartment.apartment_number}</span>
              </Collapsible.Trigger>

              <Collapsible.Trigger className="text-center">
                <span className="text-gray-700">{apartment.rooms}</span>
              </Collapsible.Trigger>

              <Collapsible.Trigger className="text-center">
                <span className="text-gray-700">{apartment.floor}</span>
              </Collapsible.Trigger>

              <Collapsible.Trigger className="text-center">
                <span className="text-gray-600 text-xs truncate">
                  {t(`results.layout_${apartment.layout}`)}
                </span>
              </Collapsible.Trigger>

              <Collapsible.Trigger className="text-center">
                <span className="text-gray-600 text-xs truncate">{apartment.type}</span>
              </Collapsible.Trigger>

              <Collapsible.Trigger className="text-end">
                <span className="font-mono text-gray-700 text-xs">
                  ₪{apartment.price.toLocaleString("en")}
                </span>
              </Collapsible.Trigger>

              <Collapsible.Trigger className="text-end">
                <span className="text-gray-700 text-xs">
                  {apartment.area_sqm} m²
                </span>
              </Collapsible.Trigger>

              <Collapsible.Trigger className="text-center">
                <span className="inline-flex items-center gap-1">
                  <span
                    className={`text-xs font-bold rounded-full px-2 py-0.5 ${scoreColor(totalScore)}`}
                  >
                    {totalScore.toFixed(2)}
                  </span>
                  {hasNote && (
                    <span
                      className="text-amber-500 text-base font-bold leading-none cursor-default"
                      title={t("detail.hasNote")}
                    >
                      *
                    </span>
                  )}
                </span>
              </Collapsible.Trigger>
            </div>
          ) : (
            <div
              className={`flex flex-col gap-0.5 px-3 py-2.5 hover:bg-gray-50 transition-colors
                          ${isOpen ? "bg-gray-50" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", slug);
                    onDragStart?.(slug);
                  }}
                  className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0"
                  title={t("results.dragHint")}
                >
                  ⠿
                </span>
                <Collapsible.Trigger className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                  <span className="font-mono text-xs text-gray-400 w-7 shrink-0">
                    {rank}
                    {originalRank != null && originalRank !== rank && (
                      <span className="text-gray-300 ms-0.5">({originalRank})</span>
                    )}
                  </span>
                  <span className="font-medium text-sm text-gray-800 truncate flex-1">
                    {apartment.buildingKey} #{apartment.apartment_number}
                  </span>
                  <span
                    className={`text-xs font-bold rounded-full px-2 py-0.5 shrink-0 ${scoreColor(totalScore)}`}
                  >
                    {totalScore.toFixed(2)}
                  </span>
                  {hasNote && (
                    <span className="text-amber-500 text-base font-bold leading-none shrink-0" title={t("detail.hasNote")}>*</span>
                  )}
                </Collapsible.Trigger>
              </div>
              <Collapsible.Trigger className="cursor-pointer">
                <div className="flex items-center gap-2 text-[11px] text-gray-500 ps-9">
                  <span>{apartment.rooms} {t("results.rooms")}</span>
                  <span className="opacity-40">·</span>
                  <span>{t("results.floor")} {apartment.floor}</span>
                  <span className="opacity-40">·</span>
                  <span>₪{apartment.price.toLocaleString("en")}</span>
                  <span className="opacity-40">·</span>
                  <span>{apartment.area_sqm} m²</span>
                </div>
              </Collapsible.Trigger>
            </div>
          )}

          <Collapsible.Content>
            {isOpen && (
              <ApartmentDetail apartment={apartment} breakdown={breakdown} note={note} onNoteChange={onNoteChange} />
            )}
          </Collapsible.Content>
        </div>
      </Collapsible.Root>
    </div>
  );
});
