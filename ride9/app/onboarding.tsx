import { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ONBOARDING_KEY, useOnboarding } from "../contexts/onboarding";

const { width } = Dimensions.get("window");

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: "speedometer-outline",
    title: "WELCOME TO CREW",
    body: "Ride together, stay together. Live tracking for you and your crew.",
  },
  {
    icon: "map-outline",
    title: "EVERYONE ON ONE MAP",
    body: "Turn on location sharing to watch your crew move in real time. You stay visible at your last location until you turn sharing off.",
  },
  {
    icon: "people-outline",
    title: "BUILD YOUR CREW",
    body: "Add riders by their @tag. Once they accept, you'll see each other live.",
  },
  {
    icon: "mic-outline",
    title: "HOLD TO TALK",
    body: "Press your avatar to drop a voice message on the map. Tap to listen — gone in 24h.",
  },
  {
    icon: "navigate-outline",
    title: "START A RIDE",
    body: "Create or join a ride with a code, and plan a route for the whole group.",
  },
];

export default function Onboarding() {
  const { markSeen } = useOnboarding();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    markSeen(); // updates root state, which routes to login/tabs
  };

  const next = () => {
    if (isLast) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skip} onPress={finish} hitSlop={10}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={styles.iconWrap}>
              <Ionicons name={s.icon} size={72} color="#ff4500" />
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity style={styles.button} onPress={next} activeOpacity={0.85}>
        <Text style={styles.buttonText}>{isLast ? "LET'S RIDE" : "NEXT"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080808",
    paddingBottom: 40,
  },
  skip: {
    position: "absolute",
    top: 60,
    right: 24,
    zIndex: 10,
  },
  skipText: {
    color: "#555",
    fontSize: 14,
  },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  iconWrap: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: "#140d0a",
    borderWidth: 1,
    borderColor: "#2a1a12",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 3,
    textAlign: "center",
    marginBottom: 16,
  },
  body: {
    color: "#888",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 23,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 28,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#2a2a2a",
  },
  dotActive: {
    backgroundColor: "#ff4500",
    width: 20,
  },
  button: {
    backgroundColor: "#ff4500",
    marginHorizontal: 32,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 3,
  },
});
