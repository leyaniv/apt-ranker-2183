"""Compare two apartments JSON files and summarize changes.

Usage:
    python diff_apartments.py OLD NEW

Paths may be absolute or relative to the current working directory; they
are also looked up relative to the repository root as a convenience.
With no arguments, the historical defaults are used
(OLD=data/apartments copy.json, NEW=data/apartments.json).
"""
import argparse
import json
import os
import sys
from pathlib import Path

# Ensure UTF-8 output on Windows consoles (cp1252 chokes on Hebrew strings).
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).parent.parent.parent
DEFAULT_NEW = ROOT / "data" / "apartments.json"
DEFAULT_OLD = ROOT / "data" / "apartments copy.json"


def resolve(p: str | Path) -> Path:
    path = Path(p)
    if path.is_absolute() or path.exists():
        return path
    candidate = ROOT / path
    return candidate if candidate.exists() else path


def load(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# שיווק חופשי = open-market sales, scraped with API-only data. They have no
# price/area/PDFs and aren't surfaced in the webapp, so we exclude them from
# the diff to keep the report focused on lottery units.
FREE_MARKETING_STATUS = "שיווק חופשי"


def _is_free_marketing(apt: dict) -> bool:
    return (apt.get("status") or "").strip() == FREE_MARKETING_STATUS


def diff(old_path: Path, new_path: Path) -> None:
    old = [a for a in load(old_path) if not _is_free_marketing(a)]
    new = [a for a in load(new_path) if not _is_free_marketing(a)]

    new_by = {a["property_slug"]: a for a in new}
    old_by = {a["property_slug"]: a for a in old}

    added = sorted(set(new_by) - set(old_by))
    removed = sorted(set(old_by) - set(new_by))
    common = sorted(set(new_by) & set(old_by))

    # Fields we care about (skip noisy/derived ones unless they reveal real changes)
    IGNORE = {
        "pdf_other", "pdf_other_urls",
        "pdf_apartment_plan_url", "pdf_floor_plan_url",
        "pdf_parking_storage_url", "pdf_development_url",
    }

    changed = []  # list of (slug, field, old, new)
    for slug in common:
        a, b = old_by[slug], new_by[slug]
        keys = set(a) | set(b)
        for k in keys:
            if k in IGNORE:
                continue
            ov, nv = a.get(k), b.get(k)
            # Treat PDF path differences (relative path representation) as no-change
            # if both sides reference the same logical PDF (basename match)
            if k.startswith("pdf_") and isinstance(ov, str) and isinstance(nv, str):
                if os.path.basename(ov) == os.path.basename(nv):
                    continue
            if ov != nv:
                changed.append((slug, k, ov, nv))

    print(f"OLD: {old_path}")
    print(f"NEW: {new_path}")
    print()
    print(f"Old: {len(old)} apartments | New: {len(new)} apartments")
    print(f"Added slugs:   {len(added)}")
    print(f"Removed slugs: {len(removed)}")
    print(f"Common slugs:  {len(common)}")
    print(f"Field changes: {len(changed)}")
    print()

    if added:
        print("=== ADDED (in new, not in old) ===")
        for s in added:
            a = new_by[s]
            print(f"  {s}: building {a.get('building')} apt {a.get('apartment_number')} | {a.get('rooms')}r floor {a.get('floor')} | price {a.get('price')}")
        print()

    if removed:
        print("=== REMOVED (in old, not in new) ===")
        for s in removed:
            a = old_by[s]
            print(f"  {s}: building {a.get('building')} apt {a.get('apartment_number')} | {a.get('rooms')}r floor {a.get('floor')} | price {a.get('price')}")
        print()

    # Group field changes by field name
    by_field: dict[str, list[tuple[str, object, object]]] = {}
    for slug, k, ov, nv in changed:
        by_field.setdefault(k, []).append((slug, ov, nv))

    print("=== FIELD CHANGES BY FIELD ===")
    for k in sorted(by_field, key=lambda x: -len(by_field[x])):
        rows = by_field[k]
        print(f"\n[{k}] - {len(rows)} apartments changed")
        for slug, ov, nv in rows[:50]:
            print(f"  {slug}: {ov!r} -> {nv!r}")
        if len(rows) > 50:
            print(f"  ... and {len(rows)-50} more")

    # Price totals comparison
    old_total = sum(a.get("price", 0) or 0 for a in old)
    new_total = sum(a.get("price", 0) or 0 for a in new)
    print("\n=== TOTAL PRICE ===")
    print(f"  Old sum: {old_total:,}")
    print(f"  New sum: {new_total:,}")
    print(f"  Diff:    {new_total - old_total:+,}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare two apartments JSON files and summarize changes.",
    )
    parser.add_argument("old", nargs="?", default=str(DEFAULT_OLD),
                        help=f"Old/baseline JSON file (default: {DEFAULT_OLD})")
    parser.add_argument("new", nargs="?", default=str(DEFAULT_NEW),
                        help=f"New JSON file (default: {DEFAULT_NEW})")
    args = parser.parse_args()

    old_path = resolve(args.old)
    new_path = resolve(args.new)

    if not old_path.exists():
        parser.error(f"OLD file not found: {old_path}")
    if not new_path.exists():
        parser.error(f"NEW file not found: {new_path}")

    diff(old_path, new_path)


if __name__ == "__main__":
    main()
