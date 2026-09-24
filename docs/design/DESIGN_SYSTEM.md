# Reusable design system

The interface can be built with React, semantic HTML, and CSS custom properties already available in the stack. No UI component package is needed for this specification.

## Tokens

The original `03-design-system.pdf` is authoritative for the light appearance. The static prototype always opens in this light theme, regardless of operating-system preference. A future application may offer an explicit dark theme, but it must not replace the light default.

| Role | Approved light | Future optional dark | Use |
| --- | --- | --- | --- |
| Canvas | `#F4F7F4` | `#171B18` | Page background |
| Surface | `#FFFFFF` | `#242A25` | Dialogs, summary blocks, fields |
| Text / header | `#172B26` | `#F0F2EA` | Primary copy and dark navigation header in the light theme |
| Muted text | `#42584E` | `#B5C1B3` | Secondary copy |
| Border | `#D7E2D9` | `#465248` | Neutral dividers and fields |
| Primary actions | `#176B45` | `#A9C9A5` | Main buttons and important actions |
| Primary text | `#FFFFFF` | `#17251B` | Text on primary |
| Warning | `#8B4B36` | `#E6A98D` | Budget and missing-price warnings with text label |
| Error | `#9C3737` | `#F1A0A0` | Validation and failure with text label |

The first four approved light colors are exact values from the PDF; muted and border colors are supporting neutrals. Check each real text/background pair in implementation and adjust supporting neutrals to meet WCAG AA contrast. The navigation header uses `#172B26` with white labels. The future dark column is not used automatically in the visual prototype.

Use a system sans-serif stack (`system-ui`, `Segoe UI`, Arial) for easy loading. Suggested type scale: 14px helper, 16px body and controls, 20px section title, 28px page title. Use tabular numerals for money and totals. Keep body line height near 1.5. Spacing follows 4, 8, 12, 16, 24, 32px; 16px mobile gutters and 24–32px desktop gutters. Use restrained 8–12px corners, thin borders, and little or no shadow.

## Patterns

| Pattern | Required behavior |
| --- | --- |
| Primary button | One dominant action per area, e.g. **Add to cart** or **Finish Trip**. Visible focus, disabled and busy states, 44px minimum touch height. |
| Secondary / text button | Edit, cancel, filters, and low-emphasis actions. Destructive removal uses a clearly labeled action and confirmation when data would be lost. |
| Form field | Label above control and inline error connected to the field. Quantity accepts positive whole or decimal values and an optional short unit label. Optional estimated and actual **item total** inputs show currency, accept zero, and distinguish blank/unknown from zero. |
| Product row | White card with optional small image, name/category, and Add action. No brand, variant or price is required. Placeholder remains useful without image. |
| Cart row | White card with comfortable padding, large bought checkbox, editable displayed name and quantity, category, and labeled edit/remove controls. Optional prices are secondary. Checked rows remain readable and accessible. |
| Budget summary | Optional budget, known estimated and actual-spending subtotals, missing-price counts, and remaining/over amount where meaningful. Clearly label incomplete amounts; never combine currencies. |
| Navigation | Same four destinations at all widths, text labels visible, current page announced via `aria-current`. Dark top header on desktop and phone landscape; labeled bottom navigation on phone portrait. |
| Feedback | Inline field errors; page-level retry on load failure; polite status on save; clear empty-state next action; confirmation before Finish Trip or past-trip correction. |
| Dialog/review | Focus moves into review, remains trapped while open, and returns to its trigger on close. Escape closes without committing. |

## Screen states

- **Loading:** visible text and stable skeleton/placeholder geometry; no misleading zero totals.
- **Empty cart:** explain the next action and link to Catalog; budget may be set but is never required.
- **No catalog results:** show searched term and Register product, retaining the term.
- **No history:** explain that finished trips appear here after Finish Trip.
- **Error/offline:** keep entered data when possible, say what failed, and provide retry.
- **Over budget / unknown price:** textual message next to the affected amount, not color alone. Missing amounts never appear as zero.
- **Image unavailable:** neutral placeholder with product name still visible.

## Responsive pattern

Below roughly 600px, use one column with bottom navigation and stacked cart controls. From 600–959px, use a compact dark top header and allow two columns only if each stays readable. At 960px and above, retain the dark top header with a wider list/summary arrangement. Breakpoints are layout guides, not device names; test content fit and zoom before fixing exact values.
