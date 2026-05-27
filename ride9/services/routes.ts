import { supabase } from "./supabase";

export type Waypoint = {
  lat: number;
  lng: number;
  label: string;
};

export type RoomRoute = {
  room_id: string;
  waypoints: Waypoint[];
  geometry: { coordinates: [number, number][] } | null;
  updated_at: string;
};

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_KEY || "";

// Returns null when there is genuinely no route (cleared); throws on a real error
// so callers can keep the existing route through transient network failures.
export async function getRoute(roomId: string): Promise<RoomRoute | null> {
  const { data, error } = await supabase
    .from("room_routes")
    .select("room_id, waypoints, geometry, updated_at")
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as RoomRoute) ?? null;
}

export async function saveRoute(
  roomId: string,
  userId: string,
  waypoints: Waypoint[],
  geometry: { coordinates: [number, number][] } | null
) {
  const { error } = await supabase.from("room_routes").upsert(
    {
      room_id: roomId,
      waypoints,
      geometry,
      created_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "room_id" }
  );
  if (error) throw new Error(error.message);
}

export async function clearRoute(roomId: string) {
  const { error } = await supabase.from("room_routes").delete().eq("room_id", roomId);
  if (error) throw new Error(error.message);
}

export type SearchResult = { mapbox_id: string; label: string; subtitle: string };

const SEARCHBOX = "https://api.mapbox.com/search/searchbox/v1";

export function newSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Search Box API — POI/business autocomplete (e.g. "starbucks"), nearest first
export async function searchPlaces(
  query: string,
  near: { lat: number; lng: number } | undefined,
  sessionToken: string
): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const prox = near ? `&proximity=${near.lng},${near.lat}` : "";
  const url = `${SEARCHBOX}/suggest?q=${encodeURIComponent(
    query
  )}&access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}&limit=6${prox}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    return (json.suggestions ?? []).map((s: any) => {
      // Prefer full_address (has the street); drop the trailing country segment
      const full = s.full_address || s.place_formatted || s.address || "";
      const segs = full.split(", ");
      const subtitle = segs.length > 1 ? segs.slice(0, -1).join(", ") : full;
      return { mapbox_id: s.mapbox_id, label: s.name, subtitle };
    });
  } catch {
    return [];
  }
}

// Resolve a suggestion to coordinates
export async function retrievePlace(
  mapboxId: string,
  sessionToken: string
): Promise<Waypoint | null> {
  const url = `${SEARCHBOX}/retrieve/${mapboxId}?access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const feat = json.features?.[0];
    if (!feat?.geometry?.coordinates) return null;
    const [lng, lat] = feat.geometry.coordinates;
    return { lat, lng, label: feat.properties?.name ?? "Pin" };
  } catch {
    return null;
  }
}

// Reverse geocoding — name a dropped pin
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    return json.features?.[0]?.text ?? "Dropped pin";
  } catch {
    return "Dropped pin";
  }
}

// Snap ordered waypoints to roads -> route polyline (Phase 2)
export async function fetchRouteGeometry(
  waypoints: Waypoint[]
): Promise<{ coordinates: [number, number][] } | null> {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const geo = json.routes?.[0]?.geometry;
    if (!geo) return null;
    return { coordinates: geo.coordinates as [number, number][] };
  } catch {
    return null;
  }
}

export function subscribeRoute(roomId: string, onChange: (payload: any) => void) {
  return supabase
    .channel(`room-route-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_routes", filter: `room_id=eq.${roomId}` },
      onChange
    )
    .subscribe();
}
