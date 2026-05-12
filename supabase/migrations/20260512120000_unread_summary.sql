-- ============================================================================
-- Unread / mention summary RPC
--
-- For each channel the given user has joined, returns the number of unread
-- top-level messages (excluding their own) and the number of unread mentions
-- targeted at them. "Unread" means the message was posted after the row that
-- channel_members.last_read_message_id points to (or no last-read recorded).
--
-- The function is SECURITY DEFINER so it can read message_mentions for the
-- caller without forcing the client to satisfy the table's row-level RLS
-- per channel; only data for the supplied user_id is ever returned.
-- ============================================================================

create or replace function public.get_unread_summary(_user_id uuid)
returns table (
  channel_id    uuid,
  unread_count  bigint,
  mention_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    cm.channel_id,
    coalesce((
      select count(*)
      from public.messages m
      left join public.messages lr on lr.id = cm.last_read_message_id
      where m.channel_id = cm.channel_id
        and m.user_id <> _user_id
        and m.deleted_at is null
        and m.parent_message_id is null
        and (lr.created_at is null or m.created_at > lr.created_at)
    ), 0) as unread_count,
    coalesce((
      select count(*)
      from public.message_mentions mm
      join public.messages m on m.id = mm.message_id
      left join public.messages lr on lr.id = cm.last_read_message_id
      where mm.mentioned_user_id = _user_id
        and m.channel_id = cm.channel_id
        and m.deleted_at is null
        and (lr.created_at is null or m.created_at > lr.created_at)
    ), 0) as mention_count
  from public.channel_members cm
  where cm.user_id = _user_id;
$$;

grant execute on function public.get_unread_summary(uuid) to authenticated;
