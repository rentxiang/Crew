import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabase";

type Ctx = {
  count: number;
  decrement: () => void;
  refresh: () => Promise<void>;
};

const PendingCountContext = createContext<Ctx>({
  count: 0,
  decrement: () => {},
  refresh: async () => {},
});

export function PendingCountProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) { setCount(0); return; }
    const { count: c } = await supabase
      .from("friends")
      .select("id", { count: "exact", head: true })
      .eq("friend_id", userId)
      .eq("status", "pending");
    setCount(c ?? 0);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    // Realtime only handles incoming new requests (INSERT) — local decrement
    // covers accept/reject, so we don't have to depend on DELETE filtering
    // which breaks without REPLICA IDENTITY FULL.
    const channel = supabase
      .channel("pending-count-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "friends",
          filter: `friend_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row.status === "pending") setCount((c) => c + 1);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refresh]);

  const decrement = useCallback(() => {
    setCount((c) => Math.max(0, c - 1));
  }, []);

  return (
    <PendingCountContext.Provider value={{ count, decrement, refresh }}>
      {children}
    </PendingCountContext.Provider>
  );
}

export const usePendingCount = () => useContext(PendingCountContext);
