import { supabase } from "./supabase";

export type Hazard = {
  id: string;
  type: "police";
  lat: number;
  lng: number;
  reporter_id: string | null;
  created_at: string;
  expires_at: string;
};

const METERS_PER_MILE = 1609.344;
export const HAZARD_RADIUS_MILES = 100;
export const HAZARD_RADIUS_M = HAZARD_RADIUS_MILES * METERS_PER_MILE;

export async function reportHazard(lat: number, lng: number): Promise<Hazard> {
  const { data, error } = await supabase.rpc("report_hazard", {
    p_type: "police",
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw new Error(error.message);
  return data as Hazard;
}

export async function getNearbyHazards(
  lat: number,
  lng: number,
  radiusM: number = HAZARD_RADIUS_M
): Promise<Hazard[]> {
  const { data, error } = await supabase.rpc("get_nearby_hazards", {
    p_lat: lat,
    p_lng: lng,
    p_radius_meters: radiusM,
  });
  if (error) {
    console.error("Failed to fetch hazards:", error.message);
    return [];
  }
  return (data as Hazard[]) ?? [];
}

export async function deleteHazard(id: string): Promise<void> {
  const { error } = await supabase.from("hazards").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function subscribeHazards(onChange: (payload: any) => void) {
  return supabase
    .channel(`hazards-live-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "hazards" },
      onChange
    )
    .subscribe();
}

// Haversine distance in meters — for client-side radius filtering of realtime events
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
