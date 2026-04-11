import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Button,
  FlatList,
  Alert,
  TouchableOpacity,
} from "react-native";

import { getFriends, addFriend, removeFriend } from "../../services/friends";

export default function Friends() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<
    { friend_id: string; friend: { name: string; email: string } }[]
  >([]);
  const [email, setEmail] = useState("");

  const router = useRouter();

  // ========================
  // Auth + 初始加载
  // ========================
  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        router.push("/login");
        return;
      }

      setUser(data.user);
      await fetchFriends(data.user.id);
      setLoading(false);
    };

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          router.push("/login");
        }
      }
    );

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, []);

  // ========================
  // 获取好友列表
  // ========================
  const fetchFriends = async (userId: string) => {
    const data = await getFriends(userId);

    setFriends(
      data.map((item: any) => ({
        friend_id: item.friend_id,
        friend: item.friend,
      }))
    );
  };

  // ========================
  // 添加好友
  // ========================
  const handleAddFriend = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter an email");
      return;
    }

    try {
      await addFriend(user.id, email.trim());

      Alert.alert("Success", "Friend added!");
      setEmail("");
      fetchFriends(user.id);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to add friend");
    }
  };

  // ========================
  // 删除好友
  // ========================
  const handleRemoveFriend = async (friendId: string) => {
    try {
      await removeFriend(user.id, friendId);
      fetchFriends(user.id);
    } catch {
      Alert.alert("Error", "Failed to remove friend");
    }
  };

  // ========================
  // Realtime（自动刷新）
  // ========================
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("friends-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friends",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchFriends(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // ========================
  // Loading
  // ========================
  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // ========================
  // UI
  // ========================
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Friends</Text>
      <Text style={styles.subtitle}>Logged in as: {user.email}</Text>

      {/* 添加好友 */}
      <View style={styles.addContainer}>
        <TextInput
          style={styles.input}
          placeholder="Enter friend's email"
          value={email}
          onChangeText={setEmail}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddFriend}>
          <Text style={styles.buttonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* 好友列表 */}
      <FlatList
        data={friends}
        keyExtractor={(item) => item.friend_id}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 20 }}>
            No friends yet.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.friendItem}>
            <View>
              <Text style={styles.name}>{item.friend.name}</Text>
              <Text style={styles.email}>{item.friend.email}</Text>
            </View>

            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveFriend(item.friend_id)}
            >
              <Text style={styles.buttonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

// ========================
// Styles
// ========================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    top:80,
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 20,
    color: "#666",
  },
  addContainer: {
    flexDirection: "row",
    marginBottom: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 6,
    marginRight: 10,
  },
  addButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: 6,
  },
  removeButton: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  friendItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
  },
  email: {
    color: "#666",
    fontSize: 12,
  },
});
