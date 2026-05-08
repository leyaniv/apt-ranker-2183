"""
Eshel Haifa Apartment Scraper
Scrapes apartment data from haifa.eshelltd.co.il lottery 771 using:
  1. WP REST API to list properties and resolve taxonomy IDs
  2. Detail page scraping for full apartment data + PDF links
  3. PDF downloading with deduplication
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://haifa.eshelltd.co.il"
API_URL = f"{BASE_URL}/wp-json/wp/v2"
LOTTERY_TERM_ID = 771
REQUEST_DELAY = 0.5  # seconds between requests
SCRAPER_DIR = Path(__file__).parent
REPO_ROOT = SCRAPER_DIR.parent.parent
PDFS_DIR = SCRAPER_DIR / "pdfs"
OUTPUT_JSON = REPO_ROOT / "data" / "apartments.json"
PARKING_JSON = REPO_ROOT / "data" / "parking.json"
ARCHIVE_DIR = REPO_ROOT / "data" / "archive"

session = requests.Session()
session.headers.update({
    "User-Agent": "EshelScraper/1.0 (apartment research)",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.5",
})


# ---------------------------------------------------------------------------
# Phase 2: API — List Properties & Resolve Taxonomies
# ---------------------------------------------------------------------------

def resolve_taxonomy(taxonomy_name: str) -> dict[int, str]:
    """Fetch all terms for a taxonomy, return {term_id: term_name}."""
    terms = {}
    page = 1
    while True:
        url = f"{API_URL}/{taxonomy_name}"
        resp = session.get(url, params={"per_page": 100, "page": page})
        resp.raise_for_status()
        data = resp.json()
        if not data:
            break
        for term in data:
            terms[term["id"]] = term["name"]
        # Check if there are more pages
        total_pages = int(resp.headers.get("X-WP-TotalPages", 1))
        if page >= total_pages:
            break
        page += 1
        time.sleep(REQUEST_DELAY)
    return terms


def resolve_all_taxonomies() -> dict[str, dict[int, str]]:
    """Resolve all relevant taxonomy term IDs to human-readable labels."""
    taxonomy_names = ["status", "air_direction", "rooms", "floor", "earth", "house_number", "remarks"]
    taxonomies = {}
    for name in taxonomy_names:
        print(f"  Resolving taxonomy: {name}...", end=" ")
        taxonomies[name] = resolve_taxonomy(name)
        print(f"{len(taxonomies[name])} terms")
        time.sleep(REQUEST_DELAY)
    return taxonomies


def fetch_all_properties() -> list[dict]:
    """Paginate through the WP REST API to get all properties for the lottery."""
    all_properties = []
    page = 1
    while True:
        print(f"  Fetching properties page {page}...")
        resp = session.get(f"{API_URL}/property", params={
            "lottery": LOTTERY_TERM_ID,
            "per_page": 100,
            "page": page,
        })
        if resp.status_code == 400:
            # Past last page
            break
        resp.raise_for_status()
        data = resp.json()
        if not data:
            break
        all_properties.extend(data)
        total_pages = int(resp.headers.get("X-WP-TotalPages", 1))
        if page >= total_pages:
            break
        page += 1
        time.sleep(REQUEST_DELAY)
    return all_properties


# Statuses we want to include in the exported dataset. 'פנוי' = available,
# 'נמכר' = sold. Sold units are still scraped so the UI can display them
# (with a strikethrough / muted styling) and so we can diff against earlier
# snapshots.
#
# 'שיווק חופשי' = free marketing (open-market sales, not lottery). These are
# included for completeness but only via the API — we skip the detail page
# (and therefore PDFs) since the webapp currently filters them out anyway.
INCLUDED_STATUSES = {"פנוי", "נמכר", "שיווק חופשי"}
FREE_MARKETING_STATUS = "שיווק חופשי"
DETAIL_SCRAPE_STATUSES = {"פנוי", "נמכר"}

# Manual overrides for source-data errors on the contractor's site.
# Map from property_slug -> corrected air_direction string.
# Add entries here when the published data is wrong; verified against floor plans.
AIR_DIRECTION_OVERRIDES: dict[str, str] = {
    # 100308: contractor lists צפון-מערב, but the apartment actually faces צפון-מזרח.
    "100308": "צפון-מזרח",
}

# Manual overrides for remarks taxonomy errors.
# Map from property_slug -> corrected remarks string.
REMARKS_OVERRIDES: dict[str, str] = {
    # 100291: listed as דירת גן but is actually a regular דירה.
    "100291": "דירה",
}


def filter_available(properties: list[dict], status_terms: dict[int, str]) -> list[dict]:
    """Filter properties to those whose status is in INCLUDED_STATUSES."""
    included_term_ids = {tid for tid, name in status_terms.items() if name in INCLUDED_STATUSES}
    if not included_term_ids:
        print(f"  WARNING: Could not find any of {INCLUDED_STATUSES} in status terms: {status_terms}")
        print("  Returning all properties unfiltered.")
        return properties

    filtered = []
    for prop in properties:
        prop_status_ids = set(prop.get("status", []))
        if prop_status_ids & included_term_ids:
            filtered.append(prop)
    return filtered


# ---------------------------------------------------------------------------
# Phase 3: Scrape Detail Pages
# ---------------------------------------------------------------------------

def parse_detail_page(html: str, property_slug: str, *, parse_pdfs: bool = True) -> dict:
    """Parse an apartment detail page and extract all fields + PDF links.

    When ``parse_pdfs`` is False, PDF link extraction is skipped — useful for
    'שיווק חופשי' (open-market) units where we don't want PDFs in the
    output and don't want them downloaded.
    """
    soup = BeautifulSoup(html, "lxml")
    data = {"property_slug": property_slug}

    page_text = soup.get_text(" ", strip=True)

    # --- Header: "דירת 3 חדרים | קומה 5 | טיפוס B3-1₪1,081,736" ---
    header_match = re.search(
        r'דירת\s+([\d.]+)\s+חדרים\s*\|\s*קומה\s+([\d,\-]+)\s*\|\s*טיפוס\s+([\w\-\s]+?)₪([\d,]+)',
        page_text
    )
    if header_match:
        data["rooms"] = header_match.group(1)
        data["floor"] = header_match.group(2).strip()
        data["type"] = header_match.group(3).strip()
        price_str = header_match.group(4).replace(",", "")
        data["price"] = int(price_str) if price_str else 0
    else:
        # Try without price (₪0 cases may format differently)
        header_match2 = re.search(
            r'דירת\s+([\d.]+)\s+חדרים\s*\|\s*קומה\s+([\d,\-]+)\s*\|\s*טיפוס\s+([\w\-\s]+?)₪(\d*)',
            page_text
        )
        if header_match2:
            data["rooms"] = header_match2.group(1)
            data["floor"] = header_match2.group(2).strip()
            data["type"] = header_match2.group(3).strip()
            price_str = header_match2.group(4).replace(",", "")
            data["price"] = int(price_str) if price_str else 0

    # --- Area: "שטח דירה:78.98 מ"ר + מרפסת\גינה: 9.02 מ"ר" ---
    area_match = re.search(r'שטח דירה:\s*([\d.]+)\s*מ"ר', page_text)
    if area_match:
        data["area_sqm"] = float(area_match.group(1))

    balcony_match = re.search(r'מרפסת\\?גינה:\s*([\d.]+)\s*מ"ר', page_text)
    if balcony_match:
        data["balcony_area_sqm"] = float(balcony_match.group(1))

    # --- Storage: "מחסן בשטח: 4.67 מ"ר מספר מחסן: מ-17" ---
    storage_area_match = re.search(r'מחסן בשטח:\s*([\d.]+)\s*מ"ר', page_text)
    if storage_area_match:
        data["storage_area_sqm"] = float(storage_area_match.group(1))

    storage_id_match = re.search(r'מספר מחסן:\s*([^\|]+)', page_text)
    if storage_id_match:
        data["storage_id"] = storage_id_match.group(1).strip()

    # --- Parking: "חנויות מספר: 2" ---
    parking_match = re.search(r'חנויות מספר:\s*(\d+)', page_text)
    if parking_match:
        data["parking_count"] = int(parking_match.group(1))

    # --- Footer: "בניין: 6דירה: 18טיפוס: B3-1" ---
    building_match = re.search(r'בניין:\s*(\d+)', page_text)
    if building_match:
        data["building"] = int(building_match.group(1))

    apt_match = re.search(r'דירה:\s*(\d+)', page_text)
    if apt_match:
        data["apartment_number"] = int(apt_match.group(1))

    # --- PDF links ---
    # Canonical URL fields end with `_url`. The matching non-suffixed key
    # (e.g. `pdf_apartment_plan`) is reserved for the local relative path,
    # populated later by `map_pdf_local_paths` when PDFs are downloaded.
    # If --skip-pdfs is used, only the `_url` fields exist, which is what
    # the webapp consumes.
    if parse_pdfs:
        pdf_other_urls: list[str] = []
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if not href.lower().endswith(".pdf"):
                continue
            link_text = a_tag.get_text(strip=True)
            if "תכנית דירה" in link_text or "תוכנית דירה" in link_text:
                data["pdf_apartment_plan_url"] = href
            elif "תכנית קומות" in link_text or "תוכנית קומות" in link_text:
                data["pdf_floor_plan_url"] = href
            elif "חניה" in link_text or "מחסנים" in link_text:
                data["pdf_parking_storage_url"] = href
            elif "פיתוח" in link_text and "צבעונית" in link_text:
                data["pdf_development_url"] = href
            else:
                pdf_other_urls.append(href)

        if pdf_other_urls:
            data["pdf_other_urls"] = pdf_other_urls

    return data


def _attach_api_taxonomy_ids(detail: dict, prop: dict) -> None:
    """Stash raw taxonomy IDs on the detail record for later enrichment."""
    detail["_api_status_ids"] = prop.get("status", [])
    detail["_api_air_direction_ids"] = prop.get("air_direction", [])
    detail["_api_earth_ids"] = prop.get("earth", [])
    detail["_api_remarks_ids"] = prop.get("remarks", [])


def scrape_detail_pages(properties: list[dict], status_terms: dict[int, str]) -> list[dict]:
    """Fetch and parse each property's detail page.

    For 'שיווק חופשי' (open-market) units we still fetch the detail page —
    it carries the same fields (building, apartment#, rooms, floor, area,
    balcony, storage, parking, type) — but we skip PDF link parsing. PDFs
    won't be downloaded for them either (collect_unique_pdfs only sees URL
    fields that aren't set).
    """
    free_marketing_term_ids = {tid for tid, name in status_terms.items() if name == FREE_MARKETING_STATUS}

    apartments = []
    total = len(properties)
    for i, prop in enumerate(properties, 1):
        slug = prop["slug"]
        url = prop["link"]
        prop_status_ids = set(prop.get("status", []))
        is_free_marketing = bool(prop_status_ids & free_marketing_term_ids)
        tag = " (שיווק חופשי, no PDFs)" if is_free_marketing else ""

        print(f"  [{i}/{total}] Scraping {slug}{tag}...", end=" ")
        try:
            resp = session.get(url, timeout=30)
            resp.raise_for_status()
            detail = parse_detail_page(resp.text, slug, parse_pdfs=not is_free_marketing)
            _attach_api_taxonomy_ids(detail, prop)
            detail["detail_url"] = url

            apartments.append(detail)
            field_count = sum(1 for k, v in detail.items() if v is not None and not k.startswith("_"))
            print(f"OK ({field_count} fields)")
        except Exception as e:
            print(f"ERROR: {e}")

        time.sleep(REQUEST_DELAY)
    return apartments


# ---------------------------------------------------------------------------
# Phase 4: Download PDFs
# ---------------------------------------------------------------------------

def collect_unique_pdfs(apartments: list[dict]) -> dict[str, str]:
    """Collect all unique PDF URLs and compute local paths. Returns {url: local_path}."""
    url_keys = [
        "pdf_apartment_plan_url",
        "pdf_floor_plan_url",
        "pdf_parking_storage_url",
        "pdf_development_url",
    ]
    url_to_local = {}

    def _register(url: str) -> None:
        if not url or url in url_to_local:
            return
        parsed = urlparse(url)
        path_part = parsed.path
        if "/files/" in path_part:
            relative = path_part.split("/files/", 1)[1]
        else:
            relative = path_part.lstrip("/")
        url_to_local[url] = str(PDFS_DIR / relative)

    for apt in apartments:
        for key in url_keys:
            _register(apt.get(key) or "")
        for url in apt.get("pdf_other_urls", []) or []:
            _register(url)

    return url_to_local


def download_pdfs(url_to_local: dict[str, str]) -> int:
    """Download all PDFs, skipping already-downloaded files. Returns count of new downloads."""
    downloaded = 0
    total = len(url_to_local)

    for i, (url, local_path) in enumerate(url_to_local.items(), 1):
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            print(f"  [{i}/{total}] Skipping (exists): {os.path.basename(local_path)}")
            continue

        print(f"  [{i}/{total}] Downloading {os.path.basename(local_path)}...", end=" ")
        try:
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            resp = session.get(url, timeout=60)
            resp.raise_for_status()
            with open(local_path, "wb") as f:
                f.write(resp.content)
            downloaded += 1
            print(f"OK ({len(resp.content) // 1024} KB)")
        except Exception as e:
            print(f"ERROR: {e}")

        time.sleep(REQUEST_DELAY)

    return downloaded


def map_pdf_local_paths(apartments: list[dict], url_to_local: dict[str, str]) -> None:
    """Populate local-path fields (`pdf_apartment_plan`, etc.) from `*_url` fields.

    The `*_url` fields are the canonical URL location and remain untouched.
    Only the non-suffixed keys are filled here, with relative paths to the
    downloaded PDFs.
    """
    url_to_local_key = {
        "pdf_apartment_plan_url": "pdf_apartment_plan",
        "pdf_floor_plan_url": "pdf_floor_plan",
        "pdf_parking_storage_url": "pdf_parking_storage",
        "pdf_development_url": "pdf_development",
    }
    for apt in apartments:
        for url_key, local_key in url_to_local_key.items():
            url = apt.get(url_key)
            if url and url in url_to_local:
                apt[local_key] = os.path.relpath(url_to_local[url], SCRAPER_DIR)

        other_urls = apt.get("pdf_other_urls", []) or []
        if other_urls:
            apt["pdf_other"] = [
                os.path.relpath(url_to_local[u], SCRAPER_DIR)
                for u in other_urls if u in url_to_local
            ]


# ---------------------------------------------------------------------------
# Phase 5a: Enrich with parking data
# ---------------------------------------------------------------------------

# Apartment statuses that are expected to appear in the parking table. Open-
# market ('שיווק חופשי') units are documented in a separate section of the
# contractor's parking PDFs and are intentionally NOT in parking.json.
PARKING_TABLE_STATUSES = {"פנוי", "נמכר"}


PARKING_SPOT_FIELDS = ("parking_spot_1", "parking_spot_2")


def load_parking_records() -> list[dict]:
    """Load and lightly validate the manually-transcribed parking table.

    parking.json is a flat array of records:
        {"lot": 207, "building": 1, "apartment": 1,
         "parking_spot_1": 60, "parking_spot_2": 59}
    The two spot fields mirror the source's column names — ``parking_spot_1``
    comes from ``מס׳ חניה 1`` and ``parking_spot_2`` from ``מס׳ חניה 2``. The
    column order is preserved (not sorted ascending) because the source PDFs
    distinguish them. Apartments with a single covered parking spot would
    only have ``parking_spot_1`` set; the current source only documents
    two-spot apartments.
    """
    if not PARKING_JSON.exists():
        raise FileNotFoundError(f"parking.json not found at {PARKING_JSON}")

    with open(PARKING_JSON, "r", encoding="utf-8") as f:
        records = json.load(f)

    if not isinstance(records, list):
        raise ValueError("parking.json must be a JSON array")

    seen_keys: set[tuple[int, int, int]] = set()
    for i, rec in enumerate(records):
        for field in ("lot", "building", "apartment"):
            if field not in rec:
                raise ValueError(f"parking.json record {i}: missing field {field!r}")
        key = (int(rec["lot"]), int(rec["building"]), int(rec["apartment"]))
        if key in seen_keys:
            raise ValueError(f"parking.json record {i}: duplicate key {key}")
        seen_keys.add(key)

        spots_present = [f for f in PARKING_SPOT_FIELDS if f in rec]
        if not spots_present:
            raise ValueError(f"parking.json record {i}: must have at least one of {PARKING_SPOT_FIELDS}")
        for f in spots_present:
            if not isinstance(rec[f], int):
                raise ValueError(f"parking.json record {i}: {f} must be an int")

    return records


def validate_parking_consistency(apartments: list[dict], parking_records: list[dict]) -> tuple[list[str], list[str]]:
    """Cross-check parking.json against the (already enriched) apartments list.

    Returns ``(errors, warnings)``. Errors block the scrape because they
    indicate a real data integrity problem; warnings are informational
    (e.g. apartments still missing from parking.json while we wait for
    additional source pages).
    """
    apt_index: dict[tuple[int, int, int], dict] = {}
    for apt in apartments:
        try:
            key = (int(apt.get("lot")), int(apt.get("building")), int(apt.get("apartment_number")))
        except (TypeError, ValueError):
            continue
        apt_index[key] = apt

    parking_keys = {(r["lot"], r["building"], r["apartment"]) for r in parking_records}

    errors: list[str] = []
    warnings: list[str] = []

    # 1. Every parking record must point at a known apartment.
    for rec in parking_records:
        key = (rec["lot"], rec["building"], rec["apartment"])
        apt = apt_index.get(key)
        if apt is None:
            errors.append(f"parking.json {key}: no matching apartment in apartments.json")
            continue
        status = apt.get("status")
        if status == FREE_MARKETING_STATUS:
            errors.append(
                f"parking.json {key}: apartment status is '{FREE_MARKETING_STATUS}' "
                f"(parking PDFs document open-market units in a separate section)"
            )
        spot_count = sum(1 for f in PARKING_SPOT_FIELDS if f in rec)
        if apt.get("parking_count") != spot_count:
            warnings.append(
                f"parking.json {key}: parking_count={apt.get('parking_count')} "
                f"but parking.json has {spot_count} spot(s)"
            )

    # 2. Apartments that *should* have parking info but don't.
    expected_keys = set()
    for apt in apartments:
        if apt.get("parking_count") != 2:
            continue
        if apt.get("status") in PARKING_TABLE_STATUSES:
            try:
                expected_keys.add((int(apt["lot"]), int(apt["building"]), int(apt["apartment_number"])))
            except (TypeError, ValueError):
                continue

    missing = sorted(expected_keys - parking_keys)
    if missing:
        warnings.append(f"{len(missing)} apartment(s) with parking_count==2 missing from parking.json:")
        # Group by (lot, building) for readability.
        from collections import defaultdict
        by_lb: dict[tuple[int, int], list[int]] = defaultdict(list)
        for k in missing:
            by_lb[(k[0], k[1])].append(k[2])
        for k in sorted(by_lb.keys()):
            warnings.append(f"    lot {k[0]} bldg {k[1]}: {sorted(by_lb[k])}")

    # 3. No parking spot may be assigned twice within the same lot.
    from collections import Counter
    by_lot_spots: dict[int, list[tuple[int, tuple[int, int, int]]]] = {}
    for rec in parking_records:
        for f in PARKING_SPOT_FIELDS:
            if f in rec:
                by_lot_spots.setdefault(rec["lot"], []).append(
                    (rec[f], (rec["lot"], rec["building"], rec["apartment"]))
                )
    for lot, spots in by_lot_spots.items():
        counts = Counter(s[0] for s in spots)
        for spot, count in counts.items():
            if count > 1:
                owners = [s[1] for s in spots if s[0] == spot]
                errors.append(f"lot {lot}: parking spot #{spot} assigned to {count} apartments: {owners}")

    return errors, warnings


def enrich_with_parking(apartments: list[dict], parking_records: list[dict]) -> int:
    """Attach parking_spot_1/parking_spot_2 to apartments by (lot, building, apt). Returns count enriched."""
    by_key = {(r["lot"], r["building"], r["apartment"]): r for r in parking_records}
    enriched = 0
    for apt in apartments:
        try:
            key = (int(apt.get("lot")), int(apt.get("building")), int(apt.get("apartment_number")))
        except (TypeError, ValueError):
            continue
        # Clear any stale parking fields first (entries may have been removed
        # from parking.json, or we're migrating from an older array shape).
        apt.pop("parking", None)
        for f in PARKING_SPOT_FIELDS:
            apt.pop(f, None)
        rec = by_key.get(key)
        if rec is not None:
            for f in PARKING_SPOT_FIELDS:
                if f in rec:
                    apt[f] = rec[f]
            enriched += 1
    return enriched


def run_parking_enrichment(apartments: list[dict], *, label: str = "[Phase 5a]") -> int:
    """Load parking.json, validate, and attach parking spots to apartments.

    Errors abort the run; warnings are printed and ignored. Returns the
    number of apartments that received a parking field.
    """
    print(f"\n{label} Loading parking.json...")
    parking_records = load_parking_records()
    print(f"  Loaded {len(parking_records)} parking record(s)")

    print(f"\n{label} Validating parking ↔ apartments consistency...")
    errors, warnings = validate_parking_consistency(apartments, parking_records)
    for w in warnings:
        print(f"  WARN: {w}")
    if errors:
        for e in errors:
            print(f"  ERROR: {e}")
        raise SystemExit(f"{label} parking validation failed with {len(errors)} error(s)")

    print(f"\n{label} Attaching parking spots to apartments...")
    enriched = enrich_with_parking(apartments, parking_records)
    print(f"  Enriched {enriched} apartment(s) with parking spots")
    return enriched


# ---------------------------------------------------------------------------
# Phase 5: Export
# ---------------------------------------------------------------------------

def enrich_with_taxonomy_labels(apartments: list[dict], taxonomies: dict[str, dict[int, str]]) -> None:
    """Replace internal taxonomy IDs with human-readable labels."""
    for apt in apartments:
        # Air direction
        air_ids = apt.pop("_api_air_direction_ids", [])
        air_labels = [taxonomies["air_direction"].get(tid, str(tid)) for tid in air_ids]
        apt["air_direction"] = ", ".join(air_labels) if air_labels else None

        # Manual overrides for known source-data errors on the contractor's site.
        slug = apt.get("property_slug")
        if slug in AIR_DIRECTION_OVERRIDES:
            apt["air_direction"] = AIR_DIRECTION_OVERRIDES[slug]

        # Status
        status_ids = apt.pop("_api_status_ids", [])
        status_labels = [taxonomies["status"].get(tid, str(tid)) for tid in status_ids]
        apt["status"] = ", ".join(status_labels) if status_labels else None

        # Earth (lot number)
        earth_ids = apt.pop("_api_earth_ids", [])
        earth_labels = [taxonomies["earth"].get(tid, str(tid)) for tid in earth_ids]
        apt["lot"] = ", ".join(earth_labels) if earth_labels else None

        # Remarks (notes)
        remarks_ids = apt.pop("_api_remarks_ids", [])
        remarks_labels = [taxonomies["remarks"].get(tid, str(tid)) for tid in remarks_ids]
        apt["remarks"] = ", ".join(remarks_labels) if remarks_labels else None

        if slug in REMARKS_OVERRIDES:
            apt["remarks"] = REMARKS_OVERRIDES[slug]

        # Compute price per sqm
        price = apt.get("price", 0)
        area = apt.get("area_sqm", 0)
        if price and area:
            apt["price_per_sqm"] = round(price / area, 2)
        else:
            apt["price_per_sqm"] = None


def archive_existing_output() -> None:
    """Snapshot the existing apartments.json to data/archive/ before overwriting.

    The archive filename is ``apartments-YYYY-MM-DD.json`` where the date
    comes from the file's mtime (when it was last scraped). If a file with
    the same name already exists, a numeric counter suffix is appended
    (``-2``, ``-3``, ...).
    """
    import datetime
    import shutil

    if not OUTPUT_JSON.exists():
        return

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    mtime = datetime.datetime.fromtimestamp(OUTPUT_JSON.stat().st_mtime)
    date_str = mtime.strftime("%Y-%m-%d")

    candidate = ARCHIVE_DIR / f"apartments-{date_str}.json"
    counter = 2
    while candidate.exists():
        candidate = ARCHIVE_DIR / f"apartments-{date_str}-{counter}.json"
        counter += 1

    shutil.copy2(OUTPUT_JSON, candidate)
    print(f"Archived previous snapshot to {candidate}")


def export_json(apartments: list[dict]) -> None:
    """Export apartment data to JSON."""
    archive_existing_output()
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(apartments, f, ensure_ascii=False, indent=2)
    print(f"\nExported {len(apartments)} apartments to {OUTPUT_JSON}")


def print_summary(apartments: list[dict], pdf_count: int, new_downloads: int) -> None:
    """Print summary statistics."""
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total apartments: {len(apartments)}")

    # By status
    status_count: dict[str, int] = {}
    for apt in apartments:
        s = apt.get("status") or "?"
        status_count[s] = status_count.get(s, 0) + 1
    print(f"\nBy status:")
    for s in sorted(status_count.keys()):
        print(f"  {s}: {status_count[s]}")

    # By rooms
    rooms_count: dict[str, int] = {}
    for apt in apartments:
        r = apt.get("rooms", "?")
        rooms_count[r] = rooms_count.get(r, 0) + 1
    print(f"\nBy rooms:")
    for r in sorted(rooms_count.keys()):
        print(f"  {r} rooms: {rooms_count[r]}")

    # Price range — split by status so sold prices don't skew the available view
    def _prices_for(status_filter):
        return [apt["price"] for apt in apartments if apt.get("price") and (status_filter is None or apt.get("status") == status_filter)]

    for label in ("פנוי", "נמכר"):
        prices = _prices_for(label)
        if prices:
            avg_price = sum(prices) / len(prices)
            print(f"\n[{label}] Price range: ₪{min(prices):,} - ₪{max(prices):,}  (avg ₪{avg_price:,.0f}, n={len(prices)})")

    # Area range
    areas = [apt["area_sqm"] for apt in apartments if apt.get("area_sqm")]
    if areas:
        print(f"\nArea range: {min(areas):.1f} - {max(areas):.1f} sqm")

    # Price per sqm
    ppsqm = [apt["price_per_sqm"] for apt in apartments if apt.get("price_per_sqm")]
    if ppsqm:
        print(f"Price/sqm range: ₪{min(ppsqm):,.0f} - ₪{max(ppsqm):,.0f}")

    # PDFs
    print(f"\nUnique PDFs: {pdf_count} ({new_downloads} newly downloaded)")

    # Parking
    eligible_for_parking = sum(
        1 for a in apartments
        if a.get("parking_count") == 2 and a.get("status") in PARKING_TABLE_STATUSES
    )
    have_parking = sum(1 for a in apartments if any(a.get(f) for f in PARKING_SPOT_FIELDS))
    print(f"\nParking coverage: {have_parking}/{eligible_for_parking} eligible apartments")

    print("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def status_only_check() -> None:
    """Quick status-only scrape: fetch statuses from the API and compare against
    the existing apartments.json to detect availability changes (e.g. פנוי -> נמכר).
    Updates apartments.json in-place with the new statuses and sets
    status_changed_date to today's date for any changed apartments.
    """
    import datetime

    print("=" * 60)
    print("Eshel Haifa - Quick Status Check")
    print("=" * 60)

    # Load existing data
    if not OUTPUT_JSON.exists():
        print(f"ERROR: {OUTPUT_JSON} not found. Run a full scrape first.")
        sys.exit(1)

    with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
        existing = json.load(f)

    # Build lookup: slug -> index in list
    slug_to_index = {apt["property_slug"]: i for i, apt in enumerate(existing) if apt.get("property_slug")}

    # Resolve only the status taxonomy
    print("\nResolving status taxonomy...")
    status_terms = resolve_taxonomy("status")
    print(f"  {len(status_terms)} terms")

    # Fetch all properties from API
    print("\nFetching properties from API...")
    all_properties = fetch_all_properties()
    print(f"  {len(all_properties)} properties")

    # Map current statuses and detect changes
    today = datetime.date.today().isoformat()
    changes = []
    for prop in all_properties:
        slug = prop["slug"]
        if slug not in slug_to_index:
            continue

        prop_status_ids = prop.get("status", [])
        current_labels = [status_terms.get(tid, str(tid)) for tid in prop_status_ids]
        current_status = ", ".join(current_labels) if current_labels else None

        idx = slug_to_index[slug]
        old_status = existing[idx].get("status")

        if current_status != old_status:
            apt = existing[idx]
            changes.append({
                "property_slug": slug,
                "old_status": old_status,
                "new_status": current_status,
                "lot": apt.get("lot"),
                "building": apt.get("building"),
                "apartment_number": apt.get("apartment_number"),
                "rooms": apt.get("rooms"),
                "floor": apt.get("floor"),
            })
            existing[idx]["status"] = current_status
            existing[idx]["status_changed_date"] = today

    # Print summary
    print(f"\n{'=' * 60}")
    print(f"STATUS CHANGES: {len(changes)}")
    print(f"{'=' * 60}")
    if not changes:
        print("  No status changes detected.")
    else:
        for c in changes:
            details = f"Lot {c['lot']}, Bldg {c['building']}, Apt {c['apartment_number']}, {c['rooms']} rooms, Floor {c['floor']}"
            print(f"  {c['property_slug']}: {c['old_status']} -> {c['new_status']}")
            print(f"    ({details})")

        # Write updated apartments.json
        with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        print(f"\nUpdated {OUTPUT_JSON} with {len(changes)} status change(s).")


def parking_only_update() -> None:
    """Re-enrich an existing apartments.json with parking data only.

    Intended for the common case where parking.json was edited (e.g. a new
    page transcribed) and we want to refresh apartments.json without doing
    a full network scrape. The previous apartments.json is archived.
    """
    print("=" * 60)
    print("Eshel Haifa - Parking-only Enrichment")
    print("=" * 60)

    if not OUTPUT_JSON.exists():
        print(f"ERROR: {OUTPUT_JSON} not found. Run a full scrape first.")
        sys.exit(1)

    with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
        apartments = json.load(f)
    print(f"Loaded {len(apartments)} apartment(s) from {OUTPUT_JSON}")

    run_parking_enrichment(apartments, label="[parking-only]")

    print("\nWriting updated apartments.json...")
    archive_existing_output()
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(apartments, f, ensure_ascii=False, indent=2)
    print(f"Updated {OUTPUT_JSON}")


def main():
    parser = argparse.ArgumentParser(description="Eshel Haifa Apartment Scraper - Lottery 771")
    parser.add_argument("--skip-pdfs", action="store_true", help="Skip PDF downloading (Phase 4), only export JSON")
    parser.add_argument("--skip-parking", action="store_true", help="Skip parking enrichment (Phase 5a)")
    parser.add_argument("--status-only", action="store_true", help="Quick status check — only fetch statuses from API and compare against existing data")
    parser.add_argument("--parking-only", action="store_true", help="Re-enrich existing apartments.json with parking data (no network scrape)")
    args = parser.parse_args()

    if args.status_only:
        status_only_check()
        return

    if args.parking_only:
        parking_only_update()
        return

    print("=" * 60)
    print("Eshel Haifa Apartment Scraper - Lottery 771")
    print("=" * 60)

    # Phase 2: API
    print("\n[Phase 2] Resolving taxonomies...")
    taxonomies = resolve_all_taxonomies()

    print("\n[Phase 2] Fetching all properties from API...")
    all_properties = fetch_all_properties()
    print(f"  Total properties from API: {len(all_properties)}")

    print(f"\n[Phase 2] Filtering to included statuses ({', '.join(sorted(INCLUDED_STATUSES))})...")
    available = filter_available(all_properties, taxonomies["status"])
    print(f"  Apartments to scrape: {len(available)}")

    if not available:
        print("No matching apartments found. Exiting.")
        sys.exit(1)

    # Phase 3: Scrape detail pages
    print(f"\n[Phase 3] Scraping {len(available)} detail pages...")
    apartments = scrape_detail_pages(available, taxonomies["status"])

    # Phase 4: Download PDFs
    if not args.skip_pdfs:
        print("\n[Phase 4] Collecting PDF URLs...")
        url_to_local = collect_unique_pdfs(apartments)
        print(f"  Unique PDFs to download: {len(url_to_local)}")

        PDFS_DIR.mkdir(parents=True, exist_ok=True)
        print("\n[Phase 4] Downloading PDFs...")
        new_downloads = download_pdfs(url_to_local)

        print("\n[Phase 4] Mapping local PDF paths...")
        map_pdf_local_paths(apartments, url_to_local)
    else:
        print("\n[Phase 4] Skipped (--skip-pdfs)")
        url_to_local = {}
        new_downloads = 0

    # Phase 5: Export
    print("\n[Phase 5] Enriching with taxonomy labels...")
    enrich_with_taxonomy_labels(apartments, taxonomies)

    # Phase 5a: Enrich with parking data from the manually-curated parking.json.
    # Runs after taxonomy enrichment so we can validate against final
    # `status` and `lot` labels (not raw API IDs).
    if not args.skip_parking:
        run_parking_enrichment(apartments)
    else:
        print("\n[Phase 5a] Skipped (--skip-parking)")

    # Track status changes: compare against previous data and set status_changed_date
    import datetime
    today = datetime.date.today().isoformat()
    if OUTPUT_JSON.exists():
        with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
            old_data = json.load(f)
        old_status_map = {apt["property_slug"]: apt.get("status") for apt in old_data if apt.get("property_slug")}
        old_date_map = {apt["property_slug"]: apt.get("status_changed_date") for apt in old_data if apt.get("property_slug")}
        for apt in apartments:
            slug = apt.get("property_slug")
            if not slug:
                continue
            old_status = old_status_map.get(slug)
            if old_status is not None and apt.get("status") != old_status:
                apt["status_changed_date"] = today
            elif slug in old_date_map and old_date_map[slug]:
                # Preserve existing date if status didn't change
                apt["status_changed_date"] = old_date_map[slug]

    print("\n[Phase 5] Exporting JSON...")
    export_json(apartments)

    print_summary(apartments, len(url_to_local), new_downloads)


if __name__ == "__main__":
    main()
