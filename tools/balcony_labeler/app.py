"""Balcony direction labeler — interactive web app for human labeling
of balcony directions on apartment plans.

For each unique (building, type) we pick one representative apartment,
render its plan PDF to PNG, and let the user enter one or more balcony
directions. Auto-saves to balcony_directions.json after every change.

Usage:
    pip install flask pymupdf
    python tools/balcony_labeler/app.py
    # then open http://localhost:5000
"""
from __future__ import annotations

import io
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import fitz  # PyMuPDF
from flask import Flask, jsonify, render_template, request, send_file

# UTF-8 stdout on Windows.
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
APARTMENTS_JSON = ROOT / "data" / "apartments.json"
PDFS_DIR = ROOT / "tools" / "scraper" / "pdfs"
CACHE_DIR = HERE / "cache"
OUTPUT_JSON = HERE / "balcony_directions.json"

CACHE_DIR.mkdir(exist_ok=True)

# Hebrew cardinal directions, matching the contractor's air_direction format.
NORTH, SOUTH, EAST, WEST = "צפון", "דרום", "מזרח", "מערב"

# Eight options offered to the user (4 cardinals + 4 corners).
DIRECTIONS = [
    {"key": "N",  "label": NORTH,                 "abbr": "N"},
    {"key": "NE", "label": f"{NORTH}-{EAST}",     "abbr": "NE"},
    {"key": "E",  "label": EAST,                  "abbr": "E"},
    {"key": "SE", "label": f"{SOUTH}-{EAST}",     "abbr": "SE"},
    {"key": "S",  "label": SOUTH,                 "abbr": "S"},
    {"key": "SW", "label": f"{SOUTH}-{WEST}",     "abbr": "SW"},
    {"key": "W",  "label": WEST,                  "abbr": "W"},
    {"key": "NW", "label": f"{NORTH}-{WEST}",     "abbr": "NW"},
]


def normalize_type(t: str | None) -> str | None:
    if not t:
        return None
    return t.replace(" ", "")


def url_to_local_pdf(url: str) -> Path | None:
    """Map a contractor PDF URL to the local file path under tools/scraper/pdfs/.

    Pattern: .../files/2183/207/1/207-1-1.pdf  ->  pdfs/2183/207/1/207-1-1.pdf
    """
    if not url:
        return None
    path = urlparse(url).path
    if "/files/" in path:
        rel = path.split("/files/", 1)[1]
    else:
        rel = path.lstrip("/")
    return PDFS_DIR / rel


def _direction_token_set(s: str | None) -> frozenset[str]:
    """Parse 'צפון-מזרח-דרום' (or 'צפון-מזרח -דרום') into the set of cardinal
    tokens, order- and whitespace-independent. Used to detect whether two
    air_direction strings describe the same orientation despite typos /
    different orderings."""
    if not s:
        return frozenset()
    import re
    parts = [p.strip() for p in re.split(r"[-\s]+", s.strip()) if p.strip()]
    return frozenset(parts)


