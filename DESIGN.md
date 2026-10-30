---
name: CartCheck
description: A private grocery checklist for planning a shop and recording finished trips.
colors:
  primary: "#176b45"
  primary-hover: "#125537"
  on-primary: "#ffffff"
  brand-header: "#0a3125"
  mint: "#b2e7bc"
  canvas: "#f4f7f4"
  surface: "#ffffff"
  surface-muted: "#f7f9f7"
  surface-hover: "#eef4ef"
  text: "#172b26"
  muted-text: "#42584e"
  border: "#d7e2d9"
  border-hover: "#6f8273"
  control-border: "#7f8f81"
  margin-rule: "#c9dccd"
  error: "#9c3737"
  error-surface: "#fff5f5"
  warning: "#8b4b36"
  success: "#237847"
  primary-dark: "#9cd8ad"
  on-primary-dark: "#102619"
  canvas-dark: "#0d0f0e"
  surface-dark: "#161917"
  surface-muted-dark: "#1b1e1c"
  surface-hover-dark: "#242825"
  text-dark: "#f4f6f5"
  muted-text-dark: "#a8b0ac"
  border-dark: "#3b423e"
  error-dark: "#f1a0a0"
  warning-dark: "#e6a98d"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"
    fontSize: "clamp(32px, 3.2vw, 44px)"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 700
  item:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 650
  meta:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"
    fontSize: "13px"
rounded:
  control: "12px"
  card: "18px"
  auth: "24px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 13px"
    height: "46px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "22px"
  nav-header:
    backgroundColor: "{colors.brand-header}"
    textColor: "{colors.on-primary}"
    height: "76px"
  nav-item-active:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.brand-header}"
    rounded: "{rounded.control}"
---

# Design System: CartCheck

> Purpose: the shipped visual system (tokens, components, responsive rules). · Read when: building or changing any UI. Tokens live as CSS custom properties in `client/src/styles.css`; keep this file and that file in sync.

## Overview

**Creative North Star: "The Market Notebook"**

CartCheck is a pocket notebook carried down the aisle: practical, legible with one hand, and calm enough to trust while you shop. The checklist does the talking. Prices, budgets and totals sit nearby but quieter, because a shopper must be able to finish a trip without them.

The notebook is literal on the list screen: the list is a ruled page with a thin vertical margin line, item names sit in the text column to its right, and checking an item draws a tick into its circle like a pencil mark and strikes the name through.

The surfaces are paper-like neutrals with one deep green accent, a dark brand-green header, and mint as a small highlight. Forms are soft and steady, with rounded controls and cards, thin borders, a faint ambient shadow and generous touch targets. Built with React, semantic HTML and CSS custom properties; no UI component package.

**Key Characteristics:**
- One accent (deep green, mint in dark mode); everything else is neutral.
- Soft and steady forms: 12px controls, 18px cards, 48px touch targets.
- Light, Dark and System appearance, chosen in Settings and stored in the browser; System follows the device.
- Money and totals in tabular numerals; unknown amounts read as incomplete, never as zero.

## Colors

A quiet, green-tinted neutral palette with a single working accent and a dark brand header.

### Primary
- **Market Green** (`primary`): actions, selected controls, focus rings, progress fill. In dark mode it becomes **Soft Mint Green** (`primary-dark`) on a deep-green text color (`on-primary-dark`).
- **Pressed Green** (`primary-hover`): hover state of primary actions.

### Secondary
- **Notebook Cover Green** (`brand-header`): the top header in light mode and the desktop auth story panel in both themes, which blends with the official wordmark background.
- **Mint Tab** (`mint`): the active item in the header and phone navigation, text selection, and focus outlines on dark green.

### Neutral
- **Paper Canvas** (`canvas` / `canvas-dark`): page background.
- **Page White** (`surface` / `surface-dark`): cards, dialogs, inputs.
- **Faint Wash** (`surface-muted`, `surface-hover` and their dark pairs): muted fields, hover rows, elevated dark surfaces.
- **Ink** (`text` / `text-dark`) and **Pencil** (`muted-text` / `muted-text-dark`): primary and secondary copy.
- **Ruled Line** (`border` / `border-dark`, `border-hover`, `control-border`): dividers, list rules, field strokes (`control-border` keeps at least 3:1 against `surface`), unchecked circles.
- **Margin Line** (`margin-rule`): the single vertical margin line on the list page. Decorative; never carries meaning.
- **Status** (`error`, `warning`, `success` and dark pairs): always paired with text.

