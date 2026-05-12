-- ============================================================================
-- Single soft-delete entry point: the author can delete their own message,
-- and a workspace admin can delete anyone's message. Both routes land in
-- one SECURITY DEFINER function so the app does not need separate code
-- paths per caller, and so admin moderation does not require relaxing the
-- messages_update_author RLS policy (which would also let admins edit
-- bodies — a permission we don't intend to grant).
-- ============================================================================

create or replace function public.soft_delete_message(_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _author uuid;
begin
  if _caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select user_id into _author from public.messages where id = _message_id;
  if _author is null then
    raise exception 'message not found' using errcode = 'P0002';
  end if;

  if _author <> _caller and not public.is_admin(_caller) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.messages
     set deleted_at = now()
   where id = _message_id;
end;
$$;

grant execute on function public.soft_delete_message(uuid) to authenticated;
