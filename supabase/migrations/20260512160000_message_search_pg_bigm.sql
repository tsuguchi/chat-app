-- ============================================================================
-- Message body search via pg_bigm (Japanese-friendly N-gram).
--
-- pg_bigm is available on Supabase but must be explicitly enabled. The
-- create-extension is idempotent. Once enabled, the gin_bigm_ops opclass
-- accelerates `body ILIKE '%query%'` lookups, which is what our search
-- page issues through PostgREST.
--
-- Index is partial on `deleted_at IS NULL` so soft-deleted rows are not
-- considered, mirroring what the search query already filters out.
-- ============================================================================

create extension if not exists pg_bigm;

create index if not exists messages_body_bigm_idx
  on public.messages
  using gin (body gin_bigm_ops)
  where deleted_at is null;
