import Mapbox, { Camera, LocationPuck, MapView } from "@rnmapbox/maps";
import { useEffect, useState, useRef } from "react";
import { StyleSheet, TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/services/supabase";
import RiderMarker from "../../components/RiderMarker";
import {
  startLocationTracking,
  updateLocation,
  getFriendLocations,
} from "../../services/location";
import { subscribeLocations } from "../../services/realtime";
import { getFriends } from "../../services/friends";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_KEY || "");

export default function MapScreen() {
  const [friends, setFriends] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [authUser, setAuthUser] = useState<any>(null);
  const [centered, setCentered] = useState(false);

  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const cameraRef = useRef<Camera>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setAuthUser(data.user);
        loadFriends(data.user.id);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setAuthUser(session.user);
        loadFriends(session.user.id);
      }
      if (event === "SIGNED_OUT") {
        setAuthUser(null);
        setFriends([]);
        setLocations([]);
      }
    });

    return () => sub?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    getFriendLocations(authUser.id).then((data) => setLocations(data || []));
  }, [authUser]);

  const loadFriends = async (userId: string) => {
    const data = await getFriends(userId);
    setFriends(
      data.map((item: any) => ({
        user_id: item.friend_id,
        name: item.friend.name,
        email: item.friend.email,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/png?seed=${item.friend.email}`,
      }))
    );
  };

  useEffect(() => {
    if (!authUser) return;
    let locationSub: any = null;

    startLocationTracking((coords) => {
      coordsRef.current = coords;
      updateLocation(authUser.id, coords.latitude, coords.longitude);

      if (!centered && cameraRef.current) {
        cameraRef.current.flyTo([coords.longitude, coords.latitude], 800);
        setCentered(true);
      }
    }).then((sub) => {
      locationSub = sub;
    });

    return () => locationSub?.remove();
  }, [authUser]);

  useEffect(() => {
    if (!authUser || friends.length === 0) return;
    const friendIds = friends.map((f) => f.user_id);
    const sub = subscribeLocations(friendIds, setLocations);
    return () => { sub?.unsubscribe(); };
  }, [friends]);

  const mergedFriends = friends.map((f) => {
    const loc = locations.find((l) => l.user_id === f.user_id);
    return { ...f, latitude: loc?.lat, longitude: loc?.lng };
  });

  const activeCount = mergedFriends.filter((f) => f.latitude && f.longitude).length;

  const centerOnUser = () => {
    if (coordsRef.current && cameraRef.current) {
      const { latitude, longitude } = coordsRef.current;
      cameraRef.current.flyTo([longitude, latitude], 600);
    }
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} styleURL="mapbox://styles/mapbox/dark-v11">
        <Camera
          ref={cameraRef}
          zoomLevel={15}
          followUserLocation={false}
          animationMode="flyTo"
        />
        <LocationPuck
          puckBearing="heading"
          puckBearingEnabled
          pulsing={{ isEnabled: true }}
        />
        {mergedFriends.map((f) =>
          f.latitude && f.longitude ? (
            <RiderMarker key={f.user_id} rider={f} />
          ) : null
        )}
      </MapView>

      {/* HUD */}
      <View style={styles.hud}>
        <View style={styles.hudBadge}>
          <View style={[styles.liveDot, activeCount > 0 && styles.liveDotActive]} />
          <Text style={styles.hudText}>
            {activeCount > 0
              ? `${activeCount} RIDER${activeCount > 1 ? "S" : ""} LIVE`
              : "NO RIDERS ONLINE"}
          </Text>
        </View>
      </View>

      {/* Center */}
      <TouchableOpacity style={styles.centerButton} onPress={centerOnUser}>
        <Ionicons name="locate" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  hud: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "none",
  },
  hudBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(8, 8, 8, 0.88)",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    gap: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#333",
  },
  liveDotActive: {
    backgroundColor: "#ff4500",
  },
  hudText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.5,
  },
  centerButton: {
    position: "absolute",
    bottom: 100,
    right: 16,
    backgroundColor: "rgba(10, 10, 10, 0.9)",
    borderWidth: 1,
    borderColor: "#222",
    padding: 13,
    borderRadius: 14,
  },
});
