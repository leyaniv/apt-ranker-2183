import { useState, useEffect } from "react";
import type { Apartment, BucketMap, ParameterConfig, RawApartment } from "../types";
import { cleanApartments } from "../utils/dataCleaning";
import { computeAllBuckets } from "../utils/bucketing";
import { hydrateParameterConfigs } from "../utils/parameterConfigs";

interface UseApartmentsResult {
  apartments: Apartment[];
  buckets: BucketMap;
  parameterConfigs: ParameterConfig[];
  loading: boolean;
  error: string | null;
}

/**
 * Free-marketing apartments ("שיווק חופשי") are open-market sales rather than
 * lottery units. The scraper includes them with API-only data (no price, no
 * area, no PDFs), so they have nothing to score on. We hide them from the
 * entire UI for now via this flag. Flip to `true` to expose them again
 * (and revisit bucketing — they'll currently lack price/area).
 */
const SHOW_FREE_MARKETING = false;

/**
 * Fetches apartment data, cleans it, computes buckets, and
 * hydrates parameter configs. All in one hook.
 */
export function useApartments(): UseApartmentsResult {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [buckets, setBuckets] = useState<BucketMap>({});
  const [parameterConfigs, setParameterConfigs] = useState<ParameterConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/data/apartments.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw: RawApartment[] = await res.json();

        if (cancelled) return;

        const cleanedAll = cleanApartments(raw);
        const cleaned = SHOW_FREE_MARKETING
          ? cleanedAll
          : cleanedAll.filter((apt) => !apt.isFreeMarketing);
        const bucketMap = computeAllBuckets(cleaned);
        const configs = hydrateParameterConfigs(bucketMap, cleaned);

        setApartments(cleaned);
        setBuckets(bucketMap);
        setParameterConfigs(configs);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { apartments, buckets, parameterConfigs, loading, error };
}
