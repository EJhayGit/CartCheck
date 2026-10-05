ALTER TABLE cartcheck.shopping_trips ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE cartcheck.shopping_trips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Keep names already supplied by a compatible partial deployment. Blank values
-- alone receive the migration defaults; invalid nonblank values fail checks below.
UPDATE cartcheck.shopping_trips
SET name = CASE WHEN status = 'active' THEN 'My Grocery List' ELSE 'Shopping Trip' END
WHERE name IS NULL OR btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = '';

UPDATE cartcheck.shopping_trips t
SET updated_at = GREATEST(t.created_at, COALESCE(t.completed_at, t.created_at),
  COALESCE((SELECT max(i.updated_at) FROM cartcheck.trip_items i WHERE i.trip_id = t.id AND i.user_id = t.user_id), t.created_at))
WHERE t.updated_at IS NULL;

ALTER TABLE cartcheck.shopping_trips ALTER COLUMN updated_at SET DEFAULT now();
-- A partially deployed nullable column may carry a default. New lists must
-- always provide their name explicitly.
ALTER TABLE cartcheck.shopping_trips ALTER COLUMN name DROP DEFAULT;
ALTER TABLE cartcheck.shopping_trips ALTER COLUMN name SET NOT NULL;
ALTER TABLE cartcheck.shopping_trips ALTER COLUMN updated_at SET NOT NULL;

DO $$
DECLARE existing_expression text;
DECLARE expected_expression text;
DECLARE existing_validated boolean;
BEGIN
  CREATE TEMP TABLE _cartcheck_name_constraint_probe (name TEXT);
  ALTER TABLE _cartcheck_name_constraint_probe ADD CONSTRAINT _cartcheck_name_constraint_probe_check CHECK (
    char_length(name) BETWEEN 1 AND 100 AND
    name = btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
  );
  SELECT pg_get_expr(conbin, conrelid) INTO expected_expression
  FROM pg_constraint
  WHERE conrelid = 'pg_temp._cartcheck_name_constraint_probe'::regclass
    AND conname = '_cartcheck_name_constraint_probe_check';

  SELECT pg_get_expr(conbin, conrelid), convalidated
    INTO existing_expression, existing_validated
  FROM pg_constraint
  WHERE conrelid = 'cartcheck.shopping_trips'::regclass AND conname = 'shopping_trips_name_valid';

  IF existing_expression IS NULL THEN
    ALTER TABLE cartcheck.shopping_trips ADD CONSTRAINT shopping_trips_name_valid CHECK (
      char_length(name) BETWEEN 1 AND 100 AND
      name = btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    );
  ELSIF NOT existing_validated OR
        regexp_replace(existing_expression, '[[:space:]()]', '', 'g') <>
        regexp_replace(expected_expression, '[[:space:]()]', '', 'g') THEN
    RAISE EXCEPTION 'Existing shopping_trips_name_valid constraint has an incompatible or unvalidated definition: %', existing_expression;
  END IF;

  DROP TABLE _cartcheck_name_constraint_probe;
END $$;

DROP INDEX IF EXISTS cartcheck.shopping_trips_one_active_per_user_idx;

DO $$
DECLARE index_oid oid;
DECLARE is_unique boolean;
DECLARE is_valid boolean;
DECLARE key_count integer;
DECLARE first_key text;
DECLARE second_key text;
DECLARE third_key text;
DECLARE first_option integer;
DECLARE second_option integer;
DECLARE third_option integer;
DECLARE predicate text;
DECLARE access_method text;
BEGIN
  SELECT c.oid, i.indisunique, i.indisvalid, i.indnkeyatts, am.amname,
         pg_get_indexdef(c.oid, 1, true), pg_get_indexdef(c.oid, 2, true),
         pg_get_indexdef(c.oid, 3, true), i.indoption[0], i.indoption[1], i.indoption[2],
         pg_get_expr(i.indpred, i.indrelid)
    INTO index_oid, is_unique, is_valid, key_count, access_method, first_key, second_key, third_key,
         first_option, second_option, third_option, predicate
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_am am ON am.oid = c.relam
  WHERE n.nspname = 'cartcheck' AND c.relname = 'shopping_trips_active_updated_idx'
    AND i.indrelid = 'cartcheck.shopping_trips'::regclass;

  IF index_oid IS NULL THEN
    CREATE INDEX shopping_trips_active_updated_idx
      ON cartcheck.shopping_trips (user_id, updated_at DESC, id DESC) WHERE status = 'active';
  ELSIF is_unique OR NOT is_valid OR key_count <> 3 OR access_method <> 'btree' OR
        first_key <> 'user_id' OR second_key <> 'updated_at' OR third_key <> 'id' OR
        first_option <> 0 OR second_option <> 3 OR third_option <> 3 OR
        predicate IS NULL OR regexp_replace(predicate, '[[:space:]()]', '', 'g') <> 'status=''active''::text' THEN
    RAISE EXCEPTION 'Existing shopping_trips_active_updated_idx has an incompatible definition';
  END IF;
END $$;
