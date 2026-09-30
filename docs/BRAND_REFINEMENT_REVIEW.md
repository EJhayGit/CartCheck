# Brand and appearance review — September 30, 2026

Local implementation only; no Git push or Render deployment. Production verification configuration, database, email templates, and API contracts are unchanged.

## Brand assets and palette

The uploaded 2508 × 627 PNG is preserved in `docs/design/brand-assets/cartcheck-logo-approved.png`. Its textured background makes a faithful background-preserving derivative preferable to transparency. Interface wordmarks retain the 4:1 ratio: `client/public/cartcheck-wordmark-384.webp` (4.4 KB) and `cartcheck-wordmark-768.webp` (8.5 KB). Responsive image selection avoids downloading the original for headers. The favicon is the existing C cropped from the approved lettering, centered without distortion; no lettering was generated.

Sampled dominant green: **#0A3125**. Sampled mint dot: **#B2E7BC**. Light retains canvas #F4F7F4, white surfaces, text #172B26 and primary #176B45. Dark uses canvas #10271F, surface #19372C, off-white #F0F2EA, muted #B5C1B3, and primary #A9C9A5 with dark foreground. Semantic tokens cover surfaces, controls, borders, errors, warning, strength meter, and decorative authentication content.

## Behavior and refinement

- Reusable official logo returns authenticated shoppers to Shopping List and unauthenticated visitors to Sign In, using existing page state without reload. Guards preserve pending shopping/settings/review/account requests and mandatory verification.
- Four inline SVG navigation icons add no dependency. Mint active pills, visible labels, accessible current-page state, 44px minimum targets, safe-area inset and footer clearance improve phone navigation; compact tablet navigation preserves desktop destinations.
- Appearance offers Light / Dark / System. Browser-local preference `cartcheck.appearance` survives navigation and refresh. System listens to OS preference changes; cross-tab storage events synchronize preferences. Missing/blocked storage retains usable in-memory behavior. Light remains the default for new visitors. External `theme-init.js` applies the preference before React/CSS and works with the existing self-only script CSP.
- Shared radii, soft borders/shadows, hover/focus colors and restrained transitions refine existing cards, fields, catalog/list/trip/budget/settings and account screens. Reduced motion is respected.
- Dynamic-year footer links Built by Mer to https://merzbuilds.dev. Mobile footer clears fixed navigation.

## Files changed

`client/index.html`, `client/public/theme-init.js`, the three optimized public brand assets, `client/src/Brand.jsx`, `appearance.js`, `App.jsx`, `AuthUI.jsx`, `AccountFlows.jsx` (pending-state reporting only), `styles.css`, `authBehavior.test.js`, `client/tools/shopping-preview.html/.jsx`, design-system documentation and this review/gallery. The source logo and screenshots live under `docs/design/brand-assets` and `docs/design/brand-preview`.

## Validation

Frontend suite passes (39 tests), including saved/system appearance updates and listener cleanup, logo navigation without extra requests, pending-email navigation guards, and existing authentication/password/shopping calculations. Production build passes. Existing lazy password estimator still produces Vite's large-chunk warning; this work adds no dependencies. Backend code was not modified, so no database/integration suite was run.

Browser checks used isolated local fixtures, with no real accounts, email requests or database writes: all four destinations; dark persistence after refresh; branded login in both appearances; 375/390/768/1440 CSS-pixel widths without horizontal overflow; mobile navigation targets at least 44px; mint active labels with dark foreground; desktop hover/mobile focus corrections; footer placement. Basic accessibility uses labeled controls, aria-pressed appearance choices, aria-current navigation, decorative icons and focus indicators. System OS changes are covered with a simulated matchMedia event in the DOM test; actual OS preference changes, physical-device safe-area insets and a full screen-reader audit remain device-level verification limits.

Review corrected unreadable light header hover, low-contrast mobile focus, oversized desktop icons, tablet fit, and leaving pending account requests via the logo. Screenshots may reflect browser zoom/render scaling; the responsive checks use measured CSS viewport dimensions. Open the gallery for before/after views and the local interactive preview for accurate detail.

[Visual gallery](design/brand-preview/index.html)
