-- ============================================================================
-- Storage bucket for message attachments
--
-- Private bucket; clients always go through signed URLs that we mint on
-- the server. Path scheme is `<channel_id>/<uuid>/<filename>` so the RLS
-- policies can derive the owning channel from the object name alone.
--
-- File size cap mirrors REQUIREMENTS.md section 2.1 (1 file <= 10 MB).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;

-- Read: anyone who is a member of the channel encoded in the path.
create policy "attachments_select_channel_members"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1
      from public.channel_members cm
      where cm.user_id = auth.uid()
        and cm.channel_id = ((string_to_array(name, '/'))[1])::uuid
    )
  );

-- Insert: same membership rule + the uploader becomes owner.
create policy "attachments_insert_channel_members"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and exists (
      select 1
      from public.channel_members cm
      where cm.user_id = auth.uid()
        and cm.channel_id = ((string_to_array(name, '/'))[1])::uuid
    )
  );

-- Delete: only the uploader, or a workspace admin.
create policy "attachments_delete_owner_or_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (owner = auth.uid() or public.is_admin(auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- Allow attachment-only messages.
-- The original CHECK on messages.body required at least one character, which
-- precluded sending an image with no caption. Drop that constraint and
-- replace it with a "body is not null" guard so the column still cannot be
-- NULL but may be an empty string.
-- ----------------------------------------------------------------------------
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_not_null check (body is not null);

-- ----------------------------------------------------------------------------
-- Realtime publication: attachment inserts must reach connected clients so
-- the file appears alongside the message that already streamed in.
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.message_attachments;
