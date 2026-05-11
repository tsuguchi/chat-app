-- ============================================================================
-- Row Level Security policies
-- Permission matrix: REQUIREMENTS.md section 3
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enable RLS on all chat tables
-- ----------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.channels             enable row level security;
alter table public.channel_members      enable row level security;
alter table public.messages             enable row level security;
alter table public.message_reactions    enable row level security;
alter table public.message_mentions     enable row level security;
alter table public.message_attachments  enable row level security;
alter table public.user_presence        enable row level security;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
-- Anyone authenticated can view any profile (needed to render mentions, avatars).
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Only the user can update their own profile. Admin can update any profile.
create policy "profiles_update_self_or_admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));

-- INSERT is handled by the on_auth_user_created trigger (SECURITY DEFINER).
-- DELETE is not exposed; cascade from auth.users handles cleanup.

-- ----------------------------------------------------------------------------
-- channels
-- ----------------------------------------------------------------------------
-- Public channels: visible to all authenticated.
-- Private / DM channels: visible only to members.
create policy "channels_select_visible"
  on public.channels for select
  to authenticated
  using (
    type = 'public'
    or public.is_channel_member(id, auth.uid())
    or public.is_admin(auth.uid())
  );

-- Any authenticated user can create channels (public or private).
-- DM / group_dm channels are also created here; ownership is tracked via channel_members.
create policy "channels_insert_authenticated"
  on public.channels for insert
  to authenticated
  with check (created_by = auth.uid());

-- Channel owner or admin can update channel metadata (e.g. archive, rename).
create policy "channels_update_owner_or_admin"
  on public.channels for update
  to authenticated
  using (
    public.channel_role(id, auth.uid()) = 'owner'
    or public.is_admin(auth.uid())
  )
  with check (
    public.channel_role(id, auth.uid()) = 'owner'
    or public.is_admin(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- channel_members
-- ----------------------------------------------------------------------------
-- Members can see other members of the same channel.
create policy "channel_members_select_same_channel"
  on public.channel_members for select
  to authenticated
  using (
    public.is_channel_member(channel_id, auth.uid())
    or public.is_admin(auth.uid())
  );

-- Insert rules:
--   - public channel: self-join allowed
--   - private / dm / group_dm: only channel owner/admin (or workspace admin) can add others
create policy "channel_members_insert"
  on public.channel_members for insert
  to authenticated
  with check (
    -- self-join into public channel
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.channels
        where id = channel_id and type = 'public'
      )
    )
    -- channel owner / channel admin invites
    or public.channel_role(channel_id, auth.uid()) in ('owner', 'admin')
    -- workspace admin
    or public.is_admin(auth.uid())
  );

-- Update: only self can change own row (e.g. last_read_message_id, notification_setting)
create policy "channel_members_update_self"
  on public.channel_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Delete: self can leave, or channel owner / workspace admin can remove
create policy "channel_members_delete"
  on public.channel_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.channel_role(channel_id, auth.uid()) = 'owner'
    or public.is_admin(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- messages
-- ----------------------------------------------------------------------------
-- Members of the channel can read messages.
create policy "messages_select_members"
  on public.messages for select
  to authenticated
  using (
    public.is_channel_member(channel_id, auth.uid())
    or public.is_admin(auth.uid())
  );

-- Members can post; user_id must be self.
create policy "messages_insert_members"
  on public.messages for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_channel_member(channel_id, auth.uid())
  );

-- Only the author can edit their own message.
create policy "messages_update_author"
  on public.messages for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Author or workspace admin can (soft-)delete.
create policy "messages_delete_author_or_admin"
  on public.messages for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- message_reactions
-- ----------------------------------------------------------------------------
-- Visible whenever the message is visible (mirror messages SELECT policy).
create policy "reactions_select_via_message"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          public.is_channel_member(m.channel_id, auth.uid())
          or public.is_admin(auth.uid())
        )
    )
  );

-- Insert: only as self, only on messages you can see.
create policy "reactions_insert_self"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_channel_member(m.channel_id, auth.uid())
    )
  );

-- Delete: only own reaction.
create policy "reactions_delete_self"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- message_mentions
-- ----------------------------------------------------------------------------
create policy "mentions_select_via_message"
  on public.message_mentions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          public.is_channel_member(m.channel_id, auth.uid())
          or public.is_admin(auth.uid())
        )
    )
  );

-- Mentions are inserted alongside the message by the same author.
create policy "mentions_insert_via_message_author"
  on public.message_mentions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- message_attachments
-- ----------------------------------------------------------------------------
create policy "attachments_select_via_message"
  on public.message_attachments for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          public.is_channel_member(m.channel_id, auth.uid())
          or public.is_admin(auth.uid())
        )
    )
  );

create policy "attachments_insert_via_message_author"
  on public.message_attachments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.user_id = auth.uid()
    )
  );

create policy "attachments_delete_via_message_author"
  on public.message_attachments for delete
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

-- ----------------------------------------------------------------------------
-- user_presence
-- ----------------------------------------------------------------------------
create policy "presence_select_all"
  on public.user_presence for select
  to authenticated
  using (true);

create policy "presence_upsert_self"
  on public.user_presence for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "presence_update_self"
  on public.user_presence for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
