import { supabase } from "./supabase";

export const PUBLIC_LOBBY_RADIUS_MILES = 100;
const PUBLIC_LOBBY_RADIUS_METERS = PUBLIC_LOBBY_RADIUS_MILES * 1609.34;

export async function setPublicVisibility(userId: string, visible: boolean) {
  const { error } = await supabase
    .from("users")
    .update({ public_visible: visible })
    .eq("id", userId);
  if (error) throw error;
}

export async function getPublicVisibility(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("public_visible")
    .eq("id", userId)
    .single();
  return !!data?.public_visible;
}

export type PublicRider = {
  user_id: string;
  name: string;
  username: string | null;
  bike: string | null;
  avatar_seed: string | null;
  email: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  updated_at: string;
};

export async function fetchNearbyPublicRiders(
  lat: number,
  lng: number
): Promise<PublicRider[]> {
  const { data, error } = await supabase.rpc("get_nearby_public_riders", {
    p_lat: lat,
    p_lng: lng,
    p_radius_meters: PUBLIC_LOBBY_RADIUS_METERS,
  });
  if (error) {
    console.error("get_nearby_public_riders error", error.message);
    return [];
  }
  return (data as PublicRider[]) ?? [];
}
