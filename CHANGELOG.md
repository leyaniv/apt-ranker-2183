# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- Scoring panel shows a sold/available stats bar for each value.
- Added assigned parking spot numbers to apartment data and the detail view.
- Main tab bar: Buildings is its own tab; Change history is opened from a clock icon next to the profile selector.
- Buildings tab: Wide and Narrow layout modes. Wide groups buildings per lot into three columns.
- Ranking tab filters: Support selecting multiple values at once via a checkbox dropdown. Direction is a new filter (N/E/S/W).
- Apartment detail: manual adjustment slider (-10%..+10%) to nudge an apartment's overall match up or down per profile.
- Apartment area now uses four buckets instead of five. The previously empty 90–110 m² bucket has been folded in. Existing profiles and imported JSON files are migrated automatically.

## [1.4.1] - 2026-05-06

- Buildings view now has collapse/expand all button, improved color consistency, and better mobile layout.
- Reduced mobile margins and padding across the app to maximize usable space.
- Sold button in apartment details shows the date the apartment was sold (e.g. "Sold (03/05/2026)").
- Apartments sold today are highlighted with a brighter red in the buildings view.

## [1.4.0] - 2026-05-04

- Added a new Buildings view on the Results tab that lays each building's apartments out as a grid of floors × air-direction columns.

## [1.3.1] - 2026-05-04

- Fixed apartment plan PDF links.

## [1.3.0] - 2026-05-02

- Added a Print button on the Results tab that opens a printable view with column, row-scope, and notes options.
- Apartments can be excluded from a profile's ranking either by marking a value with ✕ (deal-breaker) or by clicking "Mark as excluded" on a specific apartment. Excluded apartments are hidden by default; a "Show excluded" toggle reveals them.

## [1.2.0] - 2026-05-02

- Sold apartments should now show up with a "Sold" badge. Additional "Hide sold" filter toggle and a "Mark as sold" button in the detail view (marks persist across profiles).
- Results table adapts to the available width, revealing extra columns as space allows.
- Polished apartment details with score contributions and overall match percentage.
- Polished mobile experience across apartment details, comparison views, and profile management.

## [1.1.1] - 2026-04-25

- Simplified air-direction scoring to four cardinals (N/E/S/W).
- Cleaner, more stable price/area buckets with friendlier labels (e.g. "< €1.2M", "≥ 130 m²").
- Anonymous, aggregate usage events (no personal data) to help guide future improvements.

## [1.1.0] - 2026-04-25

- The app now works well on phones — tighter layout and collapsible filters.
- Redesigned the Combine tab for a simpler, friendlier flow.
- Score and weight sliders feel snappier while dragging.

## [1.0.0] - 2026-04-24

- Initial public release.
