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
        accuracy: Location.Accuracy.High,
        distanceInterval: 5, // 每移动 5 米触发一次更新
      },
      (location) => {
        callback(location.coords);
      }
    );

    return subscription; // 返回订阅对象
  } catch (error) {
    console.error("Failed to start location tracking:", error);
    return null;
  }
}

export async function updateLocation(userId: string, lat: number, lng: number) {
  try {
    // 检查 user_id 是否存在
    const { data, error: fetchError } = await supabase
      .from("locations")
      .select("id") // 只查询 id 字段，减少数据传输
      .eq("user_id", userId)
      .single();

    if (fetchError && fetchError.code === "PGRST116") {
      // 如果记录不存在，插入新记录
      const { error: insertError } = await supabase.from("locations").insert({
        user_id: userId,
        lat,
        lng,
        updated_at: new Date(),
      });

      if (insertError) {
        console.error("Failed to insert location:", insertError.message);
      } else {
        console.log("Location inserted successfully:", { lat, lng });
      }
    } else if (!fetchError) {
      // 如果记录存在，更新记录
      const { error: updateError } = await supabase
        .from("locations")
        .update({
          lat,
          lng,
          updated_at: new Date(),
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error("Failed to update location:", updateError.message);
      } else {
        console.log("Location updated successfully:", { lat, lng });
      }
    }
  } catch (error) {
    console.error("Unexpected error while updating location:", error);
  }
}

export async function getFriendLocations(userId: string) {
  const { data, error } = await supabase
    .from("locations")
    .select("user_id, lat, lng, updated_at")
    .in(
      "user_id",
      (
        await supabase.from("friends").select("friend_id").eq("user_id", userId)
      ).data?.map((friend) => friend.friend_id) || []
    );

  if (error) {
    console.error("Failed to fetch friend locations:", error.message);
    return [];
  }

  return data || [];
}

export async function addFriend(userId: string, friendId: string) {
  const { error } = await supabase.from("friends").insert([
    { user_id: userId, friend_id: friendId },
    { user_id: friendId, friend_id: userId }, // 双向关系
  ]);

  if (error) {
    console.error("Failed to add friend:", error.message);
  } else {
    console.log("Friend added successfully.");
  }
}
