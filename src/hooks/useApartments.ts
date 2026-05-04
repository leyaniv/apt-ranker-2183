import { useState, useEffect } from "react";
import type { Apartment, BucketMap, ParameterConfig, RawApartment } from "../types";
import { cleanApartments } from "../utils/dataCleaning";
import { computeAllBuckets } from "../utils/bucketing";
import { hydrateParameterConfigs } from "../utils/parameterConfigs";

interface UseApartmentsResult {
  /** Lottery (regular) apartments — these drive ranking and every view
   *  except the Buildings view. */
  apartments: Apartment[];
  /** Open-market ("שיווק חופשי") apartments. Always loaded, but only
   *  surfaced by the Buildings view. They have no price / area / type and
   *  cannot be ranked. */
  freeMarketingApartments: Apartment[];
  buckets: BucketMap;
  parameterConfigs: ParameterConfig[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches apartment data, cleans it, computes buckets, and
 * hydrates parameter configs. All in one hook.
 *
 * Open-market units are split out into `freeMarketingApartments` so the
 * rest of the app (scoring, list, compare, print) can ignore them while
 * the Buildings view still has access.
 */
export function useApartments(): UseApartmentsResult {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [freeMarketingApartments, setFreeMarketingApartments] = useState<Apartment[]>([]);
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
        const lottery = cleanedAll.filter((apt) => !apt.isFreeMarketing);
        const freeMarketing = cleanedAll.filter((apt) => apt.isFreeMarketing);
        const bucketMap = computeAllBuckets(lottery);
        const configs = hydrateParameterConfigs(bucketMap, lottery);

        setApartments(lottery);
        setFreeMarketingApartments(freeMarketing);
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

  return { apartments, freeMarketingApartments, buckets, parameterConfigs, loading, error };
}
