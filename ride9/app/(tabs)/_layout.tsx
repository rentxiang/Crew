import { Tabs } from "expo-router";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { HapticTab } from "@/components/haptic-tab";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: "#0a0a0a",
          borderTopColor: "#1a1a1a",
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: "#ff4500",
        tabBarInactiveTintColor: "#444",
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "MAP",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ride"
        options={{
          title: "RIDE",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="radio-button-on" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "CREW",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
