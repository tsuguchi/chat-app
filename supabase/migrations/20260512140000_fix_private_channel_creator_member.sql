-- ============================================================================
-- Allow the channel creator to self-join their own channel, regardless of
-- the channel's type.
--
-- on_channel_created (PR #5) inserts the creator as owner into
-- channel_members via a SECURITY DEFINER trigger. Empirically, in this
-- Supabase project the SECURITY DEFINER context does NOT bypass RLS for the
-- channel_members INSERT, so private channel creation rolls back with
-- "new row violates row-level security policy for table channels" (the
-- trigger's failure cascades to the parent insert).
--
-- Public channels work today because the existing self-join branch matches
-- `type = 'public'`. The fix is to widen that branch so the creator's
-- self-join also matches when `channels.created_by = auth.uid()`, which
-- covers the trigger's case for private/dm/group_dm channels too.
-- ============================================================================

drop policy if exists "channel_members_insert" on public.channel_members;

create policy "channel_members_insert"
  on public.channel_members for insert
  to authenticated
  with check (
    -- Self-join: into a public channel, or into a channel the caller created.
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.channels c
        where c.id = channel_id
          and (c.type = 'public' or c.created_by = auth.uid())
      )
    )
    -- Channel owner / channel admin invites someone else.
    or public.channel_role(channel_id, auth.uid()) in ('owner', 'admin')
    -- Workspace admin.
    or public.is_admin(auth.uid())
  );
