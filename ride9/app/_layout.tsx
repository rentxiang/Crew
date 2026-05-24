import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";
import { supabase } from "@/services/supabase";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const [session, setSession] = useState<any>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;

    const inLogin = segments[0] === "login";

    if (!session && !inLogin) {
      router.replace("/login");
    } else if (session && inLogin) {
      router.replace("/(tabs)");
    }
  }, [session, segments]);

  if (session === undefined) return null;

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
