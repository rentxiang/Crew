import { supabase } from "./supabase";

export type Room = { id: string; code: string; host_id: string };
export type RoomMember = { user_id: string; name: string; email: string; bike: string | null; avatar_seed: string | null };

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function createRoom(userId: string): Promise<Room> {
  const code = generateCode();
  const { data: room, error } = await supabase
    .from("rooms")
    .insert({ code, host_id: userId })
    .select("id, code, host_id")
    .single();

  if (error || !room) throw new Error(error?.message ?? "Failed to create room");

  await supabase
    .from("room_members")
    .insert({ room_id: room.id, user_id: userId });

  return room as Room;
}

export async function joinRoom(code: string, userId: string): Promise<Room> {
  const { data: room, error } = await supabase
    .from("rooms")
    .select("id, code, host_id, expires_at")
    .eq("code", code.trim())
    .single();

  if (error || !room) throw new Error("Room not found. Check the code and try again.");
  if (room.expires_at && new Date(room.expires_at).getTime() < Date.now()) {
    throw new Error("This ride has ended.");
  }

  await supabase
    .from("room_members")
    .upsert({ room_id: room.id, user_id: userId }, { onConflict: "room_id,user_id" });

  return { id: room.id, code: room.code, host_id: room.host_id };
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  await supabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId);
}

export async function deleteRoom(roomId: string): Promise<void> {
  await supabase.from("rooms").delete().eq("id", roomId);
}

export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from("room_members")
    .select("user_id")
    .eq("room_id", roomId);

  if (error || !data) return [];

  const userIds = data.map((m) => m.user_id);
  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, bike, avatar_seed")
    .in("id", userIds);

  return (users ?? []).map((u: any) => ({
    user_id: u.id,
    name: u.name,
    email: u.email,
    bike: u.bike ?? null,
    avatar_seed: u.avatar_seed ?? null,
  }));
}

export async function getRoomMemberLocations(roomId: string) {
  const { data: members } = await supabase
    .from("room_members")
    .select("user_id")
    .eq("room_id", roomId);

  const ids = members?.map((m) => m.user_id) ?? [];
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("locations")
    .select("user_id, lat, lng, speed, heading, is_sharing, updated_at")
    .in("user_id", ids);

  return data ?? [];
}

export function subscribeRoomMembers(
  roomId: string,
  onChange: () => void
) {
  return supabase
    .channel(`room-members-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
      onChange
    )
    .subscribe();
}
