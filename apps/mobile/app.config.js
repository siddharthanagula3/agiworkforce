// app.config.js — dynamic Expo config (replaces app.json).
// New Architecture is the default in Expo SDK 55 — no explicit newArchEnabled needed.
/** @type {import('expo/config').ExpoConfig} */
const appEnv = process.env.APP_ENV || process.env.EXPO_PUBLIC_APP_ENV || 'development';

function envIsTruthy(name) {
  const value = process.env[name]?.toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

// Default behavior:
// - production/preview-like app-env => keep full entitlement set (Push, SIWA, Siri, Translate).
// - development app-env => use minimal entitlements for basic dev provisioning.
const shouldUseProductionEntitlements =
  envIsTruthy('EXPO_ENABLE_PRODUCTION_IOS_ENTITLEMENTS') ||
  (appEnv !== 'development' && !envIsTruthy('EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS'));

const iosEntitlements = shouldUseProductionEntitlements
  ? {
      // Siri + App Intents: required for Shortcuts app registration and Siri phrase triggers.
      'com.apple.developer.siri': true,
      // Apple Translate framework entitlement (required for Translation API on iOS 17.4+).
      'com.apple.developer.natural-language.translation': true,
    }
  : {};

const associatedDomains = shouldUseProductionEntitlements
  ? ['applinks:agiworkforce.com', 'applinks:www.agiworkforce.com']
  : [];

const conditionalPlugins = [
  ...(shouldUseProductionEntitlements
    ? [
        'expo-apple-authentication',
        [
          'expo-notifications',
          {
            icon: './assets/notification-icon.png',
            color: '#6366f1',
            androidMode: 'default',
            mode: appEnv === 'development' ? 'development' : 'production',
          },
        ],
      ]
    : []),
];

const config = {
  name: 'AGI Workforce',
  slug: 'agi-workforce',
  version: '1.2.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'agiworkforce',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0f0f0f',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.agiworkforce.app',
    buildNumber: '1',
    // AUDIT-FIX: H-11 — declare apex + www so iOS verifies the AASA file on
    // /.well-known/ before any Universal-Link tap is routed to the app.
    associatedDomains,
    infoPlist: {
      NSCameraUsageDescription:
        'AGI Workforce uses the camera to scan QR codes for desktop pairing and to send images to AI for analysis.',
      NSMicrophoneUsageDescription:
        'AGI Workforce uses the microphone for voice input and real-time voice conversations with AI.',
      NSPhotoLibraryUsageDescription:
        'AGI Workforce accesses your photo library to select images for AI analysis and conversations.',
      NSFaceIDUsageDescription:
        'AGI Workforce uses Face ID to securely unlock the app and protect your data.',
      NSCalendarsUsageDescription:
        'AGI Workforce accesses your calendar to help schedule tasks and set reminders through AI agents.',
      NSCalendarsFullAccessUsageDescription:
        'AGI Workforce accesses your calendar to read upcoming events only after you enable the Calendar connector.',
      NSRemindersUsageDescription:
        'AGI Workforce accesses reminders only after you enable the Calendar connector.',
      NSRemindersFullAccessUsageDescription:
        'AGI Workforce accesses reminders only after you enable the Calendar connector.',
      NSContactsUsageDescription:
        'AGI Workforce accesses your contacts to help compose messages and manage communications through AI.',
      // NSHealthShareUsageDescription is injected by the
      // @kingstinct/react-native-healthkit config plugin below.
      NSSpeechRecognitionUsageDescription:
        'AGI Workforce uses speech recognition to transcribe voice input for AI conversations.',
      NSTranslationUsageDescription:
        'AGI Workforce uses on-device translation to translate text between languages privately.',
      // NSUserActivityTypes declares the activity type identifiers for App Intents / Siri.
      // com.agiworkforce.app.intent is the base namespace for all custom intents.
      NSUserActivityTypes: ['INSendMessageIntent', 'com.agiworkforce.app.intent'],
    },
    entitlements: {
      ...iosEntitlements,
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
      ],
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeName',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
      ],
      NSPrivacyTracking: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f0f0f',
    },
    package: 'com.agiworkforce.app',
    versionCode: 1,
    allowBackup: false,
    permissions: [
      'CAMERA',
      'RECORD_AUDIO',
      'READ_EXTERNAL_STORAGE',
      'USE_BIOMETRIC',
      'USE_FINGERPRINT',
    ],
    intentFilters: [
      {
        action: 'android.intent.action.SEND',
        category: ['android.intent.category.DEFAULT'],
        data: [{ mimeType: 'text/plain' }, { mimeType: 'image/*' }],
      },
      // AUDIT-FIX: H-11 — verified Android App Link for https://agiworkforce.com/*.
      // autoVerify=true forces the OS to fetch /.well-known/assetlinks.json
      // before this filter is honored, so an unverified third-party app
      // cannot claim the same VIEW intent.
      {
        action: 'android.intent.action.VIEW',
        autoVerify: true,
        category: ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'],
        data: [
          { scheme: 'https', host: 'agiworkforce.com' },
          { scheme: 'https', host: 'www.agiworkforce.com' },
        ],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // minSdkVersion 26 (Android 8.0) floor — required by com.google.mlkit:genai-common
    // (withAGIAICore.cjs) manifest merger; drops Android 7.0/7.1 support.
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
        },
      },
    ],
    // Clerk cloud auth (native AuthView + secure token cache). Adds the Clerk
    // iOS/Android native modules; requires a native rebuild (expo run:ios).
    '@clerk/expo',
    ...conditionalPlugins,
    // AUDIT-FIX: STT-WIRE — on-device speech recognition via iOS Speech
    // framework / Android SpeechRecognizer. Microphone usage description is
    // already declared above; this plugin emits NSSpeechRecognitionUsageDescription
    // and the Android RECORD_AUDIO + manifest entries.
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Use microphone to transcribe speech to text',
        speechRecognitionPermission: 'Recognize speech for chat input',
        androidSpeechServicePackages: ['com.google.android.googlequicksearchbox'],
      },
    ],
    'expo-localization',
    [
      'expo-camera',
      {
        cameraPermission:
          'Allow $(DISPLAYNAME) to access your camera for QR scanning and photo features.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow $(DISPLAYNAME) to access your photos.',
        cameraPermission: 'Allow $(DISPLAYNAME) to access your camera.',
      },
    ],
    // SQLCipher: enables encrypted SQLite at the native layer (replaces the stock
    // SQLite pod/AAR with the SQLCipher variant). This is required for the
    // PRAGMA key ceremony in storage/db.ts to actually encrypt agi_mobile.db.
    // Without this option expo-sqlite links stock SQLite and the PRAGMA key is
    // a silent no-op, leaving the DB plaintext at rest.
    // NOTE: changing this setting requires a `pod install` / native rebuild —
    // it is not a JS-only change.
    ['expo-sqlite', { useSQLCipher: true }],
    'expo-updates',
    'expo-web-browser',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Allow $(DISPLAYNAME) to use Face ID to unlock the app.',
      },
    ],
    'expo-document-picker',
    'expo-sharing',
    // HealthKit: injects com.apple.developer.healthkit entitlement (iOS only).
    // App only reads data (see healthKitPermission.ts requestAuthorization
    // read-only call) — update-usage string disabled since write is unused.
    [
      '@kingstinct/react-native-healthkit',
      {
        NSHealthShareUsageDescription:
          'AGI Workforce reads health data to provide AI-powered health insights and summaries.',
        NSHealthUpdateUsageDescription: false,
        background: false,
      },
    ],
    // StoreKit 2 (iOS) / Play Billing (Android) in-app purchase bridge for
    // subscription upgrades. Wires the IAP capability + Android BILLING
    // permission at prebuild time — requires `expo prebuild` + pod install
    // to take effect; not yet run as of this scaffolding pass.
    'react-native-iap',
    // Tier 3 universal fallback: llama.rn config plugin wires native GGUF runtime.
    // Models downloaded at runtime into Documents/models/ — not bundled in the binary.
    'llama.rn',
    // Tier 2 Android: wires AGITranslateModule + AGITranslatePackage into the generated android/ project.
    // Injects com.google.mlkit:translate:17.0.3 gradle dep + registers AGITranslatePackage in MainApplication.kt.
    './native/android/withAGITranslate.cjs',
    // Tier 2 Android: wires AGIVisionOCR + AGIVisionOCRPackage into the generated android/ project.
    // Injects com.google.mlkit:text-recognition:16.0.0 gradle dep + registers AGIVisionOCRPackage in MainApplication.kt.
    './native/android/withAGIVisionOCR.cjs',
    // iOS: copies AGIFoundationModels, AGITranslate, AGIVisionOCR, and AGIAppIntents Swift/ObjC sources
    // into the generated ios/<AppName>/ directory and registers them with the Xcode project target.
    // RCT_EXTERN_MODULE bridges auto-register with React Native bridge scanning — no manual list needed.
    './native/ios/withAGINativeModulesIOS.cjs',
    // iOS local device builds: remove production-only entitlement keys after Expo package plugins run.
    './native/ios/withAGIDevEntitlements.cjs',
    // iOS: opt Clerk's static-linked Google pods (GoogleUtilities/RecaptchaInterop/
    // AppCheckCore) into modular headers so pod install succeeds without switching
    // the whole app to use_frameworks!.
    './native/ios/withClerkModularHeaders.cjs',
    // Tier 1 Android: wires AGIAICoreModule + AGIAICorePackage into the generated android/ project.
    // Injects com.google.mlkit:genai-common gradle dep + registers AGIAICorePackage in MainApplication.kt.
    './native/android/withAGIAICore.cjs',
    // Detox e2e (Android): wires testInstrumentationRunner, androidTestImplementation('com.wix:detox:+'),
    // and the network security config needed for the Detox test server. iOS side (Podfile) is wired
    // separately by Detox's own postinstall / `detox init` step, not this plugin.
    ...(envIsTruthy('EXPO_ENABLE_DETOX') ? ['@config-plugins/detox'] : []),
  ],
  updates: {
    fallbackToCacheTimeout: 0,
  },
  experiments: {
    typedRoutes: true,
  },
};

module.exports = { expo: config };
