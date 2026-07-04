module.exports = {
  dependencies: {
    // HealthKit is iOS-only; its Android autolinking stub uses jcenter()
    // and cannot build on modern Gradle/AGP.
    '@kingstinct/react-native-healthkit': {
      platforms: { android: null },
    },
  },
};
