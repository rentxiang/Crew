import { useEffect, useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "../../services/supabase";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Alert,
  TouchableOpacity,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getFriends,
  addFriend,
  removeFriend,
  getPendingRequests,
  getSentRequests,
  acceptRequest,
  rejectRequest,
} from "../../services/friends";
import { getProfile, avatarUrl } from "../../services/profile";
import { useLocationSharing } from "../../contexts/LocationSharingContext";

type Friend = {
  friend_id: string;
  friend: {
    name: string;
    username: string | null;
    bike: string | null;
    email: string;
    avatar_seed: string | null;
  };
};

type PendingRequest = {
  id: string;
  user_id: string;
  requester: {
    id: string;
    name: string;
    username: string | null;
    bike: string | null;
    avatar_seed: string | null;
  };
};

type SentRequest = {
  id: string;
  friend_id: string;
  receiver: {
    id: string;
    name: string;
    username: string | null;
    bike: string | null;
    avatar_seed: string | null;
  };
};

function isLive(loc: any): boolean {
  return !!loc?.is_sharing;
}

function lastSeenText(loc: any): string | null {
  if (!loc?.is_sharing || !loc?.updated_at) return null;
  const diffMin = Math.floor((Date.now() - new Date(loc.updated_at).getTime()) / 60000);
  if (diffMin < 1) return "Live now";
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;
  return `Last seen ${Math.floor(diffMin / 60)}h ago`;
}

function Avatar({
  seed,
  fallback,
  size = 36,
}: {
  seed: string | null;
  fallback: string;
  size?: number;
}) {
  return (
    <Image
      source={{ uri: avatarUrl(seed, fallback) }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#1a1a1a",
      }}
    />
  );
}

