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
    .eq("user_id", userId)
    .eq("status", "accepted");

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

export async function getSentRequests(userId: string) {
  const { data, error } = await supabase
    .from("friends")
    .select(
      `
      id,
      friend_id,
      receiver:users!friends_friend_id_fkey (
        id,
        name,
        username,
        bike,
        avatar_seed
      )
    `
    )
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}

export async function getPendingRequests(userId: string) {
  const { data, error } = await supabase
    .from("friends")
    .select(
      `
      id,
      user_id,
      requester:users!friends_user_id_fkey (
        id,
        name,
        username,
        bike
      )
    `
    )
    .eq("friend_id", userId)
    .eq("status", "pending");

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
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

  const { data: existing } = await supabase
    .from("friends")
    .select("id, user_id, status")
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${target.id}),and(user_id.eq.${target.id},friend_id.eq.${userId})`
    )
    .maybeSingle();

  if (existing?.status === "accepted") throw new Error("Already in your crew");
  if (existing?.status === "pending" && existing.user_id === userId)
    throw new Error("Request already sent");

  // They already sent us a request — auto-accept
  if (existing?.status === "pending" && existing.user_id === target.id) {
    await acceptRequest(existing.id, target.id, userId);
    return { autoAccepted: true };
  }

  const { error } = await supabase.from("friends").insert({
    user_id: userId,
    friend_id: target.id,
    status: "pending",
  });

  if (error?.code === "23505") throw new Error("Already in your crew");
  if (error) throw new Error(error.message);

  return { autoAccepted: false };
}

export async function acceptRequest(
  requestId: string,
  requesterId: string,
  currentUserId: string
) {
  const { error: updateError } = await supabase
    .from("friends")
    .update({ status: "accepted" })
    .eq("id", requestId);

  if (updateError) throw new Error(updateError.message);

  const { error: insertError } = await supabase.from("friends").insert({
    user_id: currentUserId,
    friend_id: requesterId,
    status: "accepted",
  });

  if (insertError && insertError.code !== "23505")
    throw new Error(insertError.message);
}

export async function rejectRequest(requestId: string) {
  const { error } = await supabase
    .from("friends")
    .delete()
    .eq("id", requestId);
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
