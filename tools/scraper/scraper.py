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


def filter_available(properties: list[dict], status_terms: dict[int, str]) -> list[dict]:
    """Filter properties to only those with status 'פנוי'."""
    # Find the term ID(s) for 'פנוי'
    available_term_ids = {tid for tid, name in status_terms.items() if name == "פנוי"}
    if not available_term_ids:
        print(f"  WARNING: Could not find 'פנוי' status term. Available terms: {status_terms}")
        print("  Returning all properties unfiltered.")
        return properties

    filtered = []
    for prop in properties:
        prop_status_ids = set(prop.get("status", []))
        if prop_status_ids & available_term_ids:
            filtered.append(prop)
    return filtered


# ---------------------------------------------------------------------------
# Phase 3: Scrape Detail Pages
# ---------------------------------------------------------------------------

def parse_detail_page(html: str, property_slug: str) -> dict:
    """Parse an apartment detail page and extract all fields + PDF links."""
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
    pdf_links = {}
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        if not href.lower().endswith(".pdf"):
            continue
        link_text = a_tag.get_text(strip=True)
        if "תכנית דירה" in link_text or "תוכנית דירה" in link_text:
            pdf_links["pdf_apartment_plan"] = href
        elif "תכנית קומות" in link_text or "תוכנית קומות" in link_text:
            pdf_links["pdf_floor_plan"] = href
        elif "חניה" in link_text or "מחסנים" in link_text:
            pdf_links["pdf_parking_storage"] = href
        elif "פיתוח" in link_text and "צבעונית" in link_text:
            pdf_links["pdf_development"] = href
        else:
            # Unknown PDF type — store it anyway
            pdf_links.setdefault("pdf_other", [])
            if isinstance(pdf_links["pdf_other"], list):
                pdf_links["pdf_other"].append(href)

    data.update(pdf_links)
    return data


def scrape_detail_pages(properties: list[dict]) -> list[dict]:
    """Fetch and parse each property's detail page."""
    apartments = []
    total = len(properties)
    for i, prop in enumerate(properties, 1):
        slug = prop["slug"]
        url = prop["link"]
        print(f"  [{i}/{total}] Scraping {slug}...", end=" ")

        try:
            resp = session.get(url, timeout=30)
            resp.raise_for_status()
            detail = parse_detail_page(resp.text, slug)

            # Enrich with API taxonomy data already resolved
            detail["_api_status_ids"] = prop.get("status", [])
            detail["_api_air_direction_ids"] = prop.get("air_direction", [])
            detail["_api_earth_ids"] = prop.get("earth", [])
            detail["_api_house_number_ids"] = prop.get("house_number", [])
            detail["_api_remarks_ids"] = prop.get("remarks", [])
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
    pdf_keys = ["pdf_apartment_plan", "pdf_floor_plan", "pdf_parking_storage", "pdf_development"]
    url_to_local = {}

    for apt in apartments:
        for key in pdf_keys:
            url = apt.get(key)
            if url and url not in url_to_local:
                # Preserve path structure under /files/
                parsed = urlparse(url)
                path_part = parsed.path
                if "/files/" in path_part:
                    relative = path_part.split("/files/", 1)[1]
                else:
                    relative = path_part.lstrip("/")
                local_path = str(PDFS_DIR / relative)
                url_to_local[url] = local_path

        # Handle pdf_other if present
        other = apt.get("pdf_other", [])
        if isinstance(other, list):
            for url in other:
                if url not in url_to_local:
                    parsed = urlparse(url)
                    path_part = parsed.path
                    if "/files/" in path_part:
                        relative = path_part.split("/files/", 1)[1]
                    else:
                        relative = path_part.lstrip("/")
                    url_to_local[url] = str(PDFS_DIR / relative)

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
    """Replace PDF URLs with local relative paths in apartment records."""
    pdf_keys = ["pdf_apartment_plan", "pdf_floor_plan", "pdf_parking_storage", "pdf_development"]
    for apt in apartments:
        for key in pdf_keys:
            url = apt.get(key)
            if url and url in url_to_local:
                # Store both URL and local path
                apt[f"{key}_url"] = url
                apt[key] = os.path.relpath(url_to_local[url], SCRAPER_DIR)

        other = apt.get("pdf_other", [])
        if isinstance(other, list):
            apt["pdf_other_urls"] = other
            apt["pdf_other"] = [
                os.path.relpath(url_to_local[u], SCRAPER_DIR)
                for u in other if u in url_to_local
            ]


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

        # Status
        status_ids = apt.pop("_api_status_ids", [])
        status_labels = [taxonomies["status"].get(tid, str(tid)) for tid in status_ids]
        apt["status"] = ", ".join(status_labels) if status_labels else None

        # Earth (lot number)
        earth_ids = apt.pop("_api_earth_ids", [])
        earth_labels = [taxonomies["earth"].get(tid, str(tid)) for tid in earth_ids]
        apt["lot"] = ", ".join(earth_labels) if earth_labels else None

        # House number
        hn_ids = apt.pop("_api_house_number_ids", [])
        hn_labels = [taxonomies["house_number"].get(tid, str(tid)) for tid in hn_ids]
        if hn_labels and "apartment_number" not in apt:
            apt["apartment_number_from_api"] = ", ".join(hn_labels)

        # Remarks (notes)
        remarks_ids = apt.pop("_api_remarks_ids", [])
        remarks_labels = [taxonomies["remarks"].get(tid, str(tid)) for tid in remarks_ids]
        apt["remarks"] = ", ".join(remarks_labels) if remarks_labels else None

        # Compute price per sqm
        price = apt.get("price", 0)
        area = apt.get("area_sqm", 0)
        if price and area:
            apt["price_per_sqm"] = round(price / area, 2)
        else:
            apt["price_per_sqm"] = None