def build_groups() -> list[dict]:
    """Group apartments by (building, type), pick a representative for each.

    Cross-lot safety: in this dataset, every (building, type) shared between
    lots 207 and 208 has the same air_direction — meaning the buildings are
    physically oriented identically on both lots, so the balcony direction
    must also be identical. We dedupe by (building, type) to halve the work,
    but compute `air_direction_disagrees` per group so the UI can flag any
    future case where the rotations diverge.
    """
    with open(APARTMENTS_JSON, encoding="utf-8") as f:
        apts = json.load(f)

    by_group: dict[tuple, dict] = {}
    for a in apts:
        b = a.get("building")
        t = normalize_type(a.get("type"))
        if b is None or t is None:
            continue
        if not a.get("balcony_area_sqm"):
            continue
        key = (b, t)
        g = by_group.setdefault(key, {
            "building": b,
            "type": t,
            "members": [],
            "air_directions": set(),
            # Per-lot air_direction strings, for the UI to surface.
            "air_directions_by_lot": defaultdict(set),
            "balcony_areas": set(),
            "lots": set(),
            "rooms": set(),
            "areas": set(),
        })
        g["members"].append(a)
        ad = a.get("air_direction")
        if ad:
            g["air_directions"].add(ad)
            if a.get("lot"):
                g["air_directions_by_lot"][a["lot"]].add(ad)
        if a.get("balcony_area_sqm"):
            g["balcony_areas"].add(a["balcony_area_sqm"])
        if a.get("lot"):
            g["lots"].add(a["lot"])
        if a.get("rooms"):
            g["rooms"].add(a["rooms"])
        if a.get("area_sqm"):
            g["areas"].add(a["area_sqm"])

    groups: list[dict] = []
    for (b, t), g in sorted(by_group.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        # Prefer a representative whose plan PDF actually exists on disk.
        rep = None
        rep_pdf = None
        for cand in g["members"]:
            url = cand.get("pdf_apartment_plan_url")
            if not url:
                continue
            local = url_to_local_pdf(url)
            if local and local.exists():
                rep = cand
                rep_pdf = local
                break
        if rep is None:
            # Fall back to the first member with any URL — render will 404 but
            # the group still shows up so the user knows there's data.
            for cand in g["members"]:
                if cand.get("pdf_apartment_plan_url"):
                    rep = cand
                    rep_pdf = url_to_local_pdf(cand["pdf_apartment_plan_url"])
                    break
        if rep is None:
            print(f"  skip group ({b}, {t}): no PDF reference")
            continue

        gid = f"{b}__{t}"

        # Build a per-lot view, and detect whether the lots actually agree on
        # the building's compass orientation (token sets, ignoring order).
        per_lot = []
        token_sets: set[frozenset[str]] = set()
        for lot in sorted(g["air_directions_by_lot"].keys()):
            strs = sorted(g["air_directions_by_lot"][lot])
            per_lot.append({"lot": lot, "air_directions": strs})
            for s in strs:
                token_sets.add(_direction_token_set(s))
        air_direction_disagrees = len(token_sets) > 1

        # Page count of the representative PDF — most plans are single-page,
        # but ~5% are 2-page (e.g. duplex apartments showing both floors).
        page_count = 1
        if rep_pdf and rep_pdf.exists():
            try:
                with fitz.open(rep_pdf) as _doc:
                    page_count = _doc.page_count
            except Exception:
                page_count = 1

        groups.append({
            "id": gid,
            "building": b,
            "type": t,
            "rep_slug": rep.get("property_slug"),
            "rep_pdf": str(rep_pdf) if rep_pdf else None,
            "rep_pdf_exists": bool(rep_pdf and rep_pdf.exists()),
            "page_count": page_count,
            "lots": sorted(g["lots"]),
            "air_directions": sorted(g["air_directions"]),
            "air_directions_by_lot": per_lot,
            "air_direction_disagrees": air_direction_disagrees,
            "balcony_areas": sorted(g["balcony_areas"]),
            "rooms": sorted(g["rooms"]),
            "areas": sorted(g["areas"]),
            "apartment_count": len(g["members"]),
            # All apartment numbers in this group, for reference / variant browsing.
            "apartments": [
                {
                    "slug": m.get("property_slug"),
                    "lot": m.get("lot"),
                    "apartment_number": m.get("apartment_number"),
                    "floor": m.get("floor"),
                    "pdf_url": m.get("pdf_apartment_plan_url"),
                }
                for m in g["members"]
            ],
        })
    return groups


def render_group_png(group: dict, page_index: int = 0) -> Path | None:
    """Render one page of the representative PDF to PNG, cached on disk."""
    pdf_path = Path(group["rep_pdf"]) if group.get("rep_pdf") else None
    if not pdf_path or not pdf_path.exists():
        return None
    cache_path = CACHE_DIR / f"{group['id']}__p{page_index}.png"
    if cache_path.exists() and cache_path.stat().st_mtime >= pdf_path.stat().st_mtime:
        return cache_path
    doc = fitz.open(pdf_path)
    if page_index < 0 or page_index >= doc.page_count:
        doc.close()
        return None
    page = doc[page_index]
    pix = page.get_pixmap(dpi=180)
    pix.save(cache_path)
    doc.close()
    return cache_path


def load_results() -> dict:
    if not OUTPUT_JSON.exists():
        return {}
    with open(OUTPUT_JSON, encoding="utf-8") as f:
        return json.load(f)


def save_results(results: dict) -> None:
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2, sort_keys=True)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = Flask(__name__)
GROUPS = build_groups()
GROUPS_BY_ID = {g["id"]: g for g in GROUPS}


@app.route("/")
def index():
    return render_template(
        "index.html",
        groups=GROUPS,
        directions=DIRECTIONS,
        results=load_results(),
    )


@app.route("/render/<group_id>.png")
def render_image(group_id: str):
    g = GROUPS_BY_ID.get(group_id)
    if g is None:
        return "not found", 404
    try:
        page = int(request.args.get("page", 0))
    except (TypeError, ValueError):
        page = 0
    img_path = render_group_png(g, page)
    if img_path is None or not img_path.exists():
        return "PDF missing on disk", 404
    return send_file(img_path, mimetype="image/png")


@app.route("/save", methods=["POST"])
def save():
    data = request.get_json(force=True)
    group_id = data.get("group_id")
    if group_id not in GROUPS_BY_ID:
        return jsonify({"ok": False, "error": "unknown group"}), 400

    balconies = data.get("balconies", [])  # list of direction strings
    notes = (data.get("notes") or "").strip()

    g = GROUPS_BY_ID[group_id]
    results = load_results()
    if not balconies and not notes:
        results.pop(group_id, None)
    else:
        results[group_id] = {
            "building": g["building"],
            "type": g["type"],
            "balconies": balconies,
            "notes": notes,
            "labeled_at": datetime.now().isoformat(timespec="seconds"),
        }
    save_results(results)

    done = sum(1 for k, v in results.items() if v.get("balconies"))
    return jsonify({"ok": True, "saved": done, "total": len(GROUPS)})


def main():
    print("=" * 60)
    print("Balcony Direction Labeler")
    print("=" * 60)
    print(f"  apartments: {APARTMENTS_JSON}")
    print(f"  pdfs:       {PDFS_DIR}")
    print(f"  cache:      {CACHE_DIR}")
    print(f"  output:     {OUTPUT_JSON}")
    print(f"  groups:     {len(GROUPS)} unique (building, type) combos with balconies")
    missing = [g for g in GROUPS if not g["rep_pdf_exists"]]
    if missing:
        print(f"  WARNING: {len(missing)} group(s) have no on-disk PDF — render will 404:")
        for g in missing[:5]:
            print(f"    - {g['id']}")
        if len(missing) > 5:
            print(f"    ... and {len(missing) - 5} more")
    print()
    print("  Open: http://localhost:5000")
    print("  Press Ctrl+C to quit. Output is auto-saved on every change.")
    print()
    # auto_reload=True so template edits show up without restarting the server.
    app.jinja_env.auto_reload = True
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.run(host="127.0.0.1", port=5000, debug=False)


if __name__ == "__main__":
    main()
