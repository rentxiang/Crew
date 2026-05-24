import * as Location from "expo-location";
import { supabase } from "./supabase";

export async function startLocationTracking(
  callback: (coords: { latitude: number; longitude: number }) => void
): Promise<Location.LocationSubscription | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    console.error("Location permission not granted.");
    return null;
  }

  try {
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 20,
      },
      (location) => {
        callback(location.coords);
      }
    );

    return subscription;
  } catch (error) {
    console.error("Failed to start location tracking:", error);
    return null;
  }
}

export async function updateLocation(userId: string, lat: number, lng: number) {
  const { error } = await supabase
    .from("locations")
    .upsert({ user_id: userId, lat, lng, updated_at: new Date() }, { onConflict: "user_id" });

  if (error) {
    console.error("Failed to update location:", error.message);
  }
}

export async function getFriendLocations(userId: string) {
  const { data: friendRows } = await supabase
    .from("friends")
    .select("friend_id")
    .eq("user_id", userId);

  const friendIds = friendRows?.map((f) => f.friend_id) ?? [];
  if (friendIds.length === 0) return [];

  const { data, error } = await supabase
    .from("locations")
    .select("user_id, lat, lng, updated_at")
    .in("user_id", friendIds);

  if (error) {
    console.error("Failed to fetch friend locations:", error.message);
    return [];
  }

  return data ?? [];
}
