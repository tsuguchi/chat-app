-- ============================================================================
-- Initial schema for chat-app
-- See REQUIREMENTS.md section 6 for the ER design.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles : extends auth.users
-- ----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null check (char_length(username) between 1 and 32),
  display_name text not null check (char_length(display_name) between 1 and 64),
  avatar_url   text,
  status_text  text,
  role         text not null default 'member' check (role in ('admin', 'member')),
  created_at   timestamptz not null default now()
);

comment on table public.profiles is 'User profile, 1:1 with auth.users';
comment on column public.profiles.role is 'Workspace-level role: admin | member';

-- ----------------------------------------------------------------------------
-- 2. channels : public / private / dm / group_dm (DM is also a channel)
-- ----------------------------------------------------------------------------
create table public.channels (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('public', 'private', 'dm', 'group_dm')),
  name         text check (
    -- DM types must have NULL name; non-DM types must have a name
    (type in ('dm', 'group_dm') and name is null)
    or (type in ('public', 'private') and char_length(name) between 1 and 64)
  ),
  description  text,
  created_by   uuid references public.profiles(id) on delete set null,
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now()
);

create index channels_type_idx on public.channels(type);
create index channels_created_at_idx on public.channels(created_at desc);

comment on table public.channels is 'Unified table for channels and DMs';

-- ----------------------------------------------------------------------------
-- 3. channel_members : membership + per-channel state
-- ----------------------------------------------------------------------------
create table public.channel_members (
  channel_id            uuid not null references public.channels(id) on delete cascade,
  user_id               uuid not null references public.profiles(id) on delete cascade,
  role                  text not null default 'member'
                        check (role in ('owner', 'admin', 'member')),
  joined_at             timestamptz not null default now(),
  last_read_message_id  uuid,
  notification_setting  text not null default 'all'
                        check (notification_setting in ('all', 'mentions', 'none')),
  primary key (channel_id, user_id)
);

create index channel_members_user_idx on public.channel_members(user_id);

comment on column public.channel_members.role is 'Per-channel role: owner | admin | member';
comment on column public.channel_members.last_read_message_id is 'Used to compute unread counts';

-- ----------------------------------------------------------------------------
-- 4. messages : message body, threads via self-reference
-- ----------------------------------------------------------------------------
create table public.messages (
  id                 uuid primary key default gen_random_uuid(),
  channel_id         uuid not null references public.channels(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  parent_message_id  uuid references public.messages(id) on delete cascade,
  body               text not null check (char_length(body) > 0),
  is_edited          boolean not null default false,
  edited_at          timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index messages_channel_created_idx
  on public.messages(channel_id, created_at desc);
create index messages_parent_idx
  on public.messages(parent_message_id)
  where parent_message_id is not null;
create index messages_user_idx on public.messages(user_id);

-- last_read_message_id may point to a message that exists; add FK after messages table.
alter table public.channel_members
  add constraint channel_members_last_read_fk
  foreign key (last_read_message_id) references public.messages(id) on delete set null;

comment on column public.messages.parent_message_id is 'Self-reference for thread replies';
comment on column public.messages.deleted_at is 'Soft delete; show "Message deleted" in UI';

-- ----------------------------------------------------------------------------
-- 5. message_reactions : emoji reactions (composite PK prevents duplicates)
-- ----------------------------------------------------------------------------
create table public.message_reactions (
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (char_length(emoji) between 1 and 64),
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index message_reactions_message_idx on public.message_reactions(message_id);

-- ----------------------------------------------------------------------------
-- 6. message_mentions : @user / @channel / @here
-- ----------------------------------------------------------------------------
create table public.message_mentions (
  message_id         uuid not null references public.messages(id) on delete cascade,
  mentioned_user_id  uuid not null references public.profiles(id) on delete cascade,
  mention_type       text not null check (mention_type in ('user', 'channel', 'here')),
  primary key (message_id, mentioned_user_id, mention_type)
);

create index message_mentions_user_idx on public.message_mentions(mentioned_user_id);
create index message_mentions_message_idx on public.message_mentions(message_id);

comment on column public.message_mentions.mention_type is 'user = @username, channel = @channel, here = @here';

-- ----------------------------------------------------------------------------
-- 7. message_attachments : files uploaded to Supabase Storage
-- ----------------------------------------------------------------------------
create table public.message_attachments (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.messages(id) on delete cascade,
  storage_path  text not null,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint check (size_bytes >= 0),
  created_at    timestamptz not null default now()
);

create index message_attachments_message_idx on public.message_attachments(message_id);

-- ----------------------------------------------------------------------------
-- 8. user_presence : presence + last-seen tracking
-- ----------------------------------------------------------------------------
create table public.user_presence (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  status        text not null default 'offline'
                check (status in ('online', 'away', 'offline')),
  last_seen_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER to avoid recursive RLS)
-- ----------------------------------------------------------------------------

-- Returns true if the given user is a member of the given channel.
create or replace function public.is_channel_member(_channel_id uuid, _user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.channel_members
    where channel_id = _channel_id and user_id = _user_id
  );
$$;

-- Returns true if the given user is a workspace admin.
create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = _user_id and role = 'admin'
  );
$$;

-- Returns the role of the given user in the given channel, or null if not a member.
create or replace function public.channel_role(_channel_id uuid, _user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.channel_members
  where channel_id = _channel_id and user_id = _user_id;
$$;

-- ----------------------------------------------------------------------------
-- Trigger: auto-create a profile when a new auth.users row is inserted
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    -- Default username: local-part of email; the user can update later.
    -- A UNIQUE constraint may collide; we let the app handle the error case.
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Realtime publication: enable change streams for chat-critical tables
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.channel_members;
alter publication supabase_realtime add table public.user_presence;
