/**
 * Print view utility — renders a styled, printable HTML document of
 * ranked apartments in a new browser tab and triggers `window.print()`.
 *
 * Lives entirely client-side: no network calls, no third-party libs.
 * The browser's print dialog handles RTL/Hebrew fonts natively, so we
 * just need to emit a well-structured HTML page with print-friendly CSS.
 */

import type { Profile, RankedApartment } from "../types";

/* ─── Column registry ─────────────────────────── */

export type PrintColumnId =
  | "rank"
  | "building"
  | "apartment_number"
  | "rooms"
  | "floor"
  | "air_direction"
  | "layout"
  | "type"
  | "area_sqm"
  | "balcony_area_sqm"
  | "storage_area_sqm"
  | "parking_count"
  | "parking_spots"
  | "price"
  | "score"
  | "status";

export interface PrintColumn {
  id: PrintColumnId;
  label: { en: string; he: string };
  align: "start" | "end" | "center";
  /** Returns a display string for the cell. */
  get: (r: RankedApartment, rank: number, locale: "en" | "he") => string;
}

/** Format a number with locale-aware grouping; falls back to raw on NaN. */
function fmtInt(n: number | undefined, locale: "en" | "he"): string {
  if (n == null || Number.isNaN(n)) return "";
  return n.toLocaleString(locale === "he" ? "he-IL" : "en-US");
}

