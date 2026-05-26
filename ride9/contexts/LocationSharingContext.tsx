import { createContext, useContext, useRef, useState, useEffect, ReactNode } from "react";
import { Alert, Linking, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { startLocationTracking, updateSharingStatus, updateLocation } from "../services/location";
import { supabase } from "../services/supabase";
import { Room } from "../services/rooms";

const ROOM_KEY = "@crew/current_room";
const ALWAYS_HINT_KEY = "@crew/always_hint_shown";

// One-time nudge toward "Always Allow" so background sharing is reliable
async function maybePromptAlways() {
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status === "granted") return;
  if (await AsyncStorage.getItem(ALWAYS_HINT_KEY)) return;
  await AsyncStorage.setItem(ALWAYS_HINT_KEY, "1");
  Alert.alert(
    "Stay visible to your crew",
    'Set location to "Always" so your crew can still see you during navigation or with your screen locked.',
    [
      { text: "Not Now", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ]
  );
}

type Coords = { latitude: number; longitude: number };

type LocationSharingContextType = {
  isSharing: boolean;
  coordsRef: React.MutableRefObject<Coords | null>;
  startSharing: (userId: string, opts?: { silent?: boolean }) => Promise<void>;
  stopSharing: () => Promise<void>;
  currentRoom: Room | null;
  setCurrentRoom: (room: Room | null) => void;
  focusCoords: Coords | null;
  setFocusCoords: (coords: Coords | null) => void;
};

const LocationSharingContext = createContext<LocationSharingContextType | null>(null);

export function LocationSharingProvider({ children }: { children: ReactNode }) {
  const [isSharing, setIsSharing] = useState(false);
  const [currentRoom, _setCurrentRoom] = useState<Room | null>(null);
  const [focusCoords, setFocusCoords] = useState<Coords | null>(null);
  const coordsRef = useRef<Coords | null>(null);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Restore room from storage on boot
  useEffect(() => {
    const restore = async () => {
      const raw = await AsyncStorage.getItem(ROOM_KEY);
      if (!raw) return;
      const saved: Room = JSON.parse(raw);
      const { data } = await supabase
        .from("rooms")
        .select("id, code, host_id")
        .eq("id", saved.id)
        .single();
      if (data) {
        _setCurrentRoom(data as Room);
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
    if (stopRef.current) return;
    userIdRef.current = userId;
    const stop = await startLocationTracking(userId, (coords) => {
      coordsRef.current = coords;
    });
    stopRef.current = stop;
    setIsSharing(true);
    if (!opts?.silent) maybePromptAlways();
  };

  const stopSharing = async () => {
    if (stopRef.current) {
      await stopRef.current();
      stopRef.current = null;
    }
    setIsSharing(false);
    if (userIdRef.current) {
      await updateSharingStatus(userIdRef.current, false);
    }
  };

  // On boot, sync client to the DB's authoritative sharing state.
  // If the DB says we're still sharing (e.g. after a force-kill), resume tracking.
  useEffect(() => {
    const reconcile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("locations")
        .select("is_sharing")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.is_sharing && !stopRef.current) {
        await startSharing(user.id, { silent: true });
      }
    };
    reconcile();
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
        await updateLocation(userIdRef.current, loc.coords.latitude, loc.coords.longitude);
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

  return (
    <LocationSharingContext.Provider
      value={{ isSharing, coordsRef, startSharing, stopSharing, currentRoom, setCurrentRoom, focusCoords, setFocusCoords }}
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
