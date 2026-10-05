-- Review only. DO NOT RUN against production without separate approval.
-- Read-only inspection; no shopper identifiers or item contents are returned.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name, current_setting('server_encoding') AS server_encoding;
SELECT filename, sha256 FROM cartcheck.schema_migrations ORDER BY filename;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'cartcheck' AND table_name = 'shopping_trips'
ORDER BY ordinal_position;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'cartcheck' AND tablename = 'shopping_trips' ORDER BY indexname;
SELECT conname, pg_get_constraintdef(oid) AS definition, convalidated
FROM pg_constraint
WHERE conrelid IN ('cartcheck.shopping_trips'::regclass, 'cartcheck.trip_items'::regclass)
ORDER BY conname;

-- to_jsonb permits this query before name/updated_at columns exist. The trim
-- character set exactly matches migration 004 and JavaScript String.trim().
WITH candidate AS (
  SELECT status, to_jsonb(t)->>'name' AS name,
    btrim(to_jsonb(t)->>'name', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') AS trimmed_name,
    to_jsonb(t)->>'updated_at' AS updated_at
  FROM cartcheck.shopping_trips t
)
SELECT status, count(*) AS total_rows,
  count(*) FILTER (WHERE name IS NULL OR trimmed_name = '') AS name_backfill_rows,
  count(*) FILTER (WHERE updated_at IS NULL) AS timestamp_backfill_rows,
  count(*) FILTER (WHERE trimmed_name <> '' AND (name <> trimmed_name OR char_length(name) > 100)) AS invalid_existing_nonblank_names,
  CASE WHEN status = 'active' THEN 'My Grocery List' ELSE 'Shopping Trip' END AS proposed_default_name
FROM candidate GROUP BY status ORDER BY status;
SELECT count(*) AS item_rows FROM cartcheck.trip_items;
SELECT count(*) AS orphan_or_owner_mismatch_items
FROM cartcheck.trip_items i LEFT JOIN cartcheck.shopping_trips t ON t.id=i.trip_id
WHERE t.id IS NULL OR t.user_id<>i.user_id;
SELECT count(*) AS duplicate_product_groups
FROM (SELECT trip_id, product_id FROM cartcheck.trip_items
      WHERE product_id IS NOT NULL GROUP BY trip_id, product_id HAVING count(*)>1) duplicates;
SELECT pg_size_pretty(pg_total_relation_size('cartcheck.shopping_trips')) AS trips_total_size,
       pg_size_pretty(pg_total_relation_size('cartcheck.trip_items')) AS items_total_size;
SELECT count(*) AS owners_with_multiple_active_lists
FROM (SELECT user_id FROM cartcheck.shopping_trips WHERE status='active'
      GROUP BY user_id HAVING count(*) > 1) duplicates;
ROLLBACK;
