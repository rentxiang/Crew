import { createContext, useContext, useRef, useState, useEffect, useCallback, ReactNode } from "react";
import { Alert, Linking, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { startLocationTracking, updateSharingStatus, updateLocation } from "../services/location";
import { supabase } from "../services/supabase";
import { Room } from "../services/rooms";

const ROOM_KEY = "@crew/current_room";
const SHARING_INTRO_KEY = "@crew/sharing_intro_shown";
const SHARING_KEY = "@crew/sharing";

// One-time intro the first time a user turns on sharing. Tells them sharing
// keeps running until they turn it off (closing the app does NOT stop it),
// and nudges toward "Always" if not yet granted.
async function maybeShowSharingIntro() {
  if (await AsyncStorage.getItem(SHARING_INTRO_KEY)) return;
  await AsyncStorage.setItem(SHARING_INTRO_KEY, "1");
  const { status } = await Location.getBackgroundPermissionsAsync();
  const needsAlways = status !== "granted";
  const message =
    "You stay visible to your crew until you turn sharing OFF in the app — closing or killing the app does NOT stop sharing." +
    (needsAlways
      ? '\n\nFor reliable background sharing, allow "Always" in Settings.'
      : "");
  Alert.alert(
    "Sharing your location",
    message,
    needsAlways
      ? [
          { text: "Got it", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      : [{ text: "Got it", style: "cancel" }]
  );
}

type Coords = {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
};

type LocationSharingContextType = {
  isSharing: boolean;
  isTransitioning: boolean;
  coordsRef: React.MutableRefObject<Coords | null>;
  startSharing: (userId: string, opts?: { silent?: boolean }) => Promise<void>;
  stopSharing: () => Promise<void>;
  currentRoom: Room | null;
  setCurrentRoom: (room: Room | null) => void;
  focusCoords: Coords | null;
  setFocusCoords: (coords: Coords | null) => void;
  showRoute: boolean;
  setShowRoute: (v: boolean) => void;
};

const LocationSharingContext = createContext<LocationSharingContextType | null>(null);

export function LocationSharingProvider({ children }: { children: ReactNode }) {
  const [isSharing, setIsSharing] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentRoom, _setCurrentRoom] = useState<Room | null>(null);
  const [focusCoords, setFocusCoords] = useState<Coords | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const coordsRef = useRef<Coords | null>(null);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const userIdRef = useRef<string | null>(null);
  const busyRef = useRef(false); // guards against rapid start/stop taps overlapping

  // Restore room from storage on boot
  useEffect(() => {
    const restore = async () => {
      const raw = await AsyncStorage.getItem(ROOM_KEY);
      if (!raw) return;
      const saved: Room = JSON.parse(raw);
      const { data } = await supabase
        .from("rooms")
        .select("id, code, host_id, expires_at")
        .eq("id", saved.id)
        .single();
      if (data && (!data.expires_at || new Date(data.expires_at).getTime() > Date.now())) {
        _setCurrentRoom({ id: data.id, code: data.code, host_id: data.host_id });
      } else {
        await AsyncStorage.removeItem(ROOM_KEY);
      }
    };
    restore();
  }, []);

  const setCurrentRoom = (room: Room | null) => {
    _setCurrentRoom(room);
    if (room) {
      AsyncStorage.setItem(ROOM_KEY, JSON.stringify(room));
    } else {
      AsyncStorage.removeItem(ROOM_KEY);
    }
  };

  const startSharing = async (userId: string, opts?: { silent?: boolean }) => {
    if (busyRef.current || stopRef.current) return; // already on or mid-transition
    busyRef.current = true;
    setIsTransitioning(true);
    setIsSharing(true); // optimistic — instant UI
    try {
      userIdRef.current = userId;
      const stop = await startLocationTracking(userId, (coords) => {
        coordsRef.current = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          heading: coords.heading,
          speed: coords.speed,
        };
      });
      stopRef.current = stop;
      await AsyncStorage.setItem(SHARING_KEY, "1");
      if (!opts?.silent) maybeShowSharingIntro();
    } catch {
      // failed to start — roll back
      setIsSharing(false);
      stopRef.current = null;
    } finally {
      busyRef.current = false;
      setIsTransitioning(false);
    }
  };

  const stopSharing = async () => {
    if (busyRef.current) return; // mid-transition
    busyRef.current = true;
    setIsTransitioning(true);
    setIsSharing(false); // optimistic — instant UI
    try {
      if (stopRef.current) {
        await stopRef.current();
        stopRef.current = null;
      }
      await AsyncStorage.setItem(SHARING_KEY, "0");
      if (userIdRef.current) {
        await updateSharingStatus(userIdRef.current, false);
      }
    } finally {
      busyRef.current = false;
      setIsTransitioning(false);
    }
  };

  // On boot, restore sharing state. Use the local flag first (instant, no flash),
  // and only consult the DB when there's no local flag yet (legacy/first run).
  useEffect(() => {
    const restoreSharing = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const local = await AsyncStorage.getItem(SHARING_KEY);
      if (local === "1") {
        startSharing(user.id, { silent: true });
        return;
      }
      if (local === null) {
        const { data } = await supabase
          .from("locations")
          .select("is_sharing")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.is_sharing) startSharing(user.id, { silent: true });
      }
    };
    restoreSharing();
  }, []);

  // When returning to foreground while sharing, push a fresh location so friends
  // see us active again — watchPositionAsync won't fire if we haven't moved 20m.
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active" || !stopRef.current || !userIdRef.current) return;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        coordsRef.current = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        await updateLocation(
          userIdRef.current,
          loc.coords.latitude,
          loc.coords.longitude,
          loc.coords.speed,
          loc.coords.heading
        );
      } catch {
        if (coordsRef.current) {
          await updateLocation(
            userIdRef.current,
            coordsRef.current.latitude,
            coordsRef.current.longitude
          );
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRef.current?.();
    };
  }, []);

  // ── Incoming ride invites ────────────────────────────────────
  // Sources of unacknowledged invites:
  //   (a) realtime INSERT on room_members where user_id=me + invited_by set
  //   (b) boot / foreground reconciliation — catches invites that arrived
  //       while the app was killed or backgrounded (realtime doesn't replay)
  // Both funnel into processInvite(). On Join we null out `invited_by` so the
  // boot scan won't re-prompt next launch.
  const currentRoomRef = useRef<Room | null>(currentRoom);
  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);
  const processedInvitesRef = useRef<Set<string>>(new Set());

  const processInvite = useCallback(async (roomId: string, userId: string) => {
    if (processedInvitesRef.current.has(roomId)) return;
    processedInvitesRef.current.add(roomId);

    // Single round-trip: rooms + host name via FK embed
    const { data: room } = await supabase
      .from("rooms")
      .select("id, code, host_id, expires_at, host:users!rooms_host_id_fkey(name)")
      .eq("id", roomId)
      .single();
    if (!room) {
      await supabase
        .from("room_members")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", userId);
      processedInvitesRef.current.delete(roomId);
      return;
    }
    if (room.expires_at && new Date(room.expires_at).getTime() < Date.now()) {
      await supabase
        .from("room_members")
        .delete()
        .eq("room_id", room.id)
        .eq("user_id", userId);
      return;
    }
    const hostName = (room as any).host?.name ?? "A friend";
    const targetRoom: Room = {
      id: room.id,
      code: room.code,
      host_id: room.host_id,
    };
    const inAnotherRoom =
      currentRoomRef.current && currentRoomRef.current.id !== targetRoom.id;

    Alert.alert(
      "Ride invite",
      inAnotherRoom
        ? `${hostName} invited you. Joining will leave your current ride.`
        : `${hostName} invited you to a group ride.`,
      [
        {
          text: "Decline",
          style: "cancel",
          onPress: async () => {
            await supabase
              .from("room_members")
              .delete()
              .eq("room_id", targetRoom.id)
              .eq("user_id", userId);
            // Release the dedupe slot so a *new* invite to the same room
            // (host re-invites after a decline) can fire another alert.
            processedInvitesRef.current.delete(targetRoom.id);
          },
        },
        {
          text: "Join",
          onPress: async () => {
            if (inAnotherRoom && currentRoomRef.current) {
              await supabase
                .from("room_members")
                .delete()
                .eq("room_id", currentRoomRef.current.id)
                .eq("user_id", userId);
            }
            // Mark this invite as acknowledged so the boot scan skips it next launch
            await supabase
              .from("room_members")
              .update({ invited_by: null })
              .eq("room_id", targetRoom.id)
              .eq("user_id", userId);
            setCurrentRoom(targetRoom);
            await startSharing(userId, { silent: true });
            processedInvitesRef.current.delete(targetRoom.id);
          },
        },
      ]
    );
  }, []);

  const checkPendingInvites = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("room_members")
      .select("room_id")
      .eq("user_id", userId)
      .not("invited_by", "is", null);
    for (const row of data ?? []) {
      await processInvite((row as any).room_id, userId);
    }
  }, [processInvite]);

  useEffect(() => {
    let channel: any = null;
    let subscribedUserId: string | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const setup = (userId: string) => {
      // Idempotent: don't tear down a working channel when SIGNED_IN re-fires
      // (Supabase emits both INITIAL_SESSION-like events and SIGNED_IN on boot).
      // A teardown+resub creates a window where realtime events get lost.
      if (subscribedUserId === userId && channel) {
        checkPendingInvites(userId);
        return;
      }
      if (channel) supabase.removeChannel(channel);
      subscribedUserId = userId;
      channel = supabase
        .channel(`room-invites-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "room_members",
            filter: `user_id=eq.${userId}`,
          },
          async (payload) => {
            const row = payload.new as any;
            if (!row?.invited_by) return;
            await processInvite(row.room_id, userId);
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("room-invites channel", status);
          }
        });
      checkPendingInvites(userId);

      // Backup: poll every 20s in case realtime drops an event silently
      // (channel reconnect gaps, missed INSERTs, etc.). Cheap query.
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(() => {
        checkPendingInvites(userId);
      }, 20000);
    };

    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setup(data.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) setup(session.user.id);
      if (event === "SIGNED_OUT") {
        if (channel) supabase.removeChannel(channel);
        if (pollInterval) clearInterval(pollInterval);
        channel = null;
        pollInterval = null;
        subscribedUserId = null;
        processedInvitesRef.current.clear();
      }
    });

    // Re-scan whenever the app returns to foreground — realtime doesn't replay
    // events that fired while backgrounded.
    const appStateSub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      const { data } = await supabase.auth.getUser();
      if (data?.user) await checkPendingInvites(data.user.id);
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (pollInterval) clearInterval(pollInterval);
      sub.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, [processInvite, checkPendingInvites]);

  return (
    <LocationSharingContext.Provider
      value={{ isSharing, isTransitioning, coordsRef, startSharing, stopSharing, currentRoom, setCurrentRoom, focusCoords, setFocusCoords, showRoute, setShowRoute }}
    >
      {children}
    </LocationSharingContext.Provider>
  );
}

export function useLocationSharing() {
  const ctx = useContext(LocationSharingContext);
  if (!ctx) throw new Error("useLocationSharing must be used inside LocationSharingProvider");
  return ctx;
}
