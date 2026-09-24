# CartCheck user flows (proposed)

**Status:** Draft for review. These flows describe the intended application, not the current sightings demo.

## 1. Start or resume a cart

1. Register or sign in.
2. Open the single active cart. A new cart starts with an optional budget; the budget can be edited until Finish Trip.
3. See the estimate and any missing-price or over-budget warning. The account's preferred currency defaults to PHP and applies to new carts.

## 2. Add a known product

1. Search the reusable catalog or browse a category.
2. Select a starter or previously registered product. Show its last-paid price if one exists; otherwise show its optional reference price or “No price yet.”
3. Enter a quantity and expected price per item, kilogram, or liter as appropriate, or leave the price unknown while planning.
4. Add it to the active cart. Adding the same product again increases or edits the existing entry rather than creating an ambiguous duplicate.

## 3. Register a missing product

1. If search has no suitable match, choose “Register product.” Prefill the searched name.
2. Enter name, category, and pricing unit; optionally set an image URL and reference price.
3. Save it to the account's reusable catalog, then return to the add-to-list step.
4. Later, edit its details without changing completed purchase records.

## 4. Shop and Finish Trip

1. Update quantities, prices, and budget as needed. Mark an item bought; unmark it to correct a mistake. Optionally hide checked items from the visible cart.
2. Select **Finish Trip** and review bought and unbought items, bought-item totals, and any budget warning. A bought item needs a known price, including zero when it was free.
3. Confirm once. Save the full cart as a dated trip, with bought status on each item. Start a new empty cart and choose its budget separately. Do not create a second trip if confirmation is submitted twice.

## 5. Reuse price history

1. Open trip history and inspect an itemized past trip.
2. Correct a past trip's items, bought status, quantities, or prices when needed; confirm the correction and recalculate totals. The original trip date remains visible.
3. Open a product to see its dated bought prices and latest paid price in the same pricing unit.
4. Add that product to a later cart using the last-paid price as an editable starting estimate.
