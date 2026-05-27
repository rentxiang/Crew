import { supabase } from "./supabase";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  bike: string | null;
  avatar_seed: string | null;
};

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, username, bike, avatar_seed")
    .eq("id", userId)
    .single();

  if (error) return null;
  return data as UserProfile;
}

export async function updateProfile(
  userId: string,
  updates: { name?: string; username?: string; bike?: string; avatar_seed?: string }
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId);

  if (error?.code === "23505") throw new Error("That rider tag is already taken.");
  if (error) throw new Error(error.message);
}

export function avatarUrl(seed: string | null, email: string): string {
  return `https://api.dicebear.com/7.x/adventurer/png?seed=${seed ?? email}`;
}

export async function deleteAccount(userId: string): Promise<void> {
  // Remove own voice file (storage isn't covered by the SQL function)
  await supabase.storage.from("voice-messages").remove([`${userId}/voice.m4a`]);
  const { error } = await supabase.rpc("delete_user");
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}
