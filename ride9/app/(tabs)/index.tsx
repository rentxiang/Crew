import Mapbox, { Camera, LocationPuck, MapView, ShapeSource, LineLayer, MarkerView, StyleImport } from "@rnmapbox/maps";
import { useEffect, useState, useRef, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { Animated, StyleSheet, TouchableOpacity, View, Text, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/services/supabase";
import RiderMarker from "../../components/RiderMarker";
import { getFriendLocations } from "../../services/location";
import { getFriends } from "../../services/friends";
import { getRoomMemberLocations, getRoomMembers } from "../../services/rooms";
import { useLocationSharing } from "../../contexts/LocationSharingContext";
import { avatarUrl, getProfile } from "../../services/profile";
import { getVoiceMessages, getVoiceSignedUrl, deleteOwnVoiceMessage, VoiceMessage } from "../../services/voice";
import { getRoute, subscribeRoute, RoomRoute, Waypoint } from "../../services/routes";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import VoicePTTButton from "../../components/VoicePTTButton";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_KEY || "");

type ToastConfig = { message: string; sub: string; color: string };

export default function MapScreen() {
  const [friends, setFriends] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [roomMembers, setRoomMembers] = useState<any[]>([]);
  const [roomLocations, setRoomLocations] = useState<any[]>([]);
  const [authUser, setAuthUser] = useState<any>(null);
  const [selfProfile, setSelfProfile] = useState<any>(null);
  const [selfCoords, setSelfCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(15);
  const [centered, setCentered] = useState(false);
  const [toastConfig, setToastConfig] = useState<ToastConfig>({
    message: "",
    sub: "",
    color: "#00c46a",
  });

  const { coordsRef, isSharing, isTransitioning, startSharing, stopSharing, currentRoom, focusCoords, setFocusCoords, showRoute } =
    useLocationSharing();
  const [followMode, setFollowMode] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [voiceMessages, setVoiceMessages] = useState<Record<string, VoiceMessage>>({});
  const [playingUserId, setPlayingUserId] = useState<string | null>(null);
  const [playedVoices, setPlayedVoices] = useState<Set<string>>(new Set());
  const [roomRoute, setRoomRoute] = useState<RoomRoute | null>(null);
  const [mapTheme, setMapTheme] = useState<"dark" | "day">("dark");
  const voicePlayerRef = useRef<any>(null);
  const cameraRef = useRef<Camera>(null);
  const prevFriendIdsRef = useRef<string>("");
  const selectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMapInteractionRef = useRef<number>(0);

  // Toast animation (slides down from above)
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastY = useRef(new Animated.Value(-40)).current;
  const toastScale = useRef(new Animated.Value(0.92)).current;

  // Share button pulse
  const buttonScale = useRef(new Animated.Value(1)).current;


  const showToast = (config: ToastConfig) => {
    setToastConfig(config);
    toastOpacity.setValue(0);
    toastY.setValue(-40);
    toastScale.setValue(0.92);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(toastY, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(toastScale, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]),
      Animated.delay(2000),
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.timing(toastY, { toValue: -40, duration: 380, useNativeDriver: true }),
        Animated.timing(toastScale, { toValue: 0.94, duration: 380, useNativeDriver: true }),
      ]),
    ]).start();
  };

  const pulseButton = () => {
    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 1.3, duration: 140, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const toastStyle = {
    opacity: toastOpacity,
    transform: [{ translateY: toastY }, { scale: toastScale }],
  };

  const buttonAnimStyle = {
    transform: [{ scale: buttonScale }],
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setAuthUser(data.user);
        loadFriends(data.user.id);
        getProfile(data.user.id).then(setSelfProfile);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setAuthUser(session.user);
        loadFriends(session.user.id);
        getProfile(session.user.id).then(setSelfProfile);
      }
      if (event === "SIGNED_OUT") {
        setAuthUser(null);
        setFriends([]);
        setLocations([]);
      }
    });

    return () => sub?.subscription.unsubscribe();
  }, []);

  // Keep the screen awake only while sharing location (actively riding)
  useEffect(() => {
    if (isSharing) {
      activateKeepAwakeAsync("crew-map");
      return () => { deactivateKeepAwake("crew-map"); };
    }
  }, [isSharing]);

  // Refresh profiles + route every time the map tab comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!authUser) return;
      getProfile(authUser.id).then((p) => { if (p) setSelfProfile(p); });
      loadFriends(authUser.id);
      if (currentRoom) getRoute(currentRoom.id).then(setRoomRoute).catch(() => {});
    }, [authUser, currentRoom?.id])
  );

  // Refetch locations only when the set of friend IDs changes (not on profile-only refreshes)
  useEffect(() => {
    if (!authUser) return;
    const ids = friends.map((f) => f.user_id).sort().join(",");
    if (ids === prevFriendIdsRef.current) return;
    prevFriendIdsRef.current = ids;
    if (friends.length === 0) { setLocations([]); return; }
    getFriendLocations(authUser.id).then((data) => setLocations(data || []));
  }, [friends]);

  const loadFriends = async (userId: string) => {
    const data = await getFriends(userId);
    setFriends(
      data.map((item: any) => ({
        user_id: item.friend_id,
        name: item.friend.name,
        email: item.friend.email,
        bike: item.friend.bike ?? null,
        avatarUrl: avatarUrl(item.friend.avatar_seed, item.friend.email),
      }))
    );
  };

  // Jump to user's location on first map load
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        cameraRef.current?.setCamera({
          centerCoordinate: [loc.coords.longitude, loc.coords.latitude],
          zoomLevel: 15,
          animationDuration: 0,
        });
      } catch {}
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Auto-center camera when sharing starts and first fix arrives
  useEffect(() => {
    if (!isSharing) { setCentered(false); return; }
    if (centered) return;

    const interval = setInterval(() => {
      if (coordsRef.current && cameraRef.current) {
        cameraRef.current.flyTo(
          [coordsRef.current.longitude, coordsRef.current.latitude],
          800
        );
        setCentered(true);
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isSharing]);

  // Follow mode: recenter on user, but wait 3s after last map interaction
  useEffect(() => {
    if (!followMode) return;
    const interval = setInterval(() => {
      const idle = Date.now() - lastMapInteractionRef.current >= 2000;
      if (idle && coordsRef.current && cameraRef.current) {
        cameraRef.current.setCamera({
          centerCoordinate: [coordsRef.current.longitude, coordsRef.current.latitude],
          zoomLevel: 17,
          animationDuration: 800,
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [followMode]);

  // Track own coords for self marker
  useEffect(() => {
    if (!isSharing) {
      setSelfCoords(null);
      return;
    }
    if (coordsRef.current) {
      setSelfCoords({ latitude: coordsRef.current.latitude, longitude: coordsRef.current.longitude });
    }
    const interval = setInterval(() => {
      if (coordsRef.current) {
        setSelfCoords({ latitude: coordsRef.current.latitude, longitude: coordsRef.current.longitude });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isSharing]);

  // Reload friends when the friends table changes (e.g. new friend added from Crew tab)
  useEffect(() => {
    if (!authUser) return;
    const channel = supabase
      .channel("map-friends-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friends", filter: `user_id=eq.${authUser.id}` },
        () => loadFriends(authUser.id)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser]);

  // Update selfProfile immediately when own profile changes
  useEffect(() => {
    if (!authUser) return;
    const channel = supabase
      .channel("self-profile-live")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${authUser.id}` },
        (payload) => setSelfProfile(payload.new as any)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser]);

  // Reload friend markers when any friend's profile changes
  useEffect(() => {
    if (!authUser || friends.length === 0) return;
    const ids = new Set(friends.map((f) => f.user_id));
    const channel = supabase
      .channel("friend-profiles-live")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "users" },
        (payload) => { if (ids.has((payload.new as any).id)) loadFriends(authUser.id); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser, friends]);

  // Single persistent location subscription — subscribe once, filter in callback
  useEffect(() => {
    if (!authUser) return;
    const channel = supabase
      .channel("locations-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "locations" },
        (payload) => {
          const updated = payload.new as any;
          setLocations((prev: any[]) => [
            ...prev.filter((l) => l.user_id !== updated.user_id),
            updated,
          ]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser]);

  // Room member locations
  useEffect(() => {
    if (!currentRoom) {
      setRoomMembers([]);
      setRoomLocations([]);
      return;
    }

    const load = async () => {
      const [members, locs] = await Promise.all([
        getRoomMembers(currentRoom.id),
        getRoomMemberLocations(currentRoom.id),
      ]);
      setRoomMembers(
        members.map((m) => ({
          ...m,
          avatarUrl: avatarUrl(m.avatar_seed, m.email),
        }))
      );
      setRoomLocations(locs);
    };

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [currentRoom?.id]);

  // Load + subscribe to the room's shared route
  useEffect(() => {
    if (!currentRoom) { setRoomRoute(null); return; }
    const roomId = currentRoom.id;
    const load = async () => {
      try {
        setRoomRoute(await getRoute(roomId)); // null = genuinely cleared
      } catch {
        /* transient error — keep current route */
      }
    };
    load();
    const channel = subscribeRoute(roomId, (payload: any) => {
      if (payload?.eventType === "DELETE") setRoomRoute(null);
      else load();
    });
    return () => { channel.unsubscribe(); };
  }, [currentRoom?.id]);

  // Re-fetch the route when it's toggled back on (recovers from any stale state)
  useEffect(() => {
    if (showRoute && currentRoom) getRoute(currentRoom.id).then(setRoomRoute).catch(() => {});
  }, [showRoute]);

  const openInMaps = (w: Waypoint) => {
    Alert.alert(w.label, "Open directions in:", [
      {
        text: "Apple Maps",
        onPress: () => Linking.openURL(`http://maps.apple.com/?daddr=${w.lat},${w.lng}`),
      },
      {
        text: "Google Maps",
        onPress: () =>
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}`),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // Fetch voice messages for friends + room members
  useEffect(() => {
    if (!authUser) return;
    const ids = [...new Set([
      authUser.id,
      ...friends.map((f) => f.user_id),
      ...roomMembers.map((m: any) => m.user_id),
    ])];
    getVoiceMessages(ids).then(setVoiceMessages);
  }, [friends, roomMembers, authUser]);

  // Realtime voice message updates
  useEffect(() => {
    if (!authUser) return;
    const channel = supabase
      .channel("voice-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_messages" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as any;
            setVoiceMessages((prev) => {
              const next = { ...prev };
              delete next[old.user_id];
              return next;
            });
          } else {
            const m = payload.new as any;
            setVoiceMessages((prev) => ({ ...prev, [m.user_id]: m }));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser]);

  // Release audio player on unmount
  useEffect(() => {
    return () => { voicePlayerRef.current?.remove?.(); };
  }, []);

  // Load locally-stored "read" voice keys
  useEffect(() => {
    AsyncStorage.getItem("@crew/played_voices").then((raw) => {
      if (raw) setPlayedVoices(new Set(JSON.parse(raw)));
    });
  }, []);

  const markVoicePlayed = (userId: string, createdAt: string) => {
    const key = `${userId}:${createdAt}`;
    setPlayedVoices((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      AsyncStorage.setItem("@crew/played_voices", JSON.stringify([...next]));
      return next;
    });
  };

  const playVoice = async (voiceUserId: string, selectionKey: string) => {
    const msg = voiceMessages[voiceUserId];
    if (!msg) return;
    if (voiceUserId !== authUser?.id) markVoicePlayed(voiceUserId, msg.created_at);
    // Keep the bubble open for the whole clip instead of the 4s auto-dismiss
    if (selectedTimerRef.current) clearTimeout(selectedTimerRef.current);
    setSelectedRiderId(selectionKey);
    try {
      voicePlayerRef.current?.remove?.();
      voicePlayerRef.current = null;
      const url = await getVoiceSignedUrl(msg.audio_path);
      if (!url) return;
      await setAudioModeAsync({ playsInSilentMode: true });
      const player = createAudioPlayer({ uri: url });
      voicePlayerRef.current = player;
      setPlayingUserId(voiceUserId);
      player.addListener("playbackStatusUpdate", (status: any) => {
        if (status?.didJustFinish) {
          setPlayingUserId(null);
          player.remove();
          if (voicePlayerRef.current === player) voicePlayerRef.current = null;
          // collapse the bubble shortly after the clip ends
          if (selectedTimerRef.current) clearTimeout(selectedTimerRef.current);
          selectedTimerRef.current = setTimeout(() => setSelectedRiderId(null), 1500);
        }
      });
      player.play();
    } catch {
      setPlayingUserId(null);
    }
  };

  const deleteSelfVoice = async () => {
    if (!authUser) return;
    await deleteOwnVoiceMessage(authUser.id);
    setVoiceMessages((prev) => {
      const next = { ...prev };
      delete next[authUser.id];
      return next;
    });
    setSelectedRiderId(null);
  };

  // Fly to a friend tapped from the crew tab
  useEffect(() => {
    if (!focusCoords || !cameraRef.current) return;
    setFollowMode(false);
    cameraRef.current.setCamera({
      centerCoordinate: [focusCoords.longitude, focusCoords.latitude],
      zoomLevel: 13,
      animationDuration: 800,
    });
    setFocusCoords(null);
  }, [focusCoords]);


  // Merge friends + room members, deduplicated, exclude self
  const selfId = authUser?.id;

  const roomMemberIds = new Set(
    currentRoom ? roomMembers.map((m: any) => m.user_id) : []
  );

  const allRiders = Object.values(
    [...friends, ...roomMembers]
      .filter((r) => r.user_id !== selfId)
      .reduce<Record<string, any>>((acc, r) => {
        acc[r.user_id] = r;
        return acc;
      }, {})
  ).map((r) => {
    const friendLoc = locations.find((l) => l.user_id === r.user_id);
    const roomLoc = roomLocations.find((l) => l.user_id === r.user_id);
    const loc = friendLoc ?? roomLoc;
    return {
      ...r,
      latitude: loc?.lat,
      longitude: loc?.lng,
      is_sharing: loc?.is_sharing ?? false,
      updated_at: loc?.updated_at,
      voice: voiceMessages[r.user_id] ?? null,
      inRoom: roomMemberIds.has(r.user_id),
    };
  }).filter((r) => r.is_sharing && r.latitude && r.longitude);

  const activeCount = allRiders.length;

  const centerOnUser = async () => {
    if (!cameraRef.current) return;

    if (coordsRef.current) {
      cameraRef.current.flyTo(
        [coordsRef.current.longitude, coordsRef.current.latitude],
        600
      );
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      cameraRef.current.flyTo([loc.coords.longitude, loc.coords.latitude], 600);
    } catch (e) {
      console.error("Could not get location:", e);
    }
  };

  const toggleSharing = async () => {
    pulseButton();
    if (isSharing) {
      await stopSharing();
      showToast({
        message: "Location sharing off",
        sub: "Your crew can no longer see you",
        color: "#555",
      });
    } else if (authUser) {
      await startSharing(authUser.id);
      showToast({
        message: "Sharing your location",
        sub: "Your crew can now see where you are",
        color: "#00c46a",
      });
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        styleURL={mapTheme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/standard"}
        onCameraChanged={(e) => setZoomLevel(e.properties.zoom)}
        onTouchStart={() => { lastMapInteractionRef.current = Date.now(); }}
        onPress={() => {
          if (selectedTimerRef.current) clearTimeout(selectedTimerRef.current);
          setSelectedRiderId(null);
        }}
      >
        {mapTheme === "day" && (
          <StyleImport id="basemap" existing config={{ lightPreset: "day" }} />
        )}
        <Camera
          ref={cameraRef}
          zoomLevel={15}
          animationMode="flyTo"
        />
        {(!isSharing || !selfCoords) && (
          <LocationPuck
            puckBearing="heading"
            puckBearingEnabled
            pulsing={{ isEnabled: true }}
          />
        )}
        {showRoute && roomRoute?.geometry?.coordinates && roomRoute.geometry.coordinates.length > 1 && (
          <ShapeSource
            key={`sharedRoute-${mapTheme}`}
            id="sharedRoute"
            shape={{
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: roomRoute.geometry.coordinates },
            }}
          >
            <LineLayer
              id="sharedRouteLine"
              style={{ lineColor: "#ff4500", lineWidth: 4, lineCap: "round", lineJoin: "round", lineOpacity: 0.85 }}
            />
          </ShapeSource>
        )}
        {showRoute && roomRoute?.waypoints?.map((w, i) => {
          const total = roomRoute.waypoints.length;
          const isStart = i === 0 && total > 1;
          const isEnd = i === total - 1;
          return (
            <MarkerView key={`wp-${i}-${mapTheme}`} id={`wp-${i}`} coordinate={[w.lng, w.lat]} allowOverlap>
              <TouchableOpacity
                style={[styles.routePin, isStart && styles.routePinStart]}
                onPress={() => openInMaps(w)}
                activeOpacity={0.8}
              >
                {isStart || isEnd ? (
                  <Ionicons name={isStart ? "navigate" : "flag"} size={13} color="#fff" />
                ) : (
                  <Text style={styles.routePinText}>{i}</Text>
                )}
              </TouchableOpacity>
            </MarkerView>
          );
        })}
        {allRiders.map((r) => (
          <RiderMarker
            key={`${r.user_id}-${mapTheme}`}
            rider={r}
            showLabel={zoomLevel >= 13}
            selected={selectedRiderId === r.user_id}
            voicePlaying={playingUserId === r.user_id}
            voiceRead={!!r.voice && playedVoices.has(`${r.user_id}:${r.voice.created_at}`)}
            onPlayVoice={() => playVoice(r.user_id, r.user_id)}
            onPress={() => {
              if (selectedTimerRef.current) clearTimeout(selectedTimerRef.current);
              setSelectedRiderId(r.user_id);
              setFollowMode(false);
              cameraRef.current?.setCamera({
                centerCoordinate: [r.longitude, r.latitude],
                zoomLevel: 13,
                animationDuration: 600,
              });
              selectedTimerRef.current = setTimeout(() => setSelectedRiderId(null), 4000);
            }}
          />
        ))}
        {isSharing && selfCoords && selfProfile && (
          <RiderMarker
            key={`self-${mapTheme}`}
            rider={{
              user_id: `self-${authUser?.id}`,
              name: selfProfile.name ?? "Me",
              bike: selfProfile.bike ?? null,
              avatarUrl: avatarUrl(selfProfile.avatar_seed, selfProfile.email),
              latitude: selfCoords.latitude,
              longitude: selfCoords.longitude,
              isSelf: true,
              voice: voiceMessages[authUser?.id] ?? null,
            }}
            showLabel={zoomLevel >= 13}
            selected={selectedRiderId === `self-${authUser?.id}`}
            voicePlaying={playingUserId === authUser?.id}
            onPlayVoice={() => playVoice(authUser!.id, `self-${authUser?.id}`)}
            onDeleteVoice={deleteSelfVoice}
            onPress={() => {
              if (selectedTimerRef.current) clearTimeout(selectedTimerRef.current);
              setSelectedRiderId(`self-${authUser?.id}`);
              selectedTimerRef.current = setTimeout(() => setSelectedRiderId(null), 4000);
            }}
          />
        )}
      </MapView>

      {/* Map theme toggle (top-right) */}
      <TouchableOpacity
        style={styles.themeButton}
        onPress={() => setMapTheme((t) => (t === "dark" ? "day" : "dark"))}
        activeOpacity={0.8}
      >
        <Ionicons name={mapTheme === "dark" ? "sunny" : "moon"} size={17} color="#fff" />
      </TouchableOpacity>

      {/* HUD */}
      {activeCount > 0 && (
        <View style={styles.hud} pointerEvents="none">
          <View style={styles.hudBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.hudText}>
              {activeCount} RIDER{activeCount > 1 ? "S" : ""} LIVE
            </Text>
          </View>
        </View>
      )}

      {/* Toast notification */}
      <Animated.View style={[styles.toast, toastStyle]} pointerEvents="none">
        <View style={[styles.toastDot, { backgroundColor: toastConfig.color }]} />
        <View>
          <Text style={styles.toastMessage}>{toastConfig.message}</Text>
          <Text style={styles.toastSub}>{toastConfig.sub}</Text>
        </View>
      </Animated.View>

      {/* Push-to-talk voice button */}
      {isSharing && selfProfile && authUser && (
        <VoicePTTButton
          userId={authUser.id}
          avatarUri={avatarUrl(selfProfile.avatar_seed, selfProfile.email)}
        />
      )}

      {/* Bottom-right controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.iconButton} onPress={centerOnUser}>
          <Ionicons name="locate" size={20} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, followMode && styles.iconButtonFollow]}
          onPress={() => {
            const next = !followMode;
            setFollowMode(next);
            if (next && coordsRef.current && cameraRef.current) {
              lastMapInteractionRef.current = 0;
              cameraRef.current.setCamera({
                centerCoordinate: [coordsRef.current.longitude, coordsRef.current.latitude],
                zoomLevel: 17,
                animationDuration: 700,
              });
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={followMode ? "lock-closed" : "lock-open-outline"}
            size={20}
            color={followMode ? "#ff4500" : "#666"}
          />
        </TouchableOpacity>

        <Animated.View style={buttonAnimStyle}>
          <TouchableOpacity
            style={[styles.iconButton, isSharing && styles.iconButtonActive, isTransitioning && styles.iconButtonBusy]}
            onPress={toggleSharing}
            disabled={isTransitioning}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isSharing ? "location" : "location-outline"}
              size={20}
              color={isSharing ? "#00c46a" : "#666"}
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  hud: {
    position: "absolute",
    top: 80,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hudBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(8, 8, 8, 0.88)",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    gap: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#ff4500",
  },
  hudText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.5,
  },
  toast: {
    position: "absolute",
    top: 130,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(14, 14, 14, 0.96)",
    borderWidth: 1,
    borderColor: "#222",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
  },
  toastDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toastMessage: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  toastSub: {
    color: "#555",
    fontSize: 12,
    marginTop: 2,
  },
  controls: {
    position: "absolute",
    bottom: 90,
    right: 16,
    gap: 10,
  },
  routePin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#ff4500",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  routePinText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  routePinStart: {
    backgroundColor: "#22c55e",
  },
  iconButton: {
    backgroundColor: "rgba(10, 10, 10, 0.9)",
    borderWidth: 1,
    borderColor: "#222",
    padding: 13,
    borderRadius: 14,
  },
  themeButton: {
    position: "absolute",
    top: 80,
    right: 16,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 8, 8, 0.88)",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 17,
  },
  iconButtonActive: {
    borderColor: "#00c46a33",
    backgroundColor: "rgba(0, 196, 106, 0.08)",
  },
  iconButtonBusy: {
    opacity: 0.5,
  },
  iconButtonFollow: {
    borderColor: "#ff450044",
    backgroundColor: "rgba(255, 69, 0, 0.08)",
  },
});
