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
import PoliceIcon from "../assets/images/police.svg";

const { width } = Dimensions.get("window");

type Feature = {
  ionicon?: keyof typeof Ionicons.glyphMap;
  svg?: "police";
  label: string;
  desc: string;
};

type Slide =
  | {
      kind: "intro";
      icon: keyof typeof Ionicons.glyphMap;
      title: string;
      body: string;
    }
  | {
      kind: "features";
      title: string;
      features: Feature[];
    };

const SLIDES: Slide[] = [
  {
    kind: "intro",
    icon: "speedometer-outline",
    title: "WELCOME TO CREW",
    body: "Live group-ride tracking, built for motorcycle crews.",
  },
  {
    kind: "intro",
    icon: "people-outline",
    title: "BUILD YOUR CREW",
    body: "Add riders by their @tag. Once they accept, you'll see each other live on the map.",
  },
  {
    kind: "intro",
    icon: "radio-button-on",
    title: "RIDE TOGETHER",
    body: "Start a ride to get a 6-digit code. Share it, or pull friends in directly. Plan a shared route the whole group can follow.",
  },
  {
    kind: "features",
    title: "KNOW YOUR MAP",
    features: [
      {
        ionicon: "location",
        label: "Share location",
        desc: "Stays on until you turn it off — even when the app is closed.",
      },
      {
        ionicon: "lock-closed",
        label: "Lock view",
        desc: "Map auto-follows you and rotates with your heading while riding.",
      },
      {
        ionicon: "globe",
        label: "Public lobby",
        desc: "Opt in to let riders within 100 mi see you. Off by default.",
      },
      {
        svg: "police",
        label: "Report police",
        desc: "One-tap heads-up — visible to riders nearby for 15 min.",
      },
    ],
  },
  {
    kind: "intro",
    icon: "rocket-outline",
    title: "READY TO RIDE",
    body: "Sign in to get started. Stay visible to your crew. Stay safe.",
  },
];

export default function Onboarding() {
  const { markSeen } = useOnboarding();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    markSeen();
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
            {s.kind === "intro" ? (
              <>
                <View style={styles.iconWrap}>
                  <Ionicons name={s.icon} size={72} color="#ff4500" />
                </View>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.body}>{s.body}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.title, styles.featuresTitle]}>{s.title}</Text>
                <View style={styles.featureList}>
                  {s.features.map((f, j) => (
                    <View key={j} style={styles.featureRow}>
                      <View style={styles.featureIconWrap}>
                        {f.svg === "police" ? (
                          <PoliceIcon width={26} height={26} />
                        ) : f.ionicon ? (
                          <Ionicons name={f.ionicon} size={22} color="#ff4500" />
                        ) : null}
                      </View>
                      <View style={styles.featureText}>
                        <Text style={styles.featureLabel}>{f.label}</Text>
                        <Text style={styles.featureDesc}>{f.desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
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
  featuresTitle: {
    marginBottom: 36,
  },
  featureList: {
    width: "100%",
    gap: 18,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#140d0a",
    borderWidth: 1,
    borderColor: "#2a1a12",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
  },
  featureLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  featureDesc: {
    color: "#888",
    fontSize: 12,
    lineHeight: 17,
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
