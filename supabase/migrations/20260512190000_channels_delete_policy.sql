-- ============================================================================
-- DELETE policy for channels: the creator (or a workspace admin) can delete
-- a public/private channel they made. DMs are excluded — there is no UI
-- to recreate one, and "deleting" a DM is conceptually a different feature
-- (per-user hide) that we are not building.
--
-- A cascade fires on messages, channel_members, message_reactions,
-- message_mentions, and message_attachments via the FK definitions in the
-- initial schema — so a single DELETE wipes the conversation cleanly.
-- ============================================================================

create policy "channels_delete_owner_or_admin"
  on public.channels for delete
  to authenticated
  using (
    type in ('public', 'private')
    and (
      created_by = auth.uid()
      or public.channel_role(id, auth.uid()) = 'owner'
      or public.is_admin(auth.uid())
    )
  );
