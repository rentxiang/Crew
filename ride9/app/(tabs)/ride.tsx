import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../services/supabase";
import { getFriends } from "../../services/friends";
import { getFriendLocations } from "../../services/location";

const ACTIVE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export default function RideScreen() {
  const [riding, setRiding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [friends, setFriends] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [authUser, setAuthUser] = useState<any>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setAuthUser(data.user);
        loadData(data.user.id);
      }
    });
  }, []);

  useEffect(() => {
    if (!authUser) return;
    const interval = setInterval(() => loadData(authUser.id), 30_000);
    return () => clearInterval(interval);
  }, [authUser]);

  const loadData = async (userId: string) => {
    const [friendData, locationData] = await Promise.all([
      getFriends(userId),
      getFriendLocations(userId),
    ]);
    setFriends(
      friendData.map((item: any) => ({
        user_id: item.friend_id,
        name: item.friend.name,
      }))
    );
    setLocations(locationData || []);
  };

  const startRide = () => {
    setRiding(true);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  const endRide = () => {
    Alert.alert("End Ride", "Are you sure you want to end the ride?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Ride",
        style: "destructive",
        onPress: () => {
          if (timerRef.current) clearInterval(timerRef.current);
          setRiding(false);
          setElapsed(0);
        },
      },
    ]);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  };

  const activeFriends = friends.filter((f) => {
    const loc = locations.find((l) => l.user_id === f.user_id);
    if (!loc?.updated_at) return false;
    return Date.now() - new Date(loc.updated_at).getTime() < ACTIVE_THRESHOLD_MS;
  });

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GROUP RIDE</Text>
        <TouchableOpacity onPress={signOut} style={styles.signOutButton}>
          <Ionicons name="log-out-outline" size={20} color="#444" />
        </TouchableOpacity>
      </View>

      {/* Timer card */}
      <View style={styles.timerCard}>
        {riding ? (
          <>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveLabel}>LIVE</Text>
            </View>
            <Text style={styles.timer}>{formatTime(elapsed)}</Text>
            <Text style={styles.timerSub}>ride in progress</Text>
          </>
        ) : (
          <>
            <Text style={styles.timerIdle}>◎</Text>
            <Text style={styles.timerIdleLabel}>READY TO RIDE</Text>
          </>
        )}
      </View>

      {/* Start / End button */}
      <TouchableOpacity
        style={[styles.rideButton, riding && styles.rideButtonEnd]}
        onPress={riding ? endRide : startRide}
        activeOpacity={0.8}
      >
        <Ionicons
          name={riding ? "stop-circle" : "radio-button-on"}
          size={22}
          color={riding ? "#ff4500" : "#fff"}
        />
        <Text style={[styles.rideButtonText, riding && styles.rideButtonTextEnd]}>
          {riding ? "END RIDE" : "START RIDE"}
        </Text>
      </TouchableOpacity>

      {/* Active riders */}
      <Text style={styles.sectionLabel}>
        CREW ONLINE · {activeFriends.length}
      </Text>

      <FlatList
        data={activeFriends}
        keyExtractor={(item) => item.user_id}
        scrollEnabled={false}
        contentContainerStyle={styles.riderList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No crew online right now</Text>
            <Text style={styles.emptySubText}>
              Friends appear here when they're actively sharing location
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const loc = locations.find((l) => l.user_id === item.user_id);
          const minutesAgo = loc?.updated_at
            ? Math.floor(
                (Date.now() - new Date(loc.updated_at).getTime()) / 60_000
              )
            : null;

          return (
            <View style={styles.riderRow}>
              <View style={styles.riderLeft}>
                <View style={styles.riderDot} />
                <View>
                  <Text style={styles.riderName}>{item.name}</Text>
                  {minutesAgo !== null && (
                    <Text style={styles.riderMeta}>
                      {minutesAgo === 0 ? "Just now" : `${minutesAgo}m ago`}
                    </Text>
                  )}
                </View>
              </View>
              <Ionicons name="location" size={14} color="#ff4500" />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080808",
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 6,
  },
  signOutButton: {
    padding: 4,
  },
  timerCard: {
    backgroundColor: "#0f0f0f",
    borderRadius: 20,
    padding: 36,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#191919",
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff4500",
  },
  liveLabel: {
    color: "#ff4500",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 4,
  },
  timer: {
    color: "#fff",
    fontSize: 52,
    fontWeight: "200",
    letterSpacing: 4,
  },
  timerSub: {
    color: "#333",
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 8,
    textTransform: "uppercase",
  },
  timerIdle: {
    color: "#222",
    fontSize: 48,
    marginBottom: 12,
  },
  timerIdleLabel: {
    color: "#333",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 4,
  },
  rideButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff4500",
    borderRadius: 14,
    padding: 18,
    gap: 10,
    marginBottom: 32,
  },
  rideButtonEnd: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#ff4500",
  },
  rideButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 3,
  },
  rideButtonTextEnd: {
    color: "#ff4500",
  },
  sectionLabel: {
    color: "#333",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 12,
  },
  riderList: {
    gap: 0,
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  riderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  riderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#00ff88",
  },
  riderName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  riderMeta: {
    color: "#444",
    fontSize: 12,
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    color: "#333",
    fontSize: 14,
    fontWeight: "600",
  },
  emptySubText: {
    color: "#222",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
