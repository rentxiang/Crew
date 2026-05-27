import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { Ionicons } from "@expo/vector-icons";
import Mapbox, { Camera, MapView, MarkerView, ShapeSource, LineLayer, LocationPuck } from "@rnmapbox/maps";
import {
  Waypoint,
  SearchResult,
  searchPlaces,
  retrievePlace,
  newSessionToken,
  reverseGeocode,
  fetchRouteGeometry,
  saveRoute,
  clearRoute,
} from "../services/routes";

function stopKind(i: number, total: number): "start" | "end" | "num" {
  if (i === 0 && total > 1) return "start";
  if (i === total - 1) return "end";
  return "num";
}

interface Props {
  visible: boolean;
  roomId: string;
  userId: string;
  initialWaypoints: Waypoint[];
  near?: { lat: number; lng: number } | null;
  onClose: () => void;
}

export default function RouteEditor({
  visible,
  roomId,
  userId,
  initialWaypoints,
  near,
  onClose,
}: Props) {
  const [stops, setStops] = useState<Waypoint[]>(initialWaypoints);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [geometry, setGeometry] = useState<{ coordinates: [number, number][] } | null>(null);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<Camera>(null);
  const sessionRef = useRef(newSessionToken());

  useEffect(() => {
    if (visible) {
      setStops(initialWaypoints);
      setSaving(false);
      setQuery("");
      setResults([]);
    }
  }, [visible]);

  // Re-snap the route whenever stops change
  useEffect(() => {
    let cancelled = false;
    if (stops.length < 2) {
      setGeometry(null);
      return;
    }
    fetchRouteGeometry(stops).then((geo) => {
      if (!cancelled) setGeometry(geo);
    });
    return () => {
      cancelled = true;
    };
  }, [stops]);

  const focusOn = (w: Waypoint) => {
    cameraRef.current?.setCamera({
      centerCoordinate: [w.lng, w.lat],
      zoomLevel: 12,
      animationDuration: 500,
    });
  };

  const addStop = (w: Waypoint) => {
    setStops((prev) => [...prev, w]);
    setQuery("");
    setResults([]);
    focusOn(w);
  };

  const selectResult = async (r: SearchResult) => {
    const w = await retrievePlace(r.mapbox_id, sessionRef.current);
    sessionRef.current = newSessionToken();
    if (w) addStop({ lat: w.lat, lng: w.lng, label: r.label });
  };

  // Search as you type (debounced)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchPlaces(q, near ?? undefined, sessionRef.current);
      if (!cancelled) {
        setResults(res);
        setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const addCurrentLocation = () => {
    if (!near) return;
    addStop({ lat: near.lat, lng: near.lng, label: "My location" });
  };

  const handleMapPress = async (e: any) => {
    const [lng, lat] = e.geometry.coordinates;
    const label = await reverseGeocode(lat, lng);
    addStop({ lat, lng, label });
  };

  const remove = (i: number) => {
    setStops((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (stops.length === 0) {
        await clearRoute(roomId);
      } else {
        const geo = stops.length >= 2 ? await fetchRouteGeometry(stops) : null;
        await saveRoute(roomId, userId, stops, geo);
      }
      setSaving(false);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const lineShape = geometry
    ? {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: geometry.coordinates },
      }
    : null;

  const renderStop = ({ item, drag, isActive, getIndex }: RenderItemParams<Waypoint>) => {
    const i = getIndex() ?? 0;
    const kind = stopKind(i, stops.length);
    return (
      <ScaleDecorator>
        <View style={[styles.stopRow, isActive && styles.stopRowActive]}>
          <TouchableOpacity onLongPress={drag} delayLongPress={120} hitSlop={6}>
            <Ionicons name="reorder-three" size={22} color="#777" />
          </TouchableOpacity>
          <View style={[styles.stopIndex, kind === "start" && styles.badgeStart]}>
            {kind === "num" ? (
              <Text style={styles.stopIndexText}>{i}</Text>
            ) : (
              <Ionicons name={kind === "start" ? "navigate" : "flag"} size={11} color="#fff" />
            )}
          </View>
          <TouchableOpacity style={styles.stopLabel} onPress={() => focusOn(item)}>
            <Text style={styles.stopLabelText} numberOfLines={1}>
              {item.label}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => remove(i)} hitSlop={6}>
            <Ionicons name="close-circle" size={18} color="#ff5a52" />
          </TouchableOpacity>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>PLAN ROUTE</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={10}>
            <Text style={styles.saveText}>{saving ? "..." : "Save"}</Text>
          </TouchableOpacity>
        </View>

        {/* Search — dropdown overlays content below */}
        <View style={styles.searchWrap}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color="#555" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search a place to add..."
              placeholderTextColor="#444"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searching ? (
              <ActivityIndicator size="small" color="#ff4500" />
            ) : query.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  setQuery("");
                  setResults([]);
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color="#555" />
              </TouchableOpacity>
            ) : null}
          </View>

          {results.length > 0 && (
            <View style={styles.results}>
              {results.map((r, i) => (
                <TouchableOpacity key={i} style={styles.resultRow} onPress={() => selectResult(r)}>
                  <Ionicons name="location-outline" size={15} color="#ff4500" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultText} numberOfLines={1}>
                      {r.label}
                    </Text>
                    {r.subtitle ? (
                      <Text style={styles.resultSub} numberOfLines={1}>
                        {r.subtitle}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {near && (
          <TouchableOpacity style={styles.currentLocBtn} onPress={addCurrentLocation} activeOpacity={0.8}>
            <Ionicons name="locate" size={15} color="#ff4500" />
            <Text style={styles.currentLocText}>Use my current location</Text>
          </TouchableOpacity>
        )}

        {/* Stops list (drag to reorder) */}
        <View style={styles.stopsList}>
          {stops.length === 0 ? (
            <Text style={styles.emptyHint}>Search above or tap the map to add stops</Text>
          ) : (
            <DraggableFlatList
              data={stops}
              keyExtractor={(item, i) => `${item.lat},${item.lng},${i}`}
              renderItem={renderStop}
              onDragEnd={({ data }) => setStops(data)}
              activationDistance={8}
            />
          )}
        </View>

        {/* Map preview */}
        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            styleURL={Mapbox.StyleURL.Dark}
            onPress={handleMapPress}
            zoomEnabled
            scrollEnabled
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: near ? [near.lng, near.lat] : [-122.4, 37.77],
                zoomLevel: 10,
              }}
            />
            <LocationPuck puckBearing="heading" puckBearingEnabled pulsing={{ isEnabled: true }} />
            {lineShape && (
              <ShapeSource id="routeLine" shape={lineShape}>
                <LineLayer
                  id="routeLineLayer"
                  style={{ lineColor: "#ff4500", lineWidth: 4, lineCap: "round", lineJoin: "round" }}
                />
              </ShapeSource>
            )}
            {stops.map((s, i) => {
              const kind = stopKind(i, stops.length);
              return (
                <MarkerView key={i} id={`stop-${i}`} coordinate={[s.lng, s.lat]} allowOverlap>
                  <View style={[styles.pin, kind === "start" && styles.pinStart]}>
                    {kind === "num" ? (
                      <Text style={styles.pinText}>{i}</Text>
                    ) : (
                      <Ionicons name={kind === "start" ? "navigate" : "flag"} size={13} color="#fff" />
                    )}
                  </View>
                </MarkerView>
              );
            })}
          </MapView>
          <Text style={styles.mapHint}>Tap the map to drop a stop</Text>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080808", paddingTop: 60 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 4 },
  saveText: { color: "#ff4500", fontSize: 15, fontWeight: "800" },
  searchWrap: {
    marginHorizontal: 20,
    zIndex: 20,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, paddingVertical: 12, color: "#fff", fontSize: 15 },
  results: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 6,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#222",
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 20,
    elevation: 8,
  },
  currentLocBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e1e1e",
    alignSelf: "flex-start",
  },
  currentLocText: { color: "#ccc", fontSize: 13, fontWeight: "600" },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  resultText: { color: "#fff", fontSize: 14 },
  resultSub: { color: "#666", fontSize: 12, marginTop: 1 },
  stopsList: { maxHeight: 200, marginTop: 12, paddingHorizontal: 20 },
  emptyHint: { color: "#444", fontSize: 13, textAlign: "center", paddingVertical: 24 },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#141414",
  },
  stopRowActive: {
    backgroundColor: "#161616",
    borderBottomColor: "transparent",
  },
  stopIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ff4500",
    alignItems: "center",
    justifyContent: "center",
  },
  stopIndexText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  badgeStart: { backgroundColor: "#22c55e" },
  stopLabel: { flex: 1 },
  stopLabelText: { color: "#fff", fontSize: 14 },
  mapWrap: { flex: 1, marginTop: 12 },
  map: { flex: 1 },
  mapHint: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    color: "#fff",
    fontSize: 11,
    backgroundColor: "rgba(8,8,8,0.8)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: "hidden",
  },
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#ff4500",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  pinText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  pinStart: { backgroundColor: "#22c55e" },
});
