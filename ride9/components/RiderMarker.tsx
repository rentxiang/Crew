import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { MarkerView } from "@rnmapbox/maps";

export default function RiderMarker({ rider }: { rider: any }) {
  return (
    <MarkerView
      id={`rider-${rider.user_id}`}
      coordinate={[rider.longitude, rider.latitude]}
    >
      <View style={styles.container}>
        <View style={styles.avatarWrapper}>
          <View style={[styles.glow, rider.isSelf && styles.glowSelf]} />
          <Image source={{ uri: rider.avatarUrl }} style={[styles.avatar, rider.isSelf && styles.avatarSelf]} />
        </View>
        <View style={styles.label}>
          <Text style={styles.name}>{rider.name}</Text>
          {rider.bike ? (
            <Text style={styles.bike}>{rider.bike}</Text>
          ) : null}
        </View>
      </View>
    </MarkerView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  avatarWrapper: {
    width: 40,
    height: 40,
  },
  glow: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 69, 0, 0.18)",
    top: -8,
    left: -8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#ff4500",
  },
  glowSelf: {
    backgroundColor: "rgba(0, 122, 255, 0.2)",
  },
  avatarSelf: {
    borderColor: "#007aff",
  },
  label: {
    marginTop: 5,
    alignItems: "center",
    backgroundColor: "rgba(8, 8, 8, 0.88)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  name: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  bike: {
    fontSize: 10,
    color: "#888",
    marginTop: 1,
    letterSpacing: 0.2,
  },
});
