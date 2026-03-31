import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";
import { useRouter } from "expo-router";
import { View, Text, StyleSheet } from "react-native";

export default function Friends() {
  const [user, setUser] = useState<any>(null); // 用户状态
  const [loading, setLoading] = useState(true); // 加载状态
  const router = useRouter();

  useEffect(() => {
    // 监听用户认证状态变化
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN") {
          setUser(session?.user || null);
          setLoading(false);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setLoading(false);
          router.push("/login"); // 重定向到登录页面
        }
      }
    );

    // 获取当前用户信息
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Error fetching user:", error.message);
        setLoading(false);
        router.push("/login"); // 如果出错，重定向到登录页面
        return;
      }

      if (!data?.user) {
        router.push("/login"); // 如果没有用户，重定向到登录页面
      } else {
        setUser(data.user);
      }
      setLoading(false);
    };

    fetchUser();

    // 清理订阅
    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, []);

  // 如果正在加载，显示加载状态
  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // 如果用户未登录，显示提示信息
  if (!user) {
    return (
      <View style={styles.container}>
        <Text>You are not logged in.</Text>
      </View>
    );
  }

  // 如果用户已登录，显示欢迎信息
  return (
    <View style={styles.container}>
      <Text>Welcome, {user.email}!</Text>
      <Text>I am sorry you CAN'T sign out for now.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
