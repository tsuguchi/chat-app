-- ============================================================================
-- calls: voice / video call sessions, one room per channel at a time.
--
-- We don't try to be a signaling server; LiveKit Cloud handles the media
-- plane. This table is just a coordination ledger: "is there an active call
-- in this channel, who started it, when?" so the UI can show a "join call"
-- ribbon and so we have an auditable record. The LiveKit room name is
-- derived from the call id, which the server side uses when minting JWTs.
-- ============================================================================

create table public.calls (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.channels(id) on delete cascade,
  started_by  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('audio', 'video')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

-- Only one active call per channel — second startCall in the same channel
-- should join the existing room, not start a new one.
create unique index calls_one_active_per_channel_idx
  on public.calls(channel_id) where ended_at is null;

create index calls_channel_started_idx
  on public.calls(channel_id, started_at desc);

comment on table public.calls is 'Voice/video call sessions; media handled by LiveKit Cloud';

-- ----------------------------------------------------------------------------
-- RLS: channel members can see / start / end calls in their channel.
-- ----------------------------------------------------------------------------
alter table public.calls enable row level security;

create policy "calls_select_member"
  on public.calls for select
  to authenticated
  using (
    public.is_channel_member(channel_id, auth.uid())
    or public.is_admin(auth.uid())
  );

create policy "calls_insert_member"
  on public.calls for insert
  to authenticated
  with check (
    started_by = auth.uid()
    and public.is_channel_member(channel_id, auth.uid())
  );

-- Anyone in the channel can mark a call ended. Calls are not editable
-- otherwise; the only update we expect is setting ended_at.
create policy "calls_update_member"
  on public.calls for update
  to authenticated
  using (
    public.is_channel_member(channel_id, auth.uid())
    or public.is_admin(auth.uid())
  )
  with check (
    public.is_channel_member(channel_id, auth.uid())
    or public.is_admin(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Realtime: stream call lifecycle so other channel members see the "join"
-- ribbon appear / disappear without a refresh.
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.calls;
