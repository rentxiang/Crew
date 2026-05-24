# Carve

> Real-time group ride tracking for motorcyclists.

Carve lets riders share their live location with their crew during group rides — no route planning, no navigation, just pure live awareness of where everyone is. Inspired by Zenly and Apple Find My, built for the riding culture.

![Map](image-1.png) ![Group Ride](image-3.png) ![Profile](image-2.png)

---

## Features

- **Live location sharing** — toggle on/off with one tap. Location stops broadcasting the moment you turn it off
- **Crew system** — add riders by their unique `@ridertag`, see their avatar and bike on the map in real time
- **Group ride rooms** — generate a 6-digit room code, anyone can join without being friends first. Perfect for club runs and meetups
- **Avatar system** — 12 unique adventurer avatars, show your bike info to your crew
- **Breathing marker animations** — each rider's avatar pulses on the map to indicate live status
- **Dark premium UI** — built for night rides, minimal and fast

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo SDK 54 (bare workflow) |
| Language | TypeScript |
| Navigation | Expo Router (file-based) |
| Map | Mapbox (`@rnmapbox/maps`) |
| Backend | Supabase (PostgreSQL + Realtime) |
| Auth | Supabase Auth (email/password) |
| Location | `expo-location` — `watchPositionAsync`, 20m distance interval |
| Animations | React Native Animated API |
| State | React Context (`LocationSharingContext`) |

---

## Architecture

```
app/
├── _layout.tsx          # Root layout, auth guard, session listener
├── login.tsx            # Sign in / sign up
└── (tabs)/
    ├── index.tsx        # Map screen — live rider markers, share toggle
    ├── ride.tsx         # Group ride room — create/join with 6-digit code
    ├── friends.tsx      # Crew management — add/remove by @tag
    └── profile.tsx      # Profile — avatar picker, rider tag, bike info

services/
├── supabase.ts          # Supabase client
├── location.ts          # GPS tracking, location upsert, sharing status
├── friends.ts           # Crew CRUD
├── rooms.ts             # Group ride room logic
├── profile.ts           # User profile, avatar URL helper
└── realtime.ts          # Supabase Realtime location subscriptions

contexts/
└── LocationSharingContext.tsx  # Global sharing state across tabs

components/
└── RiderMarker.tsx      # Animated map marker with avatar + breathing glow
```

---

## Key Technical Decisions

**Ghost marker prevention** — each user has an `is_sharing` boolean in the `locations` table. `stopSharing()` sets it to `false` before the subscription is removed, so stale markers never appear on other riders' maps.

**Cross-tab state** — location sharing state lives in a React Context wrapping the root layout, so toggling share on the map tab instantly reflects in the ride tab and vice versa.

**Bidirectional friends** — adding a friend inserts two rows simultaneously (`user_id → friend_id` and `friend_id → user_id`), so both riders see each other without a separate accept flow.

**Group rooms without friends** — room members share location via a separate `room_members` table and polling, independent of the friends system. Riders are merged and deduplicated on the client before rendering.

---

## Database Schema

```sql
users         id, email, name, username (unique), bike, avatar_seed
friends       user_id, friend_id  (bidirectional rows)
locations     user_id, lat, lng, is_sharing, updated_at
rooms         id, code (6-digit unique), host_id
room_members  room_id, user_id
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Xcode (for iOS)
- [Mapbox](https://mapbox.com) account (free tier works)
- [Supabase](https://supabase.com) project (free tier works)

### Setup

```bash
git clone https://github.com/rentxiang/carve.git
cd carve
npm install
```

Create a `.env` file:

```
EXPO_PUBLIC_MAPBOX_KEY=your_mapbox_public_token
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run on simulator:

```bash
npx expo run:ios
```

Run on physical device (standalone, no Mac needed after install):

```bash
npx expo run:ios --device --configuration Release
```

### Supabase Setup

Run in your Supabase SQL editor:

```sql
create table users (id uuid primary key, email text, name text, username text unique, bike text, avatar_seed text);
create table friends (user_id uuid, friend_id uuid, primary key (user_id, friend_id));
create table locations (user_id uuid primary key, lat float, lng float, is_sharing boolean default false, updated_at timestamptz);
create table rooms (id uuid primary key default gen_random_uuid(), code text unique, host_id uuid);
create table room_members (room_id uuid, user_id uuid, primary key (room_id, user_id));

alter table users enable row level security;
alter table friends enable row level security;
alter table locations enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;

create policy "allow all" on users for all using (true) with check (true);
create policy "allow all" on friends for all using (true) with check (true);
create policy "allow all" on locations for all using (true) with check (true);
create policy "allow all" on rooms for all using (true) with check (true);
create policy "allow all" on room_members for all using (true) with check (true);
```

---

## License

MIT
