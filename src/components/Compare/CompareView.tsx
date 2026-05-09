import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { SideBySideRanking } from "./SideBySideRanking";
import { CompareDetailModal } from "./CompareDetailModal";
import { InfoTooltip } from "../Layout/InfoTooltip";
import { useIsDesktop } from "../../hooks/useIsDesktop";

const COMPARE_STORAGE_KEY = "eshel-compare-state";

interface CompareState {
  selectedIds: string[];
  selectedSlug: string | null;
  selectedProfileId: string | null;
}

function loadCompareState(): CompareState {
  try {
    const raw = sessionStorage.getItem(COMPARE_STORAGE_KEY);
    if (!raw) return { selectedIds: [], selectedSlug: null, selectedProfileId: null };
    return JSON.parse(raw);
  } catch {
    return { selectedIds: [], selectedSlug: null, selectedProfileId: null };
  }
}

function saveCompareState(state: CompareState) {
  sessionStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Compare view: select multiple profiles and see side-by-side rankings.
 */
export function CompareView() {
  const { t } = useTranslation();
  const { profiles, apartments, buckets } = useApp();
  const isDesktop = useIsDesktop();
  // Mobile screens can't fit 3+ columns of side-by-side ranking comfortably,
  // so cap selection at 2 there. Desktop fits up to 4 columns.
  const maxSelected = isDesktop ? 4 : 2;

  const [state, setState] = useState<CompareState>(loadCompareState);
  const [detailOpen, setDetailOpen] = useState(false);

  // Persist on every change
  useEffect(() => {
    saveCompareState(state);
  }, [state]);

  // Remove deleted profiles from selection
  useEffect(() => {
    const profileIds = new Set(profiles.map((p) => p.id));
    const filtered = state.selectedIds.filter((id) => profileIds.has(id));
    if (filtered.length !== state.selectedIds.length) {
      setState((prev) => ({ ...prev, selectedIds: filtered }));
    }
  }, [profiles]);

  // When the device shrinks below the desktop breakpoint, trim any extra
  // selections so we don't render 3 cramped columns.
  useEffect(() => {
    if (state.selectedIds.length > maxSelected) {
      setState((prev) => ({ ...prev, selectedIds: prev.selectedIds.slice(0, maxSelected) }));
    }
  }, [maxSelected]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIds = new Set(state.selectedIds);

  const toggleProfile = (id: string) => {
    setState((prev) => {
      const s = new Set(prev.selectedIds);
      if (s.has(id)) s.delete(id);
      else if (s.size < maxSelected) s.add(id);
      return { ...prev, selectedIds: [...s] };
    });
  };

  const setSelectedSlug = useCallback((slug: string | null) => {
    setState((prev) => ({ ...prev, selectedSlug: slug }));
  }, []);

  const setSelectedProfileId = useCallback((profileId: string | null) => {
    setState((prev) => ({ ...prev, selectedProfileId: profileId }));
  }, []);

  const clearCompare = () => {
    setState({ selectedIds: [], selectedSlug: null, selectedProfileId: null });
  };

  const selectedProfiles = profiles.filter((p) => selectedIds.has(p.id));

  // Resolve the currently focused apartment by slug (same one drawn in the
  // side-by-side bezier connectors). The detail button below is gated on
  // this being non-null.
  const selectedApartment = useMemo(
    () =>
      state.selectedSlug
        ? apartments.find((a) => a.property_slug === state.selectedSlug) ?? null
        : null,
    [apartments, state.selectedSlug],
  );

  // Map: profileId → that profile's note for the focused apartment. Built
  // here (rather than inside the modal) so we don't have to thread the raw
  // profiles list of `notes` records through.
  const notesForSelected = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    if (!selectedApartment) return map;
    for (const p of selectedProfiles) {
      map[p.id] = p.notes?.[selectedApartment.property_slug];
    }
    return map;
  }, [selectedProfiles, selectedApartment]);

  if (profiles.length < 2) {
    return (
      <div className="p-6 text-center text-gray-500">
        {t("compare.noProfiles")}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-16 sm:pb-6 max-w-5xl mx-auto w-full h-full flex flex-col gap-4 min-h-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-700">
            <span className="sm:hidden">{t("compare.titleShort")}</span>
            <span className="hidden sm:inline">{t("compare.title")}</span>
          </h2>
          <InfoTooltip text={t(isDesktop ? "compare.howToUse" : "compare.howToUseMobile")} />
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={clearCompare}
            className="sm:hidden shrink-0 px-3 py-1 text-xs rounded-md border border-gray-200
                       text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            {t("compare.clear")}
          </button>
        )}
      </div>
      {/* Profile checkboxes */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 mb-2">
            {t("compare.selectProfiles")}
          </p>
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => {
              const isChecked = selectedIds.has(p.id);
              const atLimit = selectedIds.size >= maxSelected && !isChecked;
              return (
                <label
                  key={p.id}
                  title={atLimit ? t("compare.maxSelected", { max: maxSelected }) : undefined}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md
                             border text-sm transition-colors
                             ${
                               isChecked
                                 ? "bg-blue-50 border-blue-300 text-blue-700 cursor-pointer"
                                 : atLimit
                                   ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                                   : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
                             }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={atLimit}
                    onChange={() => toggleProfile(p.id)}
                    className="rounded"
                  />
                  {p.name}
                </label>
              );
            })}
          </div>
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={clearCompare}
            className="hidden sm:block shrink-0 px-3 py-1.5 text-xs rounded-md border border-gray-200
                       text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            {t("compare.clear")}
          </button>
        )}
      </div>

      {selectedProfiles.length >= 2 && (
        <div className="flex-1 min-h-0">
          <SideBySideRanking
            profiles={selectedProfiles}
            apartments={apartments}
            buckets={buckets}
            selectedSlug={state.selectedSlug}
            selectedProfileId={state.selectedProfileId}
            onSelectedSlugChange={setSelectedSlug}
            onSelectedProfileIdChange={setSelectedProfileId}
          />
        </div>
      )}

      {selectedProfiles.length >= 2 && (
        <div className="flex-shrink-0 flex justify-center">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            disabled={!selectedApartment}
            title={
              selectedApartment
                ? undefined
                : t("compare.showDetailsTooltipDisabled")
            }
            className="px-4 py-2 text-sm rounded-md border transition-colors
                       enabled:bg-blue-50 enabled:border-blue-300 enabled:text-blue-700
                       enabled:hover:bg-blue-100
                       disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400
                       disabled:cursor-not-allowed"
          >
            {t("compare.showDetails")}
          </button>
        </div>
      )}

      {selectedProfiles.length === 1 && (
        <p className="text-sm text-gray-400 text-center">
          {t("compare.selectProfiles")}
        </p>
      )}

      {detailOpen && selectedApartment && selectedProfiles.length >= 2 && (
        <CompareDetailModal
          apartment={selectedApartment}
          apartments={apartments}
          profiles={selectedProfiles}
          buckets={buckets}
          notes={notesForSelected}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}