function fmtDecimal(n: number | undefined, locale: "en" | "he", digits = 1): string {
  if (n == null || Number.isNaN(n)) return "";
  return n.toLocaleString(locale === "he" ? "he-IL" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtDirections(dirs: string[] | undefined, locale: "en" | "he"): string {
  if (!dirs || dirs.length === 0) return "";
  const map = locale === "he"
    ? { N: "צ", E: "מז", S: "ד", W: "מע" }
    : { N: "N", E: "E", S: "S", W: "W" };
  return dirs.map((d) => (map as Record<string, string>)[d] ?? d).join("/");
}

/** Assigned parking spot numbers from the contractor PDFs (detail view parity). */
function fmtParkingSpots(r: RankedApartment): string {
  const spots = [r.apartment.parking_spot_1, r.apartment.parking_spot_2].filter(
    (n): n is number => n != null && typeof n === "number" && !Number.isNaN(n),
  );
  return spots.join(", ");
}

/** All columns the user can choose from, keyed by id. Order = display order. */
export const PRINT_COLUMNS: PrintColumn[] = [
  {
    id: "rank",
    label: { en: "#", he: "#" },
    align: "end",
    get: (_r, rank) => String(rank),
  },
  {
    id: "building",
    label: { en: "Building", he: "בניין" },
    align: "center",
    get: (r) => r.apartment.buildingKey,
  },
  {
    id: "apartment_number",
    label: { en: "Apt", he: "דירה" },
    align: "center",
    get: (r) => String(r.apartment.apartment_number),
  },
  {
    id: "rooms",
    label: { en: "Rooms", he: "חדרים" },
    align: "center",
    get: (r) => r.apartment.rooms,
  },
  {
    id: "floor",
    label: { en: "Floor", he: "קומה" },
    align: "center",
    get: (r) => r.apartment.floor,
  },
  {
    id: "air_direction",
    label: { en: "Directions", he: "כיוונים" },
    align: "center",
    get: (r, _rank, locale) => fmtDirections(r.apartment.directions, locale),
  },
  {
    id: "layout",
    label: { en: "Layout", he: "סוג" },
    align: "center",
    get: (r, _rank, locale) => {
      const map: Record<string, { en: string; he: string }> = {
        regular: { en: "Regular", he: "רגילה" },
        garden: { en: "Garden", he: "דירת גן" },
        garden_duplex: { en: "Garden Duplex", he: "דופלקס גן" },
        roof_duplex: { en: "Roof Duplex", he: "דופלקס גג" },
        upper_duplex: { en: "Upper Duplex", he: "דופלקס עליון" },
        double_height_duplex: { en: "Double-Height Duplex", he: "דופלקס חלל כפול" },
      };
      return map[r.apartment.layout]?.[locale] ?? r.apartment.layout;
    },
  },
  {
    id: "type",
    label: { en: "Type", he: "טיפוס" },
    align: "center",
    get: (r) => r.apartment.type,
  },
  {
    id: "area_sqm",
    label: { en: "Area (m²)", he: "שטח (מ״ר)" },
    align: "end",
    get: (r, _rank, locale) => fmtInt(r.apartment.area_sqm, locale),
  },
  {
    id: "balcony_area_sqm",
    label: { en: "Balcony (m²)", he: "מרפסת (מ״ר)" },
    align: "end",
    get: (r, _rank, locale) => fmtInt(r.apartment.balcony_area_sqm, locale),
  },
  {
    id: "storage_area_sqm",
    label: { en: "Storage (m²)", he: "מחסן (מ״ר)" },
    align: "end",
    get: (r, _rank, locale) => fmtInt(r.apartment.storage_area_sqm, locale),
  },
  {
    id: "parking_count",
    label: { en: "Parking", he: "חניות" },
    align: "center",
    get: (r) => String(r.apartment.parking_count ?? ""),
  },
  {
    id: "parking_spots",
    label: { en: "Parking spots", he: "מספרי חניה" },
    align: "center",
    get: (r) => fmtParkingSpots(r),
  },
  {
    id: "price",
    label: { en: "Price (₪)", he: "מחיר (₪)" },
    align: "end",
    get: (r, _rank, locale) => fmtInt(r.apartment.price, locale),
  },
  {

    id: "score",
    label: { en: "Score", he: "ציון" },
    align: "end",
    get: (r, _rank, locale) => fmtDecimal(r.totalScore, locale, 2),
  },
  {
    id: "status",
    label: { en: "Status", he: "סטטוס" },
    align: "center",
    get: (r, _rank, locale) => {
      if (!r.apartment.isSold) return "";
      return locale === "he" ? "נמכר" : "Sold";
    },
  },
];

/** Default-checked columns on first use. */
export const DEFAULT_PRINT_COLUMNS: PrintColumnId[] = [
  "rank",
  "building",
  "apartment_number",
  "rooms",
  "floor",
  "layout",
  "type",
  "area_sqm",
  "price",
  "score",
];

/* ─── HTML escaping ──────────────────────────── */

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
}

/* ─── Builder & opener ───────────────────────── */

export interface PrintOptions {
  /** Apartments to print, already filtered/sliced by caller (in order). */
  rows: RankedApartment[];
  /** Column ids to include, in the order to render. */
  columnIds: PrintColumnId[];
  /** Render a sub-row with each apartment's note (when present). */
  includeNotes: boolean;
  /** Render a header block with profile name + print date + total rows. */
  includeMetadata: boolean;
  /** Notes by apartment slug. */
  notes: Record<string, string>;
  /** Active profile (used for the metadata header & document title). */
  profile: Profile | null;
  /** Resolved locale for label/format selection. */
  locale: "en" | "he";
  /** Translated "Notes" label (used when notes are included). */
  notesLabel: string;
  /** Translated document title prefix, e.g. "Ranked Apartments". */
  titleLabel: string;
  /** Translated "printed on" label for the footer. */
  printedOnLabel: string;
  /** Translated "Total" label for the metadata header. */
  totalLabel: string;
  /** Translated "Profile" label for the metadata header. */
  profileLabel: string;
}

function buildPrintHtml(opts: PrintOptions): string {
  const {
    rows, columnIds, includeNotes, includeMetadata, notes, profile, locale,
    notesLabel, titleLabel, printedOnLabel, totalLabel, profileLabel,
  } = opts;

  const dir = locale === "he" ? "rtl" : "ltr";
  const lang = locale === "he" ? "he" : "en";

  const cols = columnIds
    .map((id) => PRINT_COLUMNS.find((c) => c.id === id))
    .filter((c): c is PrintColumn => !!c);

  const dateStr = new Date().toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const profileName = profile?.name ?? "";
  const docTitle = profileName
    ? `${titleLabel} — ${profileName}`
    : titleLabel;

  // Score-rank lookup: 1, 2, 3… in the order the rows are passed in
  // (skipping sold rows for parity with on-screen ranking).
  let rankCounter = 0;

  const headerCells = cols
    .map(
      (c) =>
        `<th style="text-align:${c.align === "end" ? (dir === "rtl" ? "left" : "right") : c.align}">${escapeHtml(c.label[locale])}</th>`
    )
    .join("");

  const bodyRows = rows
    .map((r) => {
      let rank: number;
      if (r.apartment.isSold) {
        rank = NaN; // displayed as blank
      } else {
        rankCounter += 1;
        rank = rankCounter;
      }

      const cells = cols
        .map((c) => {
          let value: string;
          if (c.id === "rank") {
            value = Number.isNaN(rank) ? "" : String(rank);
          } else {
            value = c.get(r, Number.isNaN(rank) ? 0 : rank, locale);
          }
          const align = c.align === "end" ? (dir === "rtl" ? "left" : "right") : c.align;
          return `<td style="text-align:${align}">${escapeHtml(value)}</td>`;
        })
        .join("");

      const soldClass = r.apartment.isSold ? " class=\"sold\"" : "";
      const dataRow = `<tr${soldClass}>${cells}</tr>`;

      const note = notes[r.apartment.property_slug];
      if (includeNotes && note && note.trim()) {
        const noteCell = `<td colspan="${cols.length}" class="note"><span class="note-label">${escapeHtml(notesLabel)}:</span> ${escapeHtml(note)}</td>`;
        return `${dataRow}<tr class="note-row">${noteCell}</tr>`;
      }
      return dataRow;
    })
    .join("");

  const metaBlock = includeMetadata
    ? `<header class="meta">
        ${profileName ? `<div><strong>${escapeHtml(profileLabel)}:</strong> ${escapeHtml(profileName)}</div>` : ""}
        <div><strong>${escapeHtml(totalLabel)}:</strong> ${rows.length}</div>
        <div><strong>${escapeHtml(printedOnLabel)}:</strong> ${escapeHtml(dateStr)}</div>
      </header>`
    : "";

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(docTitle)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${locale === "he" ? "'Segoe UI', 'Arial Hebrew', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif"};
    color: #111;
    padding: 16px;
    font-size: 12px;
    line-height: 1.4;
  }
  h1 {
    font-size: 18px;
    margin: 0 0 8px;
  }
  header.meta {
    margin-bottom: 12px;
    padding: 8px 12px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  th, td {
    border: 1px solid #ccc;
    padding: 4px 6px;
    vertical-align: top;
  }
  th {
    background: #eee;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  tr { break-inside: avoid; page-break-inside: avoid; }
  tbody tr:nth-child(even):not(.note-row) { background: #fafafa; }
  tr.sold td { color: #888; text-decoration: line-through; }
  tr.note-row td.note {
    background: #fffbe6;
    font-style: italic;
    color: #555;
    border-top: none;
  }
  .note-label { font-style: normal; font-weight: 600; color: #333; }
  footer.print-footer {
    margin-top: 12px;
    text-align: center;
    color: #888;
    font-size: 10px;
  }
  @page { size: A4; margin: 14mm; }
  @media print {
    body { padding: 0; }
    header.meta { background: transparent; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(docTitle)}</h1>
  ${metaBlock}
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <footer class="print-footer">${escapeHtml(printedOnLabel)}: ${escapeHtml(dateStr)}</footer>
</body>
</html>`;
}

/**
 * Open a new tab with the printable HTML and trigger the browser's
 * print dialog. Returns `false` if the popup was blocked.
 */
export function openPrintView(opts: PrintOptions): boolean {
  const html = buildPrintHtml(opts);
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Wait for layout/fonts before printing.
  const doPrint = () => {
    w.focus();
    w.print();
  };
  if (w.document.readyState === "complete") {
    setTimeout(doPrint, 100);
  } else {
    w.addEventListener("load", () => setTimeout(doPrint, 100));
  }
  return true;
}
