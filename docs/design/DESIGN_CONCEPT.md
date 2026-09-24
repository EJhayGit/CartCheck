# Design concept

## Direction: clean grocery checklist

CartCheck should feel clean, light, and easy to scan: a pale `#F4F7F4` application background, a dark `#172B26` navigation header, white grocery-item cards, dark readable text, and natural green `#176B45` primary actions. Optional money details remain secondary. No gradients, neon colors, oversized hero images, or decorative motion. The original `03-design-system.pdf` is the visual authority for this direction.

The active cart is the visual center. Product images, when provided by URL, are small supporting thumbnails with a neutral placeholder. Product names, quantity and unit, bought state, and row actions remain readable without an image or price.

## Hierarchy and layout

1. Page title and one clear primary action.
2. Item names, quantities, and purchase checkboxes are primary. Optional budget and known estimated/actual totals sit in a secondary summary, labeled by currency and completeness.
3. Search/filter controls before catalog results; each result exposes its category and a direct Add action. No price is needed to add it.
4. White item cards with comfortable padding. Use section headers and even spacing to group remaining and purchased items; keep each card visually simple.
5. Finish Trip is prominent on the cart but separated from item editing, followed by a confirmation review that permits missing prices.

Use a centered content region on large screens (maximum 1200px). A dark top navigation header anchors the desktop layout; the cart may use a second column for the optional budget and trip summary. Mobile portrait uses one column and a bottom navigation bar with visible text labels. Phone landscape retains the dark compact top header and may place the summary beside the list. No horizontal scrolling for essential controls.

## Motion and interaction

- Use short, consistent transitions (about 150–220ms) for view changes, checked-row movement, filter changes, and feedback. Animate opacity and small position changes only; never delay a task behind an animation.
- Preserve scroll and keyboard focus sensibly after adding, hiding, or editing an item. Confirm a successful save with a brief status message.
- Mark/unmark bought is immediate and reversible. “Hide checked” only changes visibility, with a count showing how many are hidden.
- Finish Trip and past-trip edits require a review/confirmation step. Unchecked entries are saved as not bought. Keep the original trip date visible when correcting history.
- Respect `prefers-reduced-motion: reduce` by removing nonessential movement.

## Responsive and accessible behavior

Design first at 320px phone width, then test typical portrait, landscape, tablet, and desktop widths. At narrow widths, stack row metadata and keep controls at least 44×44px. At wider widths, align item name, quantity, checkbox and optional totals in columns. Sticky navigation and summary areas must not cover content or focus targets; allow for safe-area insets. Support keyboard-only use, visible focus, text zoom to 200%, semantic labels, and contrast of at least 4.5:1 for normal text. Color never carries bought, warning, or error meaning alone.

## Reference boundaries

The original design-system PDF supplies the light palette, dark header, green actions, and white-card treatment. CartCheck retains text-first products and checklist behavior; it does not include social sharing, ordering, delivery, or payment controls shown or implied by other references. The prototype currently uses “Finish Shopping”; the product requirements use “Finish Trip,” so the final label still needs one consistent choice.
