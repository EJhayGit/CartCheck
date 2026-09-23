# Reusable design system

The interface can be built with React, semantic HTML, and CSS custom properties already available in the stack. No UI component package is needed for this specification.

## Tokens

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `#F6F5F0` | `#171B18` | Page background |
| Surface | `#FFFFFF` | `#242A25` | Dialogs, summary blocks, fields |
| Text | `#202820` | `#F0F2EA` | Primary copy |
| Muted text | `#4E5B50` | `#B5C1B3` | Secondary copy |
| Border | `#D7DED4` | `#465248` | Dividers and fields |
| Primary | `#314C3C` | `#A9C9A5` | Main action, selected navigation |
| Primary text | `#FFFFFF` | `#17251B` | Text on primary |
| Warning | `#8B4B36` | `#E6A98D` | Budget and missing-price warnings with text label |
| Error | `#9C3737` | `#F1A0A0` | Validation and failure with text label |

These are starting tokens. Check each real text/background pair in implementation and adjust to meet WCAG AA contrast.

Use a system sans-serif stack (`system-ui`, `Segoe UI`, Arial) for easy loading. Suggested type scale: 14px helper, 16px body and controls, 20px section title, 28px page title. Use tabular numerals for money and totals. Keep body line height near 1.5. Spacing follows 4, 8, 12, 16, 24, 32px; 16px mobile gutters and 24–32px desktop gutters. Use restrained 8–12px corners, thin borders, and little or no shadow.

## Patterns

| Pattern | Required behavior |
| --- | --- |
| Primary button | One dominant action per area, e.g. **Add to cart** or **Finish Trip**. Visible focus, disabled and busy states, 44px minimum touch height. |
| Secondary / text button | Edit, cancel, filters, and low-emphasis actions. Destructive removal uses a clearly labeled action and confirmation when data would be lost. |
| Form field | Label above control; helper text for units and price meaning; inline error connected to the field. Numeric input shows currency and unit, accepts zero, and distinguishes blank/unknown from zero. |
| Product row | Optional small image, name/category, `each`/`kg`/`L`, last-paid or reference-price label, and Add action. Placeholder remains useful without image. |
| Cart row | Large bought checkbox, name, quantity, editable unit price, calculated line total, and a labeled edit/remove control. Checked rows remain readable and accessible. |
| Budget summary | Budget, estimated total, bought subtotal, remaining/over amount; “Incomplete estimate” when any price is unknown. Never combine currencies. |
| Navigation | Same four destinations at all widths, text labels visible, current page announced via `aria-current`. |
| Feedback | Inline field errors; page-level retry on load failure; polite status on save; clear empty-state next action; confirmation before Finish Trip or past-trip correction. |
| Dialog/review | Focus moves into review, remains trapped while open, and returns to its trigger on close. Escape closes without committing. |

## Screen states

- **Loading:** visible text and stable skeleton/placeholder geometry; no misleading zero totals.
- **Empty cart:** explain the next action and link to Catalog; budget can still be set.
- **No catalog results:** show searched term and Register product, retaining the term.
- **No history:** explain that finished trips appear here after Finish Trip.
- **Error/offline:** keep entered data when possible, say what failed, and provide retry.
- **Over budget / unknown price:** textual message next to the affected amount, not color alone.
- **Image unavailable:** neutral placeholder with product name still visible.

## Responsive pattern

Below roughly 600px, one column with bottom navigation and stacked cart controls. From 600–959px, use a compact top/side navigation depending on landscape height, and allow two columns only if each stays readable. At 960px and above, use a side rail and wider list/summary arrangement. Breakpoints are layout guides, not device names; test content fit and zoom before fixing exact values.
