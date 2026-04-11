import { supabase } from "./supabase";

export function subscribeLocations(friendIds: string[], setLocations: any) {
  return supabase
    .channel("locations-channel")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "locations",
      },
      (payload) => {
        const updated = payload.new as any;

        if (!friendIds.includes(updated.user_id)) return;

        setLocations((prev: any[]) => {
          const others = prev.filter((l) => l.user_id !== updated.user_id);
          return [...others, updated];
        });
      }
    )
    .subscribe();
}
