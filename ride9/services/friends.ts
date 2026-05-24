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
        email,
        username,
        bike,
        avatar_seed
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

export async function addFriend(userId: string, tag: string) {
  const cleanTag = tag.replace(/^@/, "").toLowerCase().trim();

  if (!cleanTag) throw new Error("Please enter a rider tag");

  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("username", cleanTag)
    .single();

  if (!target) throw new Error("Rider not found. Check the tag and try again.");
  if (target.id === userId) throw new Error("That's you!");

  const { error } = await supabase.from("friends").insert([
    { user_id: userId, friend_id: target.id },
    { user_id: target.id, friend_id: userId },
  ]);

  if (error?.code === "23505") throw new Error("Already in your crew");
  if (error) throw new Error(error.message);
}

export async function removeFriend(userId: string, friendId: string) {
  await supabase
    .from("friends")
    .delete()
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`
    );
}
