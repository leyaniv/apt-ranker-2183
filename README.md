# Eshel Hayarden — Apartment Ranker (Raffle 2183)

A local-first web app for scoring and ranking the apartments offered in the **Eshel Hayarden** housing lottery (Raffle 2183, project 208 in Haifa). Set how important each parameter is, tell the app which values you prefer, and get a personalised ranking of every available apartment. Nothing leaves your browser.

> **Status:** v1.1.1 — see [CHANGELOG.md](CHANGELOG.md).

![Stack: React 19 · TypeScript · Vite 8 · Tailwind 4](https://img.shields.io/badge/stack-React%2019%20%C2%B7%20TypeScript%20%C2%B7%20Vite%208%20%C2%B7%20Tailwind%204-0b7285)

---

## Highlights

- **Weighted, transparent scoring.** Each apartment parameter (rooms, floor, building, direction, price, area, balcony, storage, parking, apartment type, layout, …) has an importance weight (1–5) and per-value preference scores (1–5). The final score is a normalised weighted average you can inspect per apartment.
- **Bucketed and categorical scorers.** Numeric parameters (price, area, floor) use adjustable buckets; categorical parameters (building, direction, layout, type) score each distinct value individually.
- **Multiple profiles.** Create, rename, duplicate, reorder, and delete profiles to compare different priority sets (e.g. one per family member). The active profile is persisted.
- **Ranked results table.** Virtualised list of all apartments with live filtering (rooms, building, layout, type, price range), per-row score breakdown, linked PDFs, and a detail panel with notes.
- **Manual ordering.** Drag rows to pin a manual ranking that overrides the score-based order. Save to the current profile or fork it into a new one. Unsaved manual order is detected and you are prompted before leaving.
- **Compare tab.** View two profiles side-by-side, or generate a **combined** ranking that merges multiple profiles into a single consensus order.
- **Change history.** Every meaningful edit (weights, scores, manual order, profile actions) is logged per profile so you can see how your preferences evolved.
- **First-run onboarding tour.** Interactive walkthrough with demo profiles, replayable anytime from the `?` icon in the header.
- **Import / Export.** Save a single profile or a bulk export as JSON for backup or sharing. Import is version-aware (rejects legacy / newer files with a clear message).
- **Bilingual UI with full RTL.** English and Hebrew, auto-detected and switchable from the header.
- **About dialog.** Version, in-app changelog viewer, disclaimer, contact, donate link, and a link to the real-estate developer's site.
- **Local-first.** Everything is stored in `localStorage` — no accounts, no backend, no personal data ever leaves your browser. See [Privacy](#privacy).

## Tech Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS 4** (via `@tailwindcss/vite`)
- **Radix UI** primitives — `Select`, `Slider`, `Tabs`, `ToggleGroup`, `Collapsible`
- **react-window** for virtualised tables
- **i18next** + **react-i18next** + language detector
- **Python 3** + `requests` + `beautifulsoup4` for the data scraper

## Quick Start

```bash
npm install
npm run dev          # http://localhost:5173/
```

## Scripts

| Command           | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Start the Vite dev server with HMR.            |
| `npm run build`   | Type-check (`tsc -b`) and build to `dist/`.    |
| `npm run preview` | Serve the production build locally.            |
| `npm run lint`    | Run ESLint on the whole workspace.             |

## How to Use

1. **Create a profile** — click **+ New Profile** in the header and give it a name.
2. **Score your preferences** in the **Scoring** tab:
   - Each parameter has a card with an importance slider (1–5) and per-value preferences (1–5, default 3 = neutral).
   - Use **Randomize** for a quick starting point or **Reset All** to clear.
3. **Browse results** in the **Results** tab — apartments ranked best-to-worst. Filter by rooms, building, layout, type, or price range. Click a row for full details, PDF links, and per-apartment notes.
4. **Reorder manually** by dragging rows. Save the order to the current profile or fork it into a new one.
5. **Compare profiles** in the **Compare** tab — side-by-side or combined (consensus) ranking.
6. **Audit your edits** in the **History** tab.
7. **Export / Import** profiles as JSON from the profile menu — single profile or bulk.
8. **Switch language** (English / Hebrew) and open **Settings** / **About** from the header.

All state lives in your browser's `localStorage`. Clearing site data resets the app.

## Data Pipeline

The apartment dataset is produced by the scraper in [tools/scraper/](tools/scraper/), which queries the WordPress REST API of `haifa.eshelltd.co.il`, scrapes each apartment's detail page, and downloads the associated PDFs (apartment plans, specifications). Output is written to [data/apartments.json](data/apartments.json) and mirrored to [public/data/apartments.json](public/data/apartments.json) for the app to consume.

```bash
cd tools/scraper
pip install -r requirements.txt
python scraper.py
```

## Privacy

The app is **100% local-first**. Everything you do — profiles, weights, scores, manual order, notes, change history, settings — is stored only in your browser's `localStorage` on your own device.

- **No backend.** There is no server component. The app is a static bundle served as HTML/JS/CSS.
- **No account, no login.** Your profiles, scores, notes and history never leave your browser.
- **No cloud sync.** Sharing or backing up is opt-in via the manual JSON **Export** / **Import**.
- **You are in control.** Clearing your browser's site data for the app wipes all of it.

### Analytics

The site uses two complementary, privacy-respecting trackers:

- **[Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/)** — auto-injected by Cloudflare Pages. Handles pageviews, referrers, country, browser and Core Web Vitals.
- **[Umami Cloud](https://umami.is/)** — loaded via a `<script>` tag in `index.html`. Handles a small set of anonymous custom events (e.g. `tab_viewed`, `profile_created`, `onboarding_completed`, `setting_changed`, `external_link_clicked`).

Both are:

- **Cookieless** — no client-side storage used for tracking.
- **Privacy-first by design** — no IP addresses stored long-term, no cross-site tracking, no fingerprinting, no personal data.
- Limited to coarse aggregates and low-cardinality event categories.

No profile data, apartment data, scores, notes, or settings are ever transmitted. See [src/utils/analytics.ts](src/utils/analytics.ts) for the implementation.

## Disclaimer

This is an **unofficial** tool built to help prospective residents reason about their preferences. The author is not responsible for mistakes, inaccuracies, or data inconsistencies. Use at your own risk, and always verify critical details against the official lottery documentation from [Eshel Haifa](https://haifa.eshelltd.co.il/).

## Support

If you find the tool useful: [☕ Buy me a coffee](https://ko-fi.com/yanivlevinsky)

## Troubleshooting

**PowerShell blocks `npm run dev` with an execution-policy error.**
PowerShell may refuse to run the `npm.ps1` / `npx.ps1` shims depending on your system policy. Workarounds:

- Run Vite directly via Node (no shell script involved):
  ```powershell
  node node_modules\vite\bin\vite.js
  ```
- Or relax the policy for the current user (run once, in an elevated PowerShell):
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
  ```
- Or use `cmd.exe` / Git Bash instead of PowerShell.

## License

Released under the [MIT License](LICENSE).
