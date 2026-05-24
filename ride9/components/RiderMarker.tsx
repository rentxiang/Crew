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
        <View style={styles.glow} />
        <Image source={{ uri: rider.avatarUrl }} style={styles.avatar} />
        <Text style={styles.name}>{rider.name}</Text>
      </View>
    </MarkerView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
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
  name: {
    marginTop: 5,
    fontSize: 11,
    color: "#fff",
    backgroundColor: "rgba(8, 8, 8, 0.88)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontWeight: "700",
    letterSpacing: 0.5,
    overflow: "hidden",
  },
});
