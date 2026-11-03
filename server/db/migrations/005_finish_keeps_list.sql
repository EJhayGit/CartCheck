-- A finished trip is now its own row, so the list row no longer records that it
-- was finished. This link lets a retry return the saved trip instead of a conflict.
-- Deleting a list keeps its trips.
ALTER TABLE cartcheck.shopping_trips
  ADD COLUMN finished_from_list_id BIGINT REFERENCES cartcheck.shopping_trips(id) ON DELETE SET NULL,
  ADD COLUMN finished_from_revision INTEGER;

CREATE UNIQUE INDEX shopping_trips_finished_from_idx
  ON cartcheck.shopping_trips (finished_from_list_id, finished_from_revision)
  WHERE finished_from_list_id IS NOT NULL;
