# Sitemap and navigation

```text
Public
├─ Sign in
└─ Register account

Signed in
├─ Cart (default)
│  ├─ Quick add / edit list entry
│  ├─ Optional prices and budget
│  ├─ Add item → Catalog
│  └─ Finish Trip → Review → Confirm → Trip detail
├─ Catalog
│  ├─ Search and category filter
│  ├─ Add to cart
│  └─ Register item / Edit private catalog item
├─ Trips
│  └─ Trip detail → Edit past trip → Confirm correction
└─ Settings
   ├─ Preferred currency (PHP / USD / EUR; future carts only)
   ├─ Light / dark / system theme
   └─ Sign out
```

## Navigation rules

- Primary destinations are **Cart, Catalog, Trips, Settings**. Phone portrait shows labeled bottom navigation; desktop and phone landscape show the same labels in a dark top header. Use one active indicator and a page title on every screen.
- Search with no suitable result offers **Register item**, preserving the typed name. After registration, return to the add-to-cart step. Selecting an item already in the cart opens its prefilled entry for an absolute edit.
- The active cart allows direct name/quantity editing and bought status without any price or budget input. Optional estimated and actual item totals remain secondary; starter items have no invented prices.
- Finish Trip review is a dedicated confirmation screen or accessible dialog, not a one-tap destructive action. Returning to the cart preserves edits.
- A finished trip shows bought and not-bought items separately, with missing recorded amounts labeled. Unchecked items do not roll into the next cart. Editing a past trip keeps its original date and shows a correction confirmation.
- Back navigation returns to the prior list and preserves its search, category, and scroll position where practical.
