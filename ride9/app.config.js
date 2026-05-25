export default {
  expo: {
    name: "Crew",
    slug: "crew",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "crew",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.tianxiangren.crew",
      infoPlist: {
        UIBackgroundModes: ["location"],
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.tianxiangren.crew",
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      [
        "@rnmapbox/maps",
        {
          RNMAPBOX_MAPS_DOWNLOAD_TOKEN:
            process.env.EXPO_RNMAPBOX_MAPS_DOWNLOAD_TOKEN,
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Crew shows your location on the map while the app is open.",
          locationAlwaysAndWhenInUsePermission: "Crew shares your location with your riding group, including when the screen is locked.",
          isIosBackgroundLocationEnabled: true,
        },
      ],
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: "a4738417-b6e7-402d-9727-cb434f831145",
      },
    },
    owner: "rentxiang",
    slug: "crew",
  },
};
