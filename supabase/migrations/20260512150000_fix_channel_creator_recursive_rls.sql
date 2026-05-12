-- ============================================================================
-- Fix recursive RLS that prevents private channel creation
--
-- Root cause: the previous channel_members_insert policy fix used
--   exists (select 1 from public.channels c where c.id = ... and (...))
-- The subquery is subject to channels SELECT RLS, which only lets the user
-- see public channels or channels they are already a member of. For a
-- brand-new private channel created by the user, none of those conditions
-- hold yet (the trigger is trying to create the membership right now), so
-- the channel is invisible to the subquery, exists() returns false,
-- channel_members INSERT is denied, and the parent channels INSERT rolls
-- back with the misleading "table channels" RLS error.
--
-- Fix in two parts:
--   1) Add a `created_by = auth.uid()` branch to channels SELECT RLS so a
--      user can always see channels they created (also useful in general).
--   2) Use a SECURITY DEFINER helper in the channel_members_insert WITH
--      CHECK so we never depend on the caller's SELECT RLS for the lookup.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Helper: can the caller self-join this channel?
--    True if the channel is public, or if the caller is the channel creator.
--    SECURITY DEFINER + postgres BYPASSRLS so it sees the new private row.
-- ---------------------------------------------------------------------------
create or replace function public.can_self_join_channel(_channel_id uuid, _user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.channels
    where id = _channel_id
      and (type = 'public' or created_by = _user_id)
  );
$$;

grant execute on function public.can_self_join_channel(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Replace channels_select_visible: also let creators see their own
--    channels, so the RETURNING clause of an INSERT survives RLS.
-- ---------------------------------------------------------------------------
drop policy if exists "channels_select_visible" on public.channels;

create policy "channels_select_visible"
  on public.channels for select
  to authenticated
  using (
    type = 'public'
    or public.is_channel_member(id, auth.uid())
    or public.is_admin(auth.uid())
    or created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 3) Replace channel_members_insert: use the SECURITY DEFINER helper
--    instead of a plain exists() subquery to avoid the recursive SELECT RLS.
-- ---------------------------------------------------------------------------
drop policy if exists "channel_members_insert" on public.channel_members;

create policy "channel_members_insert"
  on public.channel_members for insert
  to authenticated
  with check (
    (
      user_id = auth.uid()
      and public.can_self_join_channel(channel_id, auth.uid())
    )
    or public.channel_role(channel_id, auth.uid()) in ('owner', 'admin')
    or public.is_admin(auth.uid())
  );
