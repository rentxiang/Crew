import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { supabase } from "../services/supabase";
import { useRouter } from "expo-router";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 插入或更新用户到数据库
  async function upsertUser(userId: string, email: string) {
    const { error } = await supabase.from("users").upsert({
      id: userId,
      email: email,
      name: email.split("@")[0], // 默认名称为邮箱的前缀
    });

    if (error) {
      console.error("Failed to upsert user:", error.message);
      Alert.alert("Error", "Failed to save user to the database.");
    } else {
      console.log("User successfully added or updated in the database.");
    }
  }

  // 登录
  async function signInWithEmail() {
    setLoading(true);
    const { data: session, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert(error.message);
    } else if (session?.user) {
      // 登录成功后将用户信息插入或更新到数据库
      if (session.user.email) {
        await upsertUser(session.user.id, session.user.email);
      } else {
        console.error("User email is undefined.");
        Alert.alert("Error", "User email is undefined.");
      }
      // 跳转到 friends 页面
      router.replace("/(tabs)/friends");
    }
    setLoading(false);
  }

  // 注册
  async function signUpWithEmail() {
    setLoading(true);
    const {
      data: { user, session },
      error,
    } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert(error.message);
    } else if (user) {
      // 注册成功后将用户信息插入到数据库
      if (user.email) {
        await upsertUser(user.id, user.email);
        console.log(
          "User successfully registered and added to the database.",
          user.id,
          user.email
        );
      } else {
        console.error("User email is undefined.");
        Alert.alert("Error", "User email is undefined.");
      }
      Alert.alert("Success", "Please check your inbox for email verification!");
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.verticallySpaced, styles.mt20]}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          onChangeText={(text) => setEmail(text)}
          value={email}
          placeholder="email@address.com"
          autoCapitalize="none"
          style={styles.input}
        />
      </View>
      <View style={styles.verticallySpaced}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          onChangeText={(text) => setPassword(text)}
          value={password}
          secureTextEntry={true}
          placeholder="Password has to be at least 6 characters"
          autoCapitalize="none"
          style={styles.input}
        />
      </View>
      <View style={[styles.verticallySpaced, styles.mt20]}>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => signInWithEmail()}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Sign in</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.verticallySpaced}>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => signUpWithEmail()}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Sign up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 40,
    padding: 12,
  },
  verticallySpaced: {
    paddingTop: 4,
    paddingBottom: 4,
    alignSelf: "stretch",
  },
  mt20: {
    marginTop: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#86939e",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#86939e",
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#2089dc",
    borderRadius: 4,
    padding: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
