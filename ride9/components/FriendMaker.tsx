import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { MarkerView } from "@rnmapbox/maps";

export default function FriendMarker({ friend }: { friend: any }) {
  return (
    <MarkerView
      id={`friend-${friend.user_id}`}
      coordinate={[friend.longitude, friend.latitude]}
    >
      <View style={styles.markerContainer}>
        <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} />
        <Text style={styles.name}>{friend.name}</Text>
      </View>
    </MarkerView>
  );
}

const styles = StyleSheet.create({
  markerContainer: {
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "white",
  },
  name: {
    marginTop: 4,
    fontSize: 12,
    color: "white",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
