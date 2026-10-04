# Large-screen layout review — October 4, 2026

Local implementation only; no commit, push, or deployment. Screenshots use fictitious fixtures from `client/tools/shopping-preview.jsx`, with no database access or shopper data.

## Layout changes

| Area | Previous maximum width | New maximum width |
| --- | --- | --- |
| Header inner shell | 1200px | 1600px |
| Shopping List | 960px | 1600px |
| Catalog | 1152px | 1600px |
| Trips and finish review | 1150px | 1280px |
| Settings | 720px | 960px |
| Authentication | 1240px shell / 480px form | Unchanged |

Widths include padding. Header, Shopping List, and Catalog share centered sizing and `clamp(24px, 2vw, 32px)` horizontal gutters. Existing mobile gutters remain 16px. At the maximum shell width, usable content is 1536px.

Shopping List retains its existing list/summary arrangement at 960px and above, now using `3fr / 1fr` with a 280px sidebar minimum and a 24px gap. Below 960px it stacks. Purchase progress stays above the checklist, preserving its existing reading and keyboard order. The budget sidebar remains in normal document flow to avoid obscuring controls on shorter screens. Item and catalog editors are capped at 960px.

Catalog uses `auto-fill` and a 280px minimum card width, with 16px grid spacing. Verified column counts: 390px → 1, 768px → 2, 1024px → 3, 1440px → 4, 1920px and 2560px → 5. Above 700px, actions occupy a separate card row so long names and custom-item controls fit. Mobile cards preserve their existing inline controls. `auto-fill` prevents a single search result from stretching across the shell.

Trips retains separate history, details, and correction screens. A master/detail change would introduce additional selection/navigation behavior, so this refinement uses the requested wider constrained fallback. Settings remains a centered single column. Authentication layout, navigation destinations, API behavior, and shopping logic are unchanged.

The logo's hover ring is removed. Its button, home handler, disabled behavior, and mint keyboard focus outline remain intact.

## Verification

- Frontend tests: 39 passed, 0 failed (`npm test`).
- Production Vite build: passed (`npm run build`). Existing password-strength chunk warning remains; no dependency changes.
- Browser matrix: Shopping List, Catalog, Trips, Settings in both themes at 390, 768, 1024, 1440, 1920, and 2560 CSS pixels (48 combinations). No horizontal overflow found; measurements are saved in `design/layout-preview/checks.json`.
- Visual review includes aligned header/main gutters, bounded cards and forms, mobile bottom navigation, long custom catalog names, partial price totals, trip details, and logo keyboard navigation.
- Breakpoints retained: 600px compact header, 700px mobile cards/navigation, 959px maximum stacked shopping layout, 760px and 1000px authentication rules. Catalog columns otherwise follow available space rather than fixed device breakpoints.

## Files

- `client/src/styles.css`: responsive dimensions, catalog grid/card layout, editor constraints, logo hover removal.
- `client/tools/shopping-preview.jsx`: richer isolated visual fixtures with a long custom product, optional prices, budget, and trip history.
- `docs/design/DESIGN_SYSTEM.md`: records the approved implementation's width rules.
- This review and `docs/design/layout-preview/`: screenshots, browser measurements, and gallery.
- `log.md`: appended local task record; remains Git-ignored.

Open [the screenshot gallery](design/layout-preview/index.html) to compare light and dark appearances. These are local visual checks; no backend integration or production smoke test was needed for the CSS-only application change.
