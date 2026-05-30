-- Host invites a friend directly into their ride room (no code-share).
--
-- 1. Add `invited_by` column on room_members so the client + Edge Function
--    can distinguish a host-initiated invite from a self-join.
--    NULL = self-join (createRoom / joinRoom by code).
--    Non-null = host-invited (set by RPC).
-- 2. RPC `host_invite_friend(room_id, friend_id)`:
--      - only the room's host can call
--      - only for accepted friends
--      - INSERT bypasses RLS via security definer

alter table public.room_members
  add column if not exists invited_by uuid references public.users(id);

create or replace function public.host_invite_friend(
  p_room_id uuid,
  p_friend_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_id uuid;
  v_is_friend boolean;
begin
  select host_id into v_host_id from public.rooms where id = p_room_id;
  if v_host_id is null then raise exception 'Room not found'; end if;
  if v_host_id <> auth.uid() then raise exception 'Only the host can invite'; end if;
  if p_friend_id = auth.uid() then raise exception 'Already in the room'; end if;

  select exists(
    select 1 from public.friends
    where user_id = auth.uid()
      and friend_id = p_friend_id
      and status = 'accepted'
  ) into v_is_friend;
  if not v_is_friend then raise exception 'Not in your crew'; end if;

  insert into public.room_members (room_id, user_id, invited_by)
  values (p_room_id, p_friend_id, auth.uid())
  on conflict (room_id, user_id) do nothing;
end;
$$;

grant execute on function public.host_invite_friend(uuid, uuid) to authenticated;
