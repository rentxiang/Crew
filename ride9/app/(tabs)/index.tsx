import Mapbox, { Camera, LocationPuck, MapView } from "@rnmapbox/maps";
import { useEffect, useState, useRef } from "react";
import { StyleSheet, TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import FriendMarker from "../../components/FriendMaker";
import {
  startLocationTracking,
  updateLocation,
  getFriendLocations,
} from "../../services/location";
import { subscribeLocations } from "../../services/realtime";
import { getFriends } from "../../services/friends";
import { supabase } from "@/services/supabase";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_KEY || "");

export default function Map() {
  const [friends, setFriends] = useState<any[]>([]); // 👈 用户信息
  const [locations, setLocations] = useState<any[]>([]); // 👈 位置
  const [authUser, setAuthUser] = useState<any>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(
    null
  );
  const cameraRef = useRef<Camera>(null);

  // ========================
  // Auth
  // ========================
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setAuthUser(data.user);
        loadFriends(data.user.id);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setAuthUser(session.user);
        loadFriends(session.user.id);
      }
    });

    return () => {
      sub?.subscription.unsubscribe();
    };
  }, []);

  // ========================
  // Load friends（静态）
  // ========================
  useEffect(() => {
    if (!authUser) return;

    const loadInitialLocations = async () => {
      const data = await getFriendLocations(authUser.id);

      setLocations(data || []);
    };

    loadInitialLocations();
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

  // 3s refresh friend locations
  useEffect(() => {
    if (!authUser) return;

    const interval = setInterval(async () => {
      const data = await getFriendLocations(authUser.id);
      setLocations(data || []);
    }, 3000); // 每 3 秒调用一次

    return () => {
      clearInterval(interval); // 清除定时器，避免内存泄漏
    };
  }, [authUser]);

  // ========================
  // Location tracking（自己）
  // ========================
  useEffect(() => {
    if (!authUser) return;

    let locationSub: any = null;

    startLocationTracking((coords) => {
      coordsRef.current = coords;

      updateLocation(authUser.id, coords.latitude, coords.longitude);
    }).then((sub) => {
      locationSub = sub;
    });

    return () => {
      locationSub?.remove();
    };
  }, [authUser]);

  useEffect(() => {
    console.log("Friends:", friends);
  }, [friends]);

  // ========================
  // Realtime（好友位置）
  // ========================
  useEffect(() => {
    if (!authUser || friends.length === 0) return;

    const friendIds = friends.map((f) => f.user_id);

    const sub = subscribeLocations(friendIds, setLocations);

    return () => {
      sub?.unsubscribe();
    };
  }, [friends]);

  // ========================
  // merge（核心！！！）
  // ========================
  const mergedFriends = friends.map((f) => {
    const loc = locations.find((l) => l.user_id === f.user_id);

    return {
      ...f,
      latitude: loc?.lat,
      longitude: loc?.lng,
    };
  });
  // ========================
  // UI
  // ========================
  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        styleURL={theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : ""}
      >
        <Camera ref={cameraRef} zoomLevel={16} followUserLocation={false} />

        <LocationPuck
          puckBearing="heading"
          puckBearingEnabled
          pulsing={{ isEnabled: true }}
        />

        {/* 👇 渲染真实好友 */}
        {mergedFriends.map((f) =>
          f.latitude && f.longitude ? (
            <FriendMarker key={f.user_id} friend={f} />
          ) : null
        )}
      </MapView>

      {/* Theme toggle */}
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
      >
        <Ionicons name="sunny" size={24} color="black" />
      </TouchableOpacity>

      {/* Center button */}
      <TouchableOpacity
        style={styles.centerButton}
        onPress={() => {
          if (coordsRef.current && cameraRef.current) {
            const { latitude, longitude } = coordsRef.current;
            cameraRef.current.flyTo([longitude, latitude], 1000);
          }
        }}
      >
        <Ionicons name="locate" size={24} color="black" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    position: "absolute",
    top: 80,
    right: 15,
    backgroundColor: "white",
    padding: 6,
    borderRadius: 18,
  },
  centerButton: {
    position: "absolute",
    bottom: 80,
    right: 15,
    backgroundColor: "white",
    padding: 6,
    borderRadius: 18,
  },
});
