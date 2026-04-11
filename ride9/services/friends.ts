import { supabase } from "./supabase";

export async function getFriends(userId: string) {
  const { data, error } = await supabase
    .from("friends")
    .select(
      `
      friend_id,
      friend:users!friends_friend_id_fkey (
        id,
        name,
        email
      )
    `
    )
    .eq("user_id", userId);

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

export async function addFriend(userId: string, email: string) {
  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!target) throw new Error("User not found");
  if (target.id === userId) throw new Error("Cannot add yourself");

  await supabase.from("friends").insert([
    { user_id: userId, friend_id: target.id },
    { user_id: target.id, friend_id: userId },
  ]);
}

export async function removeFriend(userId: string, friendId: string) {
  await supabase
    .from("friends")
    .delete()
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`
    );
}
