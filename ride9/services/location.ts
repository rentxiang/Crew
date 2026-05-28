import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const LOCATION_TASK = "crew-background-location";
const USER_ID_KEY = "@crew/tracking_user_id";

// Must be defined at module top level — runs when app is backgrounded/suspended
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;
  const userId = await AsyncStorage.getItem(USER_ID_KEY);
  if (!userId) return;
  const c = data.locations[0].coords;
  await updateLocation(userId, c.latitude, c.longitude, c.speed, c.heading);
});

export async function startLocationTracking(
  userId: string,
  onUpdate: (coords: { latitude: number; longitude: number }) => void
): Promise<() => Promise<void>> {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== "granted") return async () => {};

  // Request "Always Allow" — needed for background tracking
  await Location.requestBackgroundPermissionsAsync();

  await AsyncStorage.setItem(USER_ID_KEY, userId);

  // Foreground subscription — keeps UI (map/coordsRef) in sync
  const fgSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 20 },
    (loc) => {
      onUpdate(loc.coords);
      updateLocation(
        userId,
        loc.coords.latitude,
        loc.coords.longitude,
        loc.coords.speed,
        loc.coords.heading
      );
    }
  );

  // Background task — keeps updating Supabase when app is suspended
  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (!alreadyRunning) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 30,
      showsBackgroundLocationIndicator: true,
    });
  }

  return async () => {
    fgSub.remove();
    await AsyncStorage.removeItem(USER_ID_KEY);
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  };
}

export async function updateLocation(
  userId: string,
  lat: number,
  lng: number,
  speed?: number | null,
  heading?: number | null
) {
  const row: any = { user_id: userId, lat, lng, is_sharing: true };
  if (speed != null && speed >= 0) row.speed = speed;
  if (heading != null && heading >= 0) row.heading = heading;
  const { error } = await supabase
    .from("locations")
    .upsert(row, { onConflict: "user_id" });

  if (error) console.error("Failed to update location:", error.message);
}

export async function updateSharingStatus(userId: string, isSharing: boolean) {
  await supabase
    .from("locations")
    .update({ is_sharing: isSharing })
    .eq("user_id", userId);
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
    .select("user_id, lat, lng, speed, heading, is_sharing, updated_at")
    .in("user_id", friendIds);

  if (error) {
    console.error("Failed to fetch friend locations:", error.message);
    return [];
  }

  return data ?? [];
}
