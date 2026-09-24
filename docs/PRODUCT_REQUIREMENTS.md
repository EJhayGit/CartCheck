# CartCheck product requirements (proposed)

**Status:** Draft for review. No CartCheck functionality exists in the current starter application.

## Objective and users

Help grocery shoppers, including students and families, prepare a reusable checklist, stay aware of a shopping budget, and remember what they paid. The first version supports an individual account.

## Required functionality for a complete first version

1. **Private account:** A shopper can register, sign in, sign out, and return to their saved catalog, active list, and purchase history. One account cannot read or change another account's data.
2. **Reusable catalog:** Provide approximately 100 common grocery starter products with a name, category, and pricing unit, but no invented current price. Shoppers can search them, register custom products, and edit their own product names, categories, image URLs, and reference prices. Changes to starter products are private to that shopper.
3. **Active cart:** Registering a product saves it for future use; adding a product puts it in the active cart. A failed search offers registration with the search text filled in, then returns the shopper to adding it. Entries can be edited, removed, marked purchased, and unmarked. The shopper can hide checked items without deleting them.
4. **Quantity and price:** Products are priced per item (`each`), kilogram (`kg`), or liter (`L`). `Each` quantities are positive whole numbers; kilogram and liter quantities may be positive decimals. The shopper enters or changes the expected price per selected unit on a cart entry. Line total is quantity times unit price, rounded to the selected currency's minor unit. Zero is a valid price for a genuinely free item. Unknown prices are allowed and clearly marked as missing from estimates.
5. **Budget and currency:** A new cart starts with an optional budget, which remains editable until the trip is finished. The account setting defaults to PHP and chooses the currency for new carts; changing it does not convert or relabel existing trip amounts. Show the cart estimate, checked-item subtotal, and remaining budget or amount over budget. A budget warning does not block finishing a trip. Totals with unknown prices must say they are incomplete.
6. **Finish Trip and history:** “Finish Trip” opens a confirmation showing checked and unchecked items, item prices, and the checked-item total. Confirmation finalizes the whole cart as one dated trip; checked items are recorded as bought and unchecked items as not bought. A fresh cart starts afterward with a newly chosen budget. Past trips can be corrected by adding or removing items or changing their bought status, quantity, or price. Totals and last-paid prices recalculate after an edit. Editing a catalog product must not silently rewrite a past trip's item details.
7. **Usable interface:** Responsive phone portrait, phone landscape, and desktop layouts; simple neutral colors without gradients or neon; light and dark themes; keyboard-visible focus, readable contrast, and clear loading, empty, error, and confirmation states. Motion should be subtle and respect reduced-motion preferences.
8. **Public deployment and security:** The React client, Express API, and PostgreSQL database must be deployed and reachable. Shopper data remains private behind login. Validate input on the server, protect account endpoints from abuse, use parameterized queries and account ownership checks, restrict CORS, and keep credentials out of the client and repository.

## Screens

- **Sign in / register** for account access.
- **Active cart** for budget, quantities, prices, purchase marks, and the hide-checked option.
- **Catalog search** for starter and custom products, with a path to register missing products.
- **Product form/detail** for registration, customization, last-paid price, and price history.
- **Finish Trip review** to confirm bought and unbought items.
- **Trip history/detail** for past trips, their itemized totals, and corrections.

Currency, theme, and sign-out controls can live in a small settings/navigation area; they do not need separate pages.

## Essential data

Account (including preferred currency); reusable product (owner or starter source, name, category, pricing unit, optional image URL and reference price); one active cart per account (optional budget and currency); cart entries (quantity, price, purchase mark); finished trip; and trip item snapshots (name, unit, quantity, price, bought state, and totals). Product price history is derived from bought items in finished trips. A reference price is an estimate, never a claimed past purchase. Edited trips retain their original completion date and reflect the corrected values.

## Acceptance examples

A new shopper can add a starter product and a custom product, calculate `each`, `kg`, and `L` totals, set or edit a budget, hide checked items, and see warnings for unknown prices or an exceeded budget. Finish Trip requires confirmation and records both bought and unbought items. A later correction to a finished trip updates its totals and the affected item's last-paid price. A zero-priced bought item is valid. The same data is available after signing out and back in, while another account cannot access it.