def export_json(apartments: list[dict]) -> None:
    """Export apartment data to JSON."""
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(apartments, f, ensure_ascii=False, indent=2)
    print(f"\nExported {len(apartments)} apartments to {OUTPUT_JSON}")


def print_summary(apartments: list[dict], pdf_count: int, new_downloads: int) -> None:
    """Print summary statistics."""
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total available apartments: {len(apartments)}")

    # By rooms
    rooms_count: dict[str, int] = {}
    for apt in apartments:
        r = apt.get("rooms", "?")
        rooms_count[r] = rooms_count.get(r, 0) + 1
    print(f"\nBy rooms:")
    for r in sorted(rooms_count.keys()):
        print(f"  {r} rooms: {rooms_count[r]}")

    # Price range
    prices = [apt["price"] for apt in apartments if apt.get("price")]
    if prices:
        print(f"\nPrice range: ₪{min(prices):,} - ₪{max(prices):,}")
        avg_price = sum(prices) / len(prices)
        print(f"Average price: ₪{avg_price:,.0f}")

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
    print("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Eshel Haifa Apartment Scraper - Lottery 771")
    parser.add_argument("--skip-pdfs", action="store_true", help="Skip PDF downloading (Phase 4), only export JSON")
    args = parser.parse_args()

    print("=" * 60)
    print("Eshel Haifa Apartment Scraper - Lottery 771")
    print("=" * 60)

    # Phase 2: API
    print("\n[Phase 2] Resolving taxonomies...")
    taxonomies = resolve_all_taxonomies()

    print("\n[Phase 2] Fetching all properties from API...")
    all_properties = fetch_all_properties()
    print(f"  Total properties from API: {len(all_properties)}")

    print("\n[Phase 2] Filtering to available (פנוי) apartments...")
    available = filter_available(all_properties, taxonomies["status"])
    print(f"  Available apartments: {len(available)}")

    if not available:
        print("No available apartments found. Exiting.")
        sys.exit(1)

    # Phase 3: Scrape detail pages
    print(f"\n[Phase 3] Scraping {len(available)} detail pages...")
    apartments = scrape_detail_pages(available)

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

    print("\n[Phase 5] Exporting JSON...")
    export_json(apartments)

    print_summary(apartments, len(url_to_local), new_downloads)


if __name__ == "__main__":
    main()
