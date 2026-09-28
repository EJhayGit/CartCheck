-- Historical corrections may add an item snapshot without registering a reusable catalog product.
ALTER TABLE cartcheck.trip_items ALTER COLUMN product_id DROP NOT NULL;
