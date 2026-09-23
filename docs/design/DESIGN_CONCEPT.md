# Design concept

## Direction: calm market ledger

CartCheck should feel like a quiet, useful shopping notebook: clear list rows, honest price labels, and a visible budget without retail promotions or decorative product imagery. Use warm stone surfaces, deep olive for primary actions, and a restrained terracotta warning. No gradients, neon colors, oversized hero images, or decorative motion.

The active cart is the visual center. Product images, when provided by URL, are small supporting thumbnails with a neutral placeholder. Product names, quantity and unit, price, bought state, and row actions remain readable without an image.

## Hierarchy and layout

1. Page title and one clear primary action.
2. Budget and estimated/paid totals near the top of the cart, always labeled with currency. Unknown prices show an “Incomplete estimate” note.
3. Search/filter controls before catalog results; each result exposes its unit and last-paid or reference price source.
4. Plain list rows instead of nested cards. Use section headers, spacing, and thin dividers to group items.
5. Finish Trip is prominent on the cart but separated from item editing, followed by a confirmation review.

Use a centered content region on large screens (maximum 1200px). On desktop, a narrow navigation rail sits beside the content; the cart may use a second column for budget and trip summary. Mobile uses one column and a bottom navigation bar with visible text labels. At phone landscape widths, use compact horizontal navigation and let the cart summary sit beside the list when space allows. No horizontal scrolling for essential controls.

## Motion and interaction

- Use short, consistent transitions (about 150–220ms) for view changes, checked-row movement, filter changes, and feedback. Animate opacity and small position changes only; never delay a task behind an animation.
- Preserve scroll and keyboard focus sensibly after adding, hiding, or editing an item. Confirm a successful save with a brief status message.
- Mark/unmark bought is immediate and reversible. “Hide checked” only changes visibility, with a count showing how many are hidden.
- Finish Trip and past-trip edits require a review/confirmation step. Keep the original trip date visible when correcting history.
- Respect `prefers-reduced-motion: reduce` by removing nonessential movement.

## Responsive and accessible behavior

Design first at 320px phone width, then test typical portrait, landscape, tablet, and desktop widths. At narrow widths, stack row metadata and keep controls at least 44×44px. At wider widths, align quantity, unit price, and total in columns. Sticky navigation and summary areas must not cover content or focus targets; allow for safe-area insets. Support keyboard-only use, visible focus, text zoom to 200%, semantic labels, and contrast of at least 4.5:1 for normal text. Color never carries bought, warning, or error meaning alone.

## Reference boundaries

The provided images suggest compact grocery cards and prominent totals. This design deliberately uses a ledger-like list, neutral palette, text-first products, and “Finish Trip” language suited to a checklist. It does not include social list sharing, ordering, delivery, or payment controls shown or implied by the references.
