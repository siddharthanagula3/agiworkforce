// app.config.js — dynamic Expo config (replaces app.json).
// New Architecture is the default in Expo SDK 55 — no explicit newArchEnabled needed.
/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'AGI Workforce',
  slug: 'agi-workforce',
  version: '1.0.0',
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
    associatedDomains: ['applinks:agiworkforce.com', 'applinks:www.agiworkforce.com'],
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
      NSContactsUsageDescription:
        'AGI Workforce accesses your contacts to help compose messages and manage communications through AI.',
      NSHealthShareUsageDescription:
        'AGI Workforce reads health data to provide AI-powered health insights and summaries.',
      NSSpeechRecognitionUsageDescription:
        'AGI Workforce uses speech recognition to transcribe voice input for AI conversations.',
      NSTranslationUsageDescription:
        'AGI Workforce uses on-device translation to translate text between languages privately.',
      // NSUserActivityTypes declares the activity type identifiers for App Intents / Siri.
      // com.agiworkforce.app.intent is the base namespace for all custom intents.
      NSUserActivityTypes: ['INSendMessageIntent', 'com.agiworkforce.app.intent'],
    },
    entitlements: {
      // Siri + App Intents: required for Shortcuts app registration and Siri phrase triggers.
      'com.apple.developer.siri': true,
      // Apple Translate framework entitlement (required for Translation API on iOS 17.4+).
      'com.apple.developer.natural-language.translation': true,
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
      NSPrivacyCollectedDataTypes: [],
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
    'expo-apple-authentication',
    'expo-secure-store',
    [
      'expo-av',
      {
        microphonePermission: 'Allow $(DISPLAYNAME) to access your microphone for voice chat.',
      },
    ],
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
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#6366f1',
        androidMode: 'default',
      },
    ],
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
    'expo-sqlite',
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
    // Tier 1 Android: wires AGIAICoreModule + AGIAICorePackage into the generated android/ project.
    // Injects com.google.mlkit:genai-common gradle dep + registers AGIAICorePackage in MainApplication.kt.
    './native/android/withAGIAICore.cjs',
  ],
  updates: {
    fallbackToCacheTimeout: 0,
  },
  experiments: {
    typedRoutes: true,
  },
};

module.exports = { expo: config };
