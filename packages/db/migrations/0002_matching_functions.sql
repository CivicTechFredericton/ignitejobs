-- Matching helpers shared by the API (TypeScript) and the scrape workers (Python).
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- unaccent() is only STABLE; pinning the dictionary makes this safe to use in generated columns.
CREATE FUNCTION immutable_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
RETURN public.unaccent('public.unaccent'::regdictionary, $1);
--> statement-breakpoint
-- "Scotia Bank", "ScotiaBank" and "Scotiabank Inc." all normalise to "scotiabank".
CREATE FUNCTION normalize_org_name(name text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
RETURN regexp_replace(
  regexp_replace(lower(immutable_unaccent(name)), '\m(inc|incorporated|ltd|limited|corp|corporation|co|llc|ltee)\M\.?', '', 'g'),
  '[^a-z0-9]+', '', 'g'
);
--> statement-breakpoint
-- Best-effort mapping of free-text locations ("Speedy-Fredericton Main Street") to a known location.
CREATE FUNCTION match_location(location_text text) RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE STRICT
RETURN (
  SELECT l.id FROM locations l
  WHERE l.active AND (
    position(lower(immutable_unaccent(l.name->>'en')) IN lower(immutable_unaccent(location_text))) > 0
    OR EXISTS (
      SELECT 1 FROM unnest(l.aliases) alias
      WHERE position(alias IN lower(immutable_unaccent(location_text))) > 0
    )
  )
  ORDER BY l.sort_order
  LIMIT 1
);
