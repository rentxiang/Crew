import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Alert,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getFriends, addFriend, removeFriend } from "../../services/friends";

export default function Friends() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<
    { friend_id: string; friend: { name: string; email: string } }[]
  >([]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) return;
      setUser(data.user);
      await fetchFriends(data.user.id);
      setLoading(false);
    };

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_OUT") setUser(null);
      }
    );

    return () => subscription?.subscription.unsubscribe();
  }, []);

  const fetchFriends = async (userId: string) => {
    const data = await getFriends(userId);
    setFriends(
      data.map((item: any) => ({
        friend_id: item.friend_id,
        friend: item.friend,
      }))
    );
  };

  const handleAddFriend = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter an email");
      return;
    }
    try {
      await addFriend(user.id, email.trim());
      Alert.alert("Added", "Rider added to your crew!");
      setEmail("");
      fetchFriends(user.id);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to add rider");
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
        () => fetchFriends(user.id)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

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
      <Text style={styles.subtitle}>{user?.email}</Text>

      <View style={styles.addContainer}>
        <TextInput
          style={styles.input}
          placeholder="Add rider by email"
          placeholderTextColor="#444"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddFriend}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>RIDERS · {friends.length}</Text>

      <FlatList
        data={friends}
        keyExtractor={(item) => item.friend_id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No crew yet</Text>
            <Text style={styles.emptySubText}>
              Add riders by their email to see them on the map
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.friendItem}>
            <View style={styles.friendInfo}>
              <View style={styles.friendDot} />
              <View>
                <Text style={styles.name}>{item.friend.name}</Text>
                <Text style={styles.email}>{item.friend.email}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveFriend(item.friend_id)}
            >
              <Ionicons name="close" size={16} color="#444" />
            </TouchableOpacity>
          </View>
        )}
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
  loadingText: {
    color: "#444",
  },
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
    marginBottom: 28,
  },
  input: {
    flex: 1,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 10,
    padding: 14,
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
  sectionLabel: {
    color: "#333",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 12,
  },
  friendItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  friendInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  friendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#222",
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  email: {
    color: "#444",
    fontSize: 12,
    marginTop: 2,
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