### Named Rules
**The One Ink Rule.** Green is the only accent. Mint stays a small highlight; never add a second hue for emphasis.
**The Words-Not-Color Rule.** Warnings, errors, over-budget and unknown-price states always carry text. Color is never the only signal. Check every text/background pair against WCAG AA.

## Typography

**Body Font:** system-ui (with -apple-system, Segoe UI, Arial, sans-serif)

**Character:** One native system stack for instant loading and familiar legibility. Hierarchy comes from size and weight, with a slight negative tracking on large headings.

### Hierarchy
- **Display** (`display`): the desktop auth story headline only.
- **Headline** (`headline`): page titles; 28–30px on phones.
- **Title** (`title`): section and panel headings (18–22px depending on context); list section headings (To buy, Bought) at 16px.
- **Body** (`body`): copy and controls; helper text at 13–14px.
- **Label** (`label`): field labels above controls, buttons, navigation.
- **Item** (`item`): list and catalog item names, readable at arm's length.
- **Meta** (`meta`): category, quantity notes and recorded prices under an item.

No text is smaller than 12px. There are no kicker or eyebrow labels above headings: a heading carries its own weight.

### Named Rules
**The Ledger Numbers Rule.** Every amount, total and count uses `font-variant-numeric: tabular-nums`.

## Layout

The spacing rhythm is 4, 8, 12, 16, 24 and 32px. Breakpoints are layout guides, not device names; test content fit and zoom before fixing exact values.

- **Phone portrait (≤700px):** one column with labeled bottom navigation and 16px gutters. On the list screen the title, progress and two equal actions (Browse catalog, Finish shopping) sit above the find field, so the first item shows in the first screen.
- **Tablet (701–959px):** a compact dark top header, with two columns only where each stays readable.
- **Desktop (≥960px):** a dark top header with a wider list/summary arrangement.
- **Shell:** a centered 1600px shell (including padding) for the header, Shopping List and Catalog, with fluid 24–32px desktop gutters (`clamp(24px, 2vw, 32px)`).
- **Shopping List:** a 3:1 list/summary split above 959px, with a 280px sidebar minimum.
- **Catalog:** auto-fill columns with a 280px card minimum; one column on mobile.
- **Width caps:** Trips 1280px; Settings and item editors 960px.
- **Authentication:** a 1240px shell with a 480px form cap. The desktop story panel uses `brand-header`; below 760px the story area is transparent and its copy is hidden.

## Elevation & Depth

A nearly flat system with tonal layering. Cards, panels, list surfaces and the auth card share one faint ambient shadow; everything else is flat and separated by thin borders. In dark mode, depth comes from lighter surface steps (`surface-muted-dark`, `surface-hover-dark`) rather than heavier shadows.

### Shadow Vocabulary
- **Ambient card** (`box-shadow: 0 8px 28px rgb(23 43 38 / 4%)`; dark: `rgb(0 0 0 / 22%)`): panels, budget panel, list cards, trip cards, list surfaces, the catalog added bar and the auth card.

### Named Rules
**The Paper Stack Rule.** One shadow level only. Hierarchy comes from borders and surface tone, not stacked elevation.

## Shapes

Soft, consistent rounding with thin 1px borders. Controls (buttons, inputs, selects, nav items, notices, alerts) use `control`. Cards and panels use `card`. The auth card uses `auth` (20px on phones). Progress bars, filter chips and the bought checkmark are fully round.

## Components

### Buttons
- **Shape:** gently rounded (`control`), at least 48px tall; small buttons and text buttons 44px.
- **Primary:** Market Green fill with white label, 14px bold. Use one dominant action per area, such as **Create list** or **Review and finish** once everything is checked off.
- **Secondary:** a white surface with a ruled border; hover tints to `surface-hover`. Use it for edit, cancel, filters and low-emphasis actions.
- **Text button:** a green bold label with no chrome; underline on hover.
- **Focus / Disabled:** a 3px primary outline offset 3px (mint on dark green surfaces); disabled at 65% opacity. Busy states keep the label readable.
- **Destructive:** a clearly labeled action in the error color. Removing a list item or deleting a custom catalog item asks inline ("Remove from this list?" with Keep and Remove), not in a browser dialog. Deleting a whole list confirms the same way on its card.

