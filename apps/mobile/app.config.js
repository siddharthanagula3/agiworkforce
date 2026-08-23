/** @type {import('expo/config').ExpoConfig} */
const appEnv = process.env.APP_ENV || process.env.EXPO_PUBLIC_APP_ENV || 'development';
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const easProjectId = '38f0941c-88a7-468a-9750-fcd8b357ff4c';
const iosShareAppGroupIdentifier = 'group.com.agiworkforce.app.share';

if (
  (appEnv === 'production' || appEnv === 'preview') &&
  !clerkPublishableKey?.startsWith('pk_live_')
) {
  throw new Error(
    `[clerk] ${appEnv} builds require EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to be a live Clerk publishable key.`,
  );
}

function envIsTruthy(name) {
  const value = process.env[name]?.toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

const SPLASH_BACKGROUND_LIGHT = '#ffffff';
const SPLASH_BACKGROUND_DARK = '#0f0f0f';
// PNGs are 4x this, so the same asset is crisp on iOS @3x and Android xxxhdpi.
const SPLASH_IMAGE_WIDTH = 220;

const shouldUseProductionEntitlements =
  envIsTruthy('EXPO_ENABLE_PRODUCTION_IOS_ENTITLEMENTS') ||
  (appEnv !== 'development' && !envIsTruthy('EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS'));

const iosEntitlements = shouldUseProductionEntitlements
  ? {
      'com.apple.developer.siri': true,
      'com.apple.developer.natural-language.translation': true,
    }
  : {};

const associatedDomains = shouldUseProductionEntitlements ? ['applinks:agiworkforce.com'] : [];

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
  ios: {
    supportsTablet: true,
    requireFullScreen: false,
    bundleIdentifier: 'com.agiworkforce.app',
    buildNumber: '2',
    associatedDomains,
    infoPlist: {
      NSCameraUsageDescription:
        'AGI Workforce uses the camera to scan documents and text for AI analysis and to attach photos to your conversations.',
      NSMicrophoneUsageDescription:
        'AGI Workforce uses the microphone for voice input and real-time voice conversations with AI.',
      NSPhotoLibraryUsageDescription:
        'AGI Workforce accesses your photo library to select images for AI analysis and conversations.',
      NSFaceIDUsageDescription:
        'AGI Workforce uses Face ID to securely unlock the app and protect your data.',
      NSSpeechRecognitionUsageDescription:
        'AGI Workforce uses speech recognition to transcribe voice input for AI conversations.',
      NSTranslationUsageDescription:
        'AGI Workforce uses on-device translation to translate text between languages privately.',
      NSUserActivityTypes: ['INSendMessageIntent', 'com.agiworkforce.app.intent'],
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      ...iosEntitlements,
      'com.apple.security.application-groups': [iosShareAppGroupIdentifier],
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1', 'C56D.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1', '3B52.1', '0A2A.1'],
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
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeOtherUserContent',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhotosorVideos',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeUserID',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeDeviceID',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
      ],
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
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
        action: 'SEND',
        category: ['DEFAULT'],
        data: [{ mimeType: 'text/plain' }],
      },
      {
        action: 'PROCESS_TEXT',
        category: ['DEFAULT'],
        data: [{ mimeType: 'text/plain' }],
      },
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['DEFAULT', 'BROWSABLE'],
        data: [
          { scheme: 'https', host: 'agiworkforce.com', path: '/pair' },
          { scheme: 'https', host: 'agiworkforce.com', pathPrefix: '/pair/' },
          { scheme: 'https', host: 'agiworkforce.com', path: '/auth/reset-password' },
        ],
      },
    ],
  },
  plugins: [
    'expo-asset',
    'expo-iap',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-lockup.png',
        imageWidth: SPLASH_IMAGE_WIDTH,
        resizeMode: 'contain',
        backgroundColor: SPLASH_BACKGROUND_LIGHT,
        dark: {
          image: './assets/splash-lockup-dark.png',
          backgroundColor: SPLASH_BACKGROUND_DARK,
        },
      },
    ],
    'expo-background-task',
    'expo-image',
    'expo-router',
    'expo-secure-store',
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
        },
      },
    ],
    [
      '@clerk/expo',
      {
        theme: './clerk-theme.json',
      },
    ],
    ...conditionalPlugins,
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Use microphone to transcribe speech to text',
        speechRecognitionPermission: 'Recognize speech for chat input',
        androidSpeechServicePackages: ['com.google.android.googlequicksearchbox'],
      },
    ],
    [
      'expo-localization',
      {
        supportsRTL: true,
        forcesRTL: false,
      },
    ],
    [
      'expo-calendar',
      {
        calendarPermission:
          'Allow $(PRODUCT_NAME) to read calendar events only after you enable device calendar context.',
        remindersPermission:
          'Allow $(PRODUCT_NAME) to access reminders only when you explicitly enable reminder access.',
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
    'llama.rn',
    './native/android/withAGITranslate.cjs',
    './native/android/withAGIVisionOCR.cjs',
    './native/ios/withAGINativeModulesIOS.cjs',
    './native/ios/withAGIShareExtension.cjs',
    './native/ios/withAGIDevEntitlements.cjs',
    './native/ios/withClerkModularHeaders.cjs',
    './native/android/withAGIAICore.cjs',
    './native/android/withAGIShareIntent.cjs',
    // Emits the iOS NSPinnedDomains and Android network_security_config pin-sets
    // derived from lib/pinning.ts. It emits nothing until that file provisions
    // every required host AND sets PINNING_ROLLOUT to 'enforced', so it is inert
    // today — but without it registered here the pins never reach a build and
    // nothing checks any certificate. Registration also puts the pinning state
    // inside the fingerprint runtimeVersion below, which is what stops an
    // over-the-air update from claiming pinning a shipped binary does not have.
    './native/withAGITlsPinning.cjs',
    ...(envIsTruthy('EXPO_ENABLE_DETOX') ? ['./native/android/withAGIDetox.cjs'] : []),
  ],
  runtimeVersion: {
    policy: 'fingerprint',
  },
  updates: {
    url: `https://u.expo.dev/${easProjectId}`,
    fallbackToCacheTimeout: 0,
  },
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: easProjectId,
    },
  },
};

module.exports = { expo: config };
