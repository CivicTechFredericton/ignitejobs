-- Aliases may contain accents ("télétravail"); compare them unaccented like the input text.
CREATE OR REPLACE FUNCTION match_location(location_text text) RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE STRICT
RETURN (
  SELECT l.id FROM locations l
  WHERE l.active AND (
    position(lower(immutable_unaccent(l.name->>'en')) IN lower(immutable_unaccent(location_text))) > 0
    OR EXISTS (
      SELECT 1 FROM unnest(l.aliases) alias
      WHERE position(lower(immutable_unaccent(alias)) IN lower(immutable_unaccent(location_text))) > 0
    )
  )
  ORDER BY l.sort_order
  LIMIT 1
);
