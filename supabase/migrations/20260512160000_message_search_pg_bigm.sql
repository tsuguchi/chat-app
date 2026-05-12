-- ============================================================================
-- Message body search index.
--
-- Originally drafted with pg_bigm (better for Japanese 2-grams), but that
-- extension is not packaged in this Supabase project. Falling back to
-- pg_trgm, which is pre-installed and provides gin_trgm_ops — it
-- accelerates ILIKE substring searches whose pattern shares at least
-- three consecutive characters with the indexed text. For shorter
-- queries (under 3 chars), Postgres falls back to a sequential scan,
-- which is fine at the 50-user scale this project targets.
--
-- The index is partial on deleted_at IS NULL so soft-deleted messages
-- are not part of the search corpus and the index stays small.
-- ============================================================================

create extension if not exists pg_trgm;

drop index if exists public.messages_body_bigm_idx;

create index if not exists messages_body_trgm_idx
  on public.messages
  using gin (body gin_trgm_ops)
  where deleted_at is null;
