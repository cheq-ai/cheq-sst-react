// Dynamic Expo config: the version comes from package.json rather than being a fourth
// place to hand-edit on every release.
const { version } = require("./package.json");

module.exports = {
  "expo": {
    "name": "Test",
    "slug": "Test",
    "version": version,
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.anonymous.Test"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.anonymous.Test"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      "expo-tracking-transparency"
    ],
    "jsEngine": "hermes"
  }
};