### Cards / Containers
- **Corner Style:** `card`.
- **Background:** `surface`, with a 1px `border` and the ambient card shadow.
- **Internal Padding:** 22px (18px on phones; 16px on trip screens).
- **Product row:** a card with the name and category, a quiet Edit or Customize link and an Add action outlined in Market Green. An item already on the destination list reads "on this list" and its action becomes Change, which opens that entry for editing. No brand, variant or price is required.
- **List row:** a 44px check target holding a 28px drawn circle, then one row-wide button with the item name, category, any recorded price ("est. ₱90.00 · paid ₱85.00") and the quantity at the right. Nothing is printed for unknown prices. Tapping the row opens an inline editor directly under it (quantity first, then name, unit and both item totals), which also holds Remove. Bought rows stay readable with a struck-through name.
- **Find or add:** one search field above the list. Typing filters the list and offers up to five catalog matches not yet on it, each with Add. With no match it points to the catalog.

### Inputs / Fields
- **Style:** 46px tall, 1px `border`, `control` radius, `surface` fill (`surface-muted` in dark mode). The label sits above the control.
- **Hover / Focus:** the border shifts to `border-hover`, then to `primary` on focus.
- **Error:** an inline message connected to the field.
- **Money fields:** estimated and actual **item total** fields show the currency, accept `0.00`, and keep blank (unknown) distinct from zero. Quantity accepts positive whole or decimal values plus an optional short unit label.

### Navigation
- **Items:** My Lists, Catalog, Trips and Settings at every width, with visible text labels and the current page announced via `aria-current`.
- **Desktop and tablet:** a `brand-header` bar, 76px tall (64px on small phones), with bold 13px labels; the active item sits on Mint Tab.
- **Phone portrait:** a fixed labeled bottom bar on `surface` with a top border; the active item is primary-colored.
- **Logo:** the clickable logo keeps a keyboard focus outline but has no hover effect.

### Progress
- "3 of 10 bought" under the list title, with a 6px pill track (`progress-track`) whose primary fill animates its width at 0.2s.
- When nothing is left to buy, a completion panel ("Everything’s checked off.") offers the primary Review and finish.
- The tick draws in about 0.3s with an exponential ease-out. All animation is off under reduced motion.

### Feedback & States
- **Budget summary:** the optional budget, known estimated and actual subtotals, missing-price counts, and remaining or over amount where meaningful. Incomplete amounts are labeled; currencies are never combined.
- **Feedback:** inline field errors, page-level retry on load failure, polite status on save, a clear next action on empty states, and confirmation before Finish Trip or a past-trip correction. Each check is announced once ("Bananas bought. 6 left."), and keyboard focus moves to the next item to buy. After finishing, My Lists shows "<list> is saved in Trips" with View trip.
- **Shop again:** trip details offer Shop again as the primary action; it opens an inline panel (all items or only the not bought, plus a list name) and then opens the new list.
- **Catalog adds:** adding a new item keeps the shopper in the catalog; a sticky bar counts the adds and offers Back to list.
- **Dialog / review:** focus moves into the review, stays trapped while it's open, and returns to its trigger on close. Escape closes without committing.
- **Loading:** visible text and stable placeholder geometry; no misleading zero totals.
- **Empty states:**
  - **No lists:** offer Create list.
  - **Empty selected list:** the find-or-add field plus Browse catalog, with the destination retained.
  - **No catalog results:** show the searched term and offer to create it as a new item, keeping the term.
  - **No history:** explain that finished trips appear here after Finish Trip.
- **Error / offline:** keep entered data when possible, say what failed, and offer retry.
- **Over budget / unknown price:** a text message next to the affected amount. Missing amounts never appear as zero.
- **Image unavailable:** a neutral placeholder with the product name still visible.

## Do's and Don'ts

### Do:
- **Do** keep checklist actions primary and prices and budget visually secondary.
- **Do** use the CSS custom properties in `client/src/styles.css`. Never hard-code a hex value in a component.
- **Do** keep the official wordmark assets in `client/public/`.
- **Do** honor `prefers-reduced-motion`; transitions stay short (0.16–0.2s ease).
- **Do** keep every interactive target at least 44px tall, with a visible focus outline.
- **Do** show a price only when one is recorded; the budget panel carries the incomplete counts.

### Don't:
- **Don't** add a second accent hue or a UI component library.
- **Don't** put kicker or eyebrow labels above headings, or use Unicode glyphs as icons; icons are drawn SVG.
- **Don't** signal state by color alone.
- **Don't** show an unknown amount as `0.00`.
- **Don't** stack shadows or add elevation levels beyond the single ambient card shadow.
