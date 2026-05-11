-- ============================================================================
-- Channel creator auto-membership
--
-- When a channel is inserted, the creator (`created_by`) must be added to
-- channel_members with role='owner'. Without this trigger, the RLS policy
-- on channel_members prevents inserting an owner for a freshly-created
-- private/dm/group_dm channel (no existing owner to authorize the insert).
-- ============================================================================

create or replace function public.handle_new_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.channel_members (channel_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (channel_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_channel_created
  after insert on public.channels
  for each row execute function public.handle_new_channel();
