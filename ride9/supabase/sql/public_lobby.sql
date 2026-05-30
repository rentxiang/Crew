-- Public lobby: opt-in broadcast of your live location to any rider within 100 mi.
--
-- 1. Add `public_visible` flag on users (default off)
-- 2. RPC `get_nearby_public_riders(lat, lng, radius_m)` returns users who:
--      - public_visible = true
--      - locations.is_sharing = true
--      - within haversine radius of caller
--    Uses security definer so RLS on locations doesn't block stranger reads.
--    Caller (auth.uid()) is excluded from results.

alter table public.users
  add column if not exists public_visible boolean not null default false;

create or replace function public.get_nearby_public_riders(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters double precision default 160934
)
returns table (
  user_id uuid,
  name text,
  username text,
  bike text,
  avatar_seed text,
  email text,
  lat double precision,
  lng double precision,
  speed double precision,
  heading double precision,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.name,
    u.username,
    u.bike,
    u.avatar_seed,
    u.email,
    l.lat,
    l.lng,
    l.speed,
    l.heading,
    l.updated_at
  from public.users u
  join public.locations l on l.user_id = u.id
  where u.public_visible = true
    and l.is_sharing = true
    and u.id <> auth.uid()
    and (
      6371000 * acos(
        least(
          1,
          cos(radians(p_lat)) * cos(radians(l.lat))
            * cos(radians(l.lng) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(l.lat))
        )
      )
    ) <= p_radius_meters;
$$;

grant execute on function public.get_nearby_public_riders(
  double precision, double precision, double precision
) to authenticated;
