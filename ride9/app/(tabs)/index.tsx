import Mapbox, { Camera, LocationPuck, MapView } from "@rnmapbox/maps";
import { useEffect, useState, useRef } from "react";

import FriendMarker from "../../components/FriendMaker";
import { startLocationTracking } from "../../services/location";
import { updateLocation, getFriendLocations } from "../../services/location";
import { subscribeLocations } from "../../services/realtime";
import { StyleSheet, TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/services/supabase";
import { JwtPayload } from "@supabase/supabase-js";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_KEY || "");

export default function Map() {
  const [friends, setFriends] = useState<
    { user_id: number; [key: string]: any }[]
  >([]);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [authUser, setAuthUser] = useState<any>(null); // 认证用户
  const [user, setUser] = useState<any>(null); // 数据库用户
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>();
  const [claims, setClaims] = useState<JwtPayload | null>(null);
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(
    null
  );
  const cameraRef = useRef<Camera>(null);

  // Fetch claims and listen for auth state changes
  useEffect(() => {
    supabase.auth.getClaims().then(({ data }) => {
      if (data) {
        setClaims(data.claims);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          setAuthUser(session.user);
          fetchDatabaseUser(session.user.id); // Fetch database user
        } else if (event === "SIGNED_OUT") {
          setAuthUser(null);
          setUser(null);
        }
      }
    );

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, []);

  // Fetch database user
  const fetchDatabaseUser = async (userId: string) => {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Failed to fetch user from database:", error.message);
      return;
    }

    setUser(data);
  };

  // Start location tracking and update locations table
  useEffect(() => {
    // if (!authUser || !user) {
    //   console.log("Anonymous user: Skipping location updates.");
    //   return;
    // }

    const loadInitialFriends = async () => {
      const initialFriends = await getFriendLocations(user.id);
      setFriends(initialFriends || []);
    };

    loadInitialFriends();

    let locationSubscription: any | null = null;

    // Start location tracking
    startLocationTracking((coords: any) => {
      console.log("User location:", coords.latitude, coords.longitude);
      coordsRef.current = coords; // 保存最新的 coords
      updateLocation(authUser.id, coords.latitude, coords.longitude).catch(
        (error) => {
          console.error("Failed to update location:", error);
        }
      );
    }).then((subscription) => {
      locationSubscription = subscription; // 保存订阅对象
    });

    // 定期刷新 userLocation
    const interval = setInterval(() => {
      if (coordsRef.current) {
        const { latitude, longitude } = coordsRef.current;
        console.log("Setting user location:", latitude, longitude);
        setUserLocation({ lat: latitude, lng: longitude });
      }
    }, 5000); // 每 5 秒刷新一次

    const sub = subscribeLocations(setFriends);

    return () => {
      if (locationSubscription) {
        locationSubscription.remove(); // 停止位置监听
      }
      if (sub && typeof sub.unsubscribe === "function") {
        sub.unsubscribe(); // 取消订阅
      }
      clearInterval(interval); // 清除定时器
    };
  }, [authUser, user]);

  const mockFriends = [
    {
      id: 1,
      name: "Ben",
      avatarUrl:
        "https://gravatar.com/avatar/d9ae174a12650c280f2afc3ba9bf0b82?s=400&d=robohash&r=x",
      lat: 37.7749,
      lng: -122.4194,
    },
    {
      id: 2,
      name: "Bobby",
      avatarUrl:
        "https://gravatar.com/avatar/d9ae174a12650c280f2afc3ba9bf0b82?s=400&d=robohash&r=x",
      lat: 34.0522,
      lng: -118.2437,
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        styleURL={theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : ""}
      >
        <Camera
          // centerCoordinate={cameraCenter || undefined}
          ref={cameraRef}
          zoomLevel={16}
          animationMode="flyTo"
          animationDuration={1000}
          followUserLocation={false}
        />
        <LocationPuck
          puckBearing="heading"
          puckBearingEnabled
          pulsing={{ isEnabled: true }}
        />

        {mockFriends.map((f) => (
          <FriendMarker
            key={f.id}
            friend={{
              user_id: f.id,
              name: f.name || "Someone",
              avatarUrl:
                f.avatarUrl || "https://example.com/default-avatar.png",
              latitude: f.lat,
              longitude: f.lng,
            }}
          />
        ))}
      </MapView>
      {!authUser && (
        <View style={{ position: "absolute", top: 10, left: 10 }}>
          <Text>You are viewing as a guest.</Text>
        </View>
      )}
      {claims && <Text>logged user: {claims.sub}</Text>}
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
      >
        <Ionicons
          name={theme === "dark" ? "sunny" : "moon"}
          size={24}
          color={theme === "dark" ? "black" : "black"}
        />
      </TouchableOpacity>
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
    zIndex: 1,
    backgroundColor: "white",
    padding: 6,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 5,
  },
  centerButton: {
    position: "absolute",
    bottom: 80,
    right: 15,
    zIndex: 1,
    backgroundColor: "white",
    padding: 6,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 5,
  },
});