export default function Friends() {
  const router = useRouter();
  const { setFocusCoords } = useLocationSharing();

  const [user, setUser] = useState<any>(null);
  const [selfUsername, setSelfUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [sent, setSent] = useState<SentRequest[]>([]);
  const [locations, setLocations] = useState<Record<string, any>>({});
  const [tag, setTag] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) return;
      setUser(data.user);
      await Promise.all([
        fetchFriends(data.user.id),
        fetchRequests(data.user.id),
        fetchSent(data.user.id),
      ]);
      const profile = await getProfile(data.user.id);
      setSelfUsername(profile?.username ?? null);
      setLoading(false);
    };

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setUser(null);
    });

    return () => subscription?.subscription.unsubscribe();
  }, []);

  const fetchFriends = async (userId: string) => {
    const data = await getFriends(userId);
    const mapped = data.map((item: any) => ({
      friend_id: item.friend_id,
      friend: item.friend,
    }));
    setFriends(mapped);
    fetchLocations(mapped.map((f: Friend) => f.friend_id));
  };

  const fetchRequests = async (userId: string) => {
    const data = await getPendingRequests(userId);
    setRequests(
      data.map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        requester: item.requester,
      }))
    );
  };

  const fetchSent = async (userId: string) => {
    const data = await getSentRequests(userId);
    setSent(
      data.map((item: any) => ({
        id: item.id,
        friend_id: item.friend_id,
        receiver: item.receiver,
      }))
    );
  };

  const fetchLocations = async (friendIds: string[]) => {
    if (friendIds.length === 0) {
      setLocations({});
      return;
    }
    const { data } = await supabase
      .from("locations")
      .select("user_id, lat, lng, is_sharing, updated_at")
      .in("user_id", friendIds);
    const map: Record<string, any> = {};
    data?.forEach((loc: any) => {
      map[loc.user_id] = loc;
    });
    setLocations(map);
  };

  // Realtime location updates
  useEffect(() => {
    if (!user || friends.length === 0) return;
    const friendIds = friends.map((f) => f.friend_id);
    const channel = supabase
      .channel("friends-page-locations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "locations" },
        (payload) => {
          const updated = payload.new as any;
          if (!friendIds.includes(updated.user_id)) return;
          setLocations((prev) => ({ ...prev, [updated.user_id]: updated }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [friends, user]);

  // Realtime friend changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("friends-requests-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friends",
          filter: `friend_id=eq.${user.id}`,
        },
        () => {
          fetchRequests(user.id);
          fetchFriends(user.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friends",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchSent(user.id);
          fetchFriends(user.id);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchFriends(user.id);
      fetchRequests(user.id);
      fetchSent(user.id);
    }, [user])
  );

  useEffect(() => {
    if (!user || friends.length === 0) return;
    const ids = new Set(friends.map((f) => f.friend_id));
    const channel = supabase
      .channel("friends-page-user-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users" },
        (payload) => {
          if (ids.has((payload.new as any).id)) fetchFriends(user.id);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, friends]);

  const handleAddFriend = async () => {
    const cleanTag = tag.replace(/^@/, "").trim();
    if (!cleanTag) {
      Alert.alert("Enter a rider tag", "Type their @tag to add them.");
      return;
    }
    try {
      const result = await addFriend(user.id, cleanTag);
      setTag("");
      if ((result as any)?.autoAccepted) {
        Alert.alert("Crew up!", `@${cleanTag} is now in your crew.`);
      } else {
        Alert.alert("Request sent!", `Waiting for @${cleanTag} to accept.`);
      }
      fetchFriends(user.id);
      fetchRequests(user.id);
      fetchSent(user.id);
    } catch (e: any) {
      Alert.alert("Couldn't add rider", e.message);
    }
  };

  const handleAccept = async (req: PendingRequest) => {
    try {
      await acceptRequest(req.id, req.user_id, user.id);
      fetchFriends(user.id);
      fetchRequests(user.id);
    } catch {
      Alert.alert("Error", "Failed to accept request");
    }
  };

  const handleReject = async (req: PendingRequest) => {
    try {
      await rejectRequest(req.id);
      fetchRequests(user.id);
    } catch {
      Alert.alert("Error", "Failed to decline request");
    }
  };

  const handleCancelSent = async (requestId: string) => {
    try {
      await rejectRequest(requestId);
      fetchSent(user.id);
    } catch {
      Alert.alert("Error", "Failed to cancel request");
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    Alert.alert("Remove Rider", "Remove this rider from your crew?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await removeFriend(user.id, friendId);
            fetchFriends(user.id);
          } catch {
            Alert.alert("Error", "Failed to remove rider");
          }
        },
      },
    ]);
  };

  const handleLocateFriend = (friendId: string) => {
    const loc = locations[friendId];
    if (!loc?.lat || !loc?.lng || !isLive(loc)) return;
    router.navigate("/");
    setTimeout(() => {
      setFocusCoords({ latitude: loc.lat, longitude: loc.lng });
    }, 350);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CREW</Text>
      <Text style={styles.subtitle}>
        {selfUsername ? `@${selfUsername}` : user?.email}
      </Text>

      <View style={styles.addContainer}>
        <View style={styles.inputWrapper}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={styles.input}
            placeholder="rider tag"
            placeholderTextColor="#333"
            value={tag}
            onChangeText={(t) => setTag(t.replace(/^@/, "").toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddFriend}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Incoming requests */}
      {requests.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>REQUESTS · {requests.length}</Text>
          {requests.map((req) => (
            <View key={req.id} style={styles.requestItem}>
              <Avatar
                seed={req.requester.avatar_seed}
                fallback={req.requester.username ?? req.requester.name}
              />
              <View style={styles.rowInfo}>
                <Text style={styles.name}>{req.requester.name}</Text>
                {req.requester.username ? (
                  <Text style={styles.handle}>@{req.requester.username}</Text>
                ) : null}
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => handleAccept(req)}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => handleReject(req)}
                >
                  <Ionicons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Sent / pending */}
      {sent.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>PENDING · {sent.length}</Text>
          {sent.map((s) => (
            <View key={s.id} style={styles.requestItem}>
              <Avatar
                seed={s.receiver.avatar_seed}
                fallback={s.receiver.username ?? s.receiver.name}
              />
              <View style={styles.rowInfo}>
                <Text style={styles.name}>{s.receiver.name}</Text>
                {s.receiver.username ? (
                  <Text style={styles.handle}>@{s.receiver.username}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.rejectButton}
                onPress={() => handleCancelSent(s.id)}
              >
                <Ionicons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>RIDERS · {friends.length}</Text>

      <FlatList
        data={friends}
        keyExtractor={(item) => item.friend_id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No crew yet</Text>
            <Text style={styles.emptySubText}>
              Add riders by their @tag — they can find theirs in the ME tab
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const live = isLive(locations[item.friend_id]);
          const hasLocation = !!locations[item.friend_id]?.lat;
          const seen = lastSeenText(locations[item.friend_id]);
          return (
            <View style={styles.friendItem}>
              <TouchableOpacity
                style={styles.friendInfo}
                onPress={() => handleLocateFriend(item.friend_id)}
                activeOpacity={hasLocation ? 0.6 : 1}
              >
                <View style={styles.avatarWrapper}>
                  <Avatar
                    seed={item.friend.avatar_seed}
                    fallback={item.friend.username ?? item.friend.name}
                  />
                  <View
                    style={[styles.liveDot, live && styles.liveDotActive]}
                  />
                </View>
                <View>
                  <Text style={styles.name}>{item.friend.name}</Text>
                  {item.friend.username ? (
                    <Text style={styles.handle}>@{item.friend.username}</Text>
                  ) : null}
                  {item.friend.bike ? (
                    <Text style={styles.bike}>{item.friend.bike}</Text>
                  ) : null}
                  {seen ? (
                    <Text style={[styles.lastSeen, seen === "Live now" && styles.lastSeenLive]}>
                      {seen}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveFriend(item.friend_id)}
              >
                <Ionicons name="close" size={16} color="#444" />
              </TouchableOpacity>
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
    paddingTop: 60,
    paddingHorizontal: 20,
    backgroundColor: "#080808",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#080808",
  },
  loadingText: { color: "#444" },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 6,
    marginBottom: 4,
  },
  subtitle: {
    color: "#444",
    fontSize: 12,
    marginBottom: 28,
  },
  addContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  atSign: {
    color: "#ff4500",
    fontSize: 16,
    fontWeight: "700",
    marginRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: "#fff",
  },
  addButton: {
    backgroundColor: "#ff4500",
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
  },
  card: {
    overflow: "hidden",
    marginBottom: 20,
  },
  sectionLabel: {
    color: "#333",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  requestItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  rowInfo: {
    flex: 1,
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  acceptButton: {
    backgroundColor: "#ff4500",
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  rejectButton: {
    backgroundColor: "#1e1e1e",
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  friendItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  friendInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatarWrapper: {
    position: "relative",
  },
  liveDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#222",
    borderWidth: 2,
    borderColor: "#080808",
  },
  liveDotActive: {
    backgroundColor: "#ff4500",
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  handle: {
    color: "#444",
    fontSize: 12,
    marginTop: 2,
  },
  bike: {
    color: "#2a2a2a",
    fontSize: 11,
    marginTop: 2,
  },
  lastSeen: {
    color: "#555",
    fontSize: 11,
    marginTop: 3,
  },
  lastSeenLive: {
    color: "#ff4500",
    fontWeight: "700",
  },
  removeButton: {
    padding: 8,
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
