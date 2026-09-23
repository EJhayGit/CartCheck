# Sitemap and navigation

```text
Public
├─ Sign in
└─ Register account

Signed in
├─ Cart (default)
│  ├─ Set/edit budget
│  ├─ Add product → Catalog
│  └─ Finish Trip → Review → Confirm → Trip detail
├─ Catalog
│  ├─ Search and category filter
│  ├─ Product detail → Price history / Add to cart
│  └─ Register product / Edit own product
├─ Trips
│  └─ Trip detail → Edit past trip → Confirm correction
└─ Settings
   ├─ Preferred currency (PHP default; future carts only)
   ├─ Light / dark / system theme
   └─ Sign out
```

## Navigation rules

- Primary destinations are **Cart, Catalog, Trips, Settings**. Mobile shows labeled bottom navigation; desktop shows the same labels in a side rail. Use one active indicator and a page title on every screen.
- Search with no suitable result offers **Register product**, preserving the typed name. After registration, return to the add-to-cart step.
- Product detail is reachable from catalog, cart, and trip history. A product's last-paid price is labeled by source and currency; no price is invented for starter products.
- Finish Trip review is a dedicated confirmation screen or accessible dialog, not a one-tap destructive action. Returning to the cart preserves edits.
- A finished trip shows bought and not-bought items separately. Editing a past trip keeps its original date and shows a correction confirmation.
- Back navigation returns to the prior list and preserves its search, category, and scroll position where practical.
