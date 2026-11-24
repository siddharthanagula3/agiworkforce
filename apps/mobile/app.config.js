/** @type {import('expo/config').ExpoConfig} */
const appEnv = process.env.APP_ENV || process.env.EXPO_PUBLIC_APP_ENV || 'development';
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const hostedOrigin = process.env.EXPO_PUBLIC_API_URL?.trim();
const easProjectId = '38f0941c-88a7-468a-9750-fcd8b357ff4c';
const iosShareAppGroupIdentifier = 'group.com.agiworkforce.app.share';
const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withGradleProperties,
  withInfoPlist,
  withStringsXml,
} = require('expo/config-plugins');
const { nativePurchases } = require('./src/features/billing/storePurchases.json');

function v1Feature(name) {
  const flagsFile = path.join(__dirname, 'lib', 'v1FeatureFlags.ts');
  const settings = [
    ...fs
      .readFileSync(flagsFile, 'utf8')
      .matchAll(new RegExp(`^\\s*${name}:\\s*(true|false),?$`, 'gm')),
  ];
  if (settings.length !== 1) {
    throw new Error(`[v1-features] ${flagsFile} must set ${name} to true or false exactly once.`);
  }
  return settings[0][1] === 'true';
}

const backgroundTasksEnabled = v1Feature('dispatch');
const pairingLinksEnabled = v1Feature('companion') && v1Feature('dispatch');
const BACKGROUND_TASK_MODES = ['fetch', 'processing'];

// expo-task-manager is autolinked for its JavaScript API, so prebuild applies its
// legacy plugin, which adds the fetch mode, whether or not a task is ever registered.
function withoutBackgroundTaskModes(config) {
  return withInfoPlist(config, (c) => {
    const modes = (c.modResults.UIBackgroundModes ?? []).filter(
      (mode) => !BACKGROUND_TASK_MODES.includes(mode),
    );
    if (modes.length > 0) c.modResults.UIBackgroundModes = modes;
    else delete c.modResults.UIBackgroundModes;
    return c;
  });
}

if (
  (appEnv === 'production' || appEnv === 'preview') &&
  !clerkPublishableKey?.startsWith('pk_live_')
) {
  throw new Error(
    `[clerk] ${appEnv} builds require EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to be a live Clerk publishable key.`,
  );
}

if (
  (appEnv === 'production' || appEnv === 'preview') &&
  (!hostedOrigin || new URL(hostedOrigin).protocol !== 'https:')
) {
  throw new Error(`[expo-router] ${appEnv} builds require an HTTPS EXPO_PUBLIC_API_URL origin.`);
}

function envIsTruthy(name) {
  const value = process.env[name]?.toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

const SPLASH_BACKGROUND_LIGHT = '#ffffff';
const SPLASH_BACKGROUND_DARK = '#000000';
const SPLASH_SYMBOL = './assets/agi-symbol.png';
// The symbol is at least 4x this, so the same asset is crisp on iOS @3x and Android xxxhdpi.
const SPLASH_IMAGE_WIDTH = 72;

const CAMERA_PURPOSE =
  'AGI Mobile uses the camera to scan documents and attach photos to your chats.';
const PHOTOS_PURPOSE = 'AGI Mobile uses the photos you pick to attach them to your chats.';
const FACE_ID_PURPOSE = 'AGI Mobile uses Face ID to unlock the app.';
// The name under the icon and in system dialogs matches the store record. `name`
// below stays the registry's product name, which also names the native target.
const APP_DISPLAY_NAME = 'AGI Mobile';
const ALL_INTERFACE_ORIENTATIONS = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationPortraitUpsideDown',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight',
];

function withAndroidDisplayName(config) {
  return withStringsXml(config, (c) => {
    const label = { name: 'app_name', value: APP_DISPLAY_NAME };
    c.modResults = AndroidConfig.Strings.setStringItem(
      [AndroidConfig.Resources.buildResourceItem(label)],
      c.modResults,
    );
    return c;
  });
}

function withAndroidFontScale(config) {
  return withAndroidManifest(config, (c) => {
    const { $: attributes } = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    const changes = new Set(attributes['android:configChanges']?.split('|').filter(Boolean));
    changes.add('fontScale');
    attributes['android:configChanges'] = [...changes].join('|');
    return c;
  });
}

function withAndroidReleaseBuildMemory(config) {
  return withGradleProperties(config, (c) => {
    const properties = c.modResults;
    const jvmArgs =
      properties.find((prop) => prop.type === 'property' && prop.key === 'org.gradle.jvmargs')
        ?.value ?? '';
    const retainedArgs = jvmArgs.replace(/(?:^|\s)(?:-Xmx|-XX:MaxMetaspaceSize=)\S+/gu, '').trim();
    const { updateAndroidBuildProperty } = AndroidConfig.BuildProperties;
    updateAndroidBuildProperty(
      properties,
      'org.gradle.jvmargs',
      ['-Xmx5g', '-XX:MaxMetaspaceSize=1024m', retainedArgs].filter(Boolean).join(' '),
    );
    updateAndroidBuildProperty(properties, 'org.gradle.workers.max', '3');
    return c;
  });
}

const shouldUseProductionEntitlements =
  envIsTruthy('EXPO_ENABLE_PRODUCTION_IOS_ENTITLEMENTS') ||
  (appEnv !== 'development' && !envIsTruthy('EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS'));

const associatedDomains = shouldUseProductionEntitlements
  ? ['applinks:agiworkforce.com', 'webcredentials:agiworkforce.com']
  : [];

const conditionalPlugins = [
  ...(appEnv === 'production' || appEnv === 'preview' ? [withAndroidReleaseBuildMemory] : []),
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
  name: 'Mobile',
  slug: 'agi-workforce',
  version: '0.0.1',
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
      CFBundleDisplayName: APP_DISPLAY_NAME,
      NSCameraUsageDescription: CAMERA_PURPOSE,
      NSMicrophoneUsageDescription:
        'AGI Mobile uses the microphone for voice input and real-time voice conversations with AI.',
      NSPhotoLibraryUsageDescription: PHOTOS_PURPOSE,
      NSPhotoLibraryAddUsageDescription:
        'AGI Mobile saves images you choose to save into your photo library.',
      NSFaceIDUsageDescription: FACE_ID_PURPOSE,
      NSSpeechRecognitionUsageDescription:
        'AGI Mobile uses speech recognition to transcribe voice input for AI conversations.',
      NSUserActivityTypes: ['com.agiworkforce.app.intent'],
      AGIApiBaseURL: hostedOrigin || 'https://agiworkforce.com',
      // `orientation` above writes the portrait-only iPhone list, which is all the
      // launch screen reads, so the app never opens sideways. Once running, the
      // orientations come from expo-screen-orientation's app delegate answer,
      // which lets Present and the video player turn.
      'UISupportedInterfaceOrientations~ipad': ALL_INTERFACE_ORIENTATIONS,
      'EXDefaultScreenOrientationMask~ipad': 'UIInterfaceOrientationMaskAll',
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      'com.apple.developer.declared-age-range': true,
      'com.apple.developer.kernel.increased-memory-limit': true,
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
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeAudioData',
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
          NSPrivacyCollectedDataTypePurposes: [
            'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            'NSPrivacyCollectedDataTypePurposeAnalytics',
          ],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeProductInteraction',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCustomerSupport',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeSearchHistory',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeOtherDiagnosticData',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
          NSPrivacyCollectedDataTypeLinked: false,
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
      backgroundColor: '#070B14',
    },
    package: 'com.agiworkforce.app',
    versionCode: 1,
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
    allowBackup: false,
    permissions: ['RECORD_AUDIO'],
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.ACCESS_MEDIA_LOCATION',
      'android.permission.SYSTEM_ALERT_WINDOW',
      // expo-sensors declares it for the pedometer, which the app never uses.
      'android.permission.ACTIVITY_RECOGNITION',
      // The Play Billing library declares this permission whenever it is
      // linked, and Play labels a listing "In-app purchases" from it. A build
      // that sells nothing must not carry it.
      ...(nativePurchases ? [] : ['com.android.vending.BILLING']),
    ],
    intentFilters: [
      {
        action: 'SEND',
        category: ['DEFAULT'],
        data: [
          { mimeType: 'text/plain' },
          { mimeType: 'text/*' },
          { mimeType: 'image/*' },
          { mimeType: 'application/pdf' },
        ],
      },
      {
        action: 'SEND_MULTIPLE',
        category: ['DEFAULT'],
        data: [{ mimeType: 'text/*' }, { mimeType: 'image/*' }, { mimeType: 'application/pdf' }],
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
          ...(pairingLinksEnabled
            ? [
                { scheme: 'https', host: 'agiworkforce.com', path: '/pair' },
                { scheme: 'https', host: 'agiworkforce.com', pathPrefix: '/pair/' },
              ]
            : []),
          { scheme: 'https', host: 'agiworkforce.com', path: '/auth/reset-password' },
          { scheme: 'https', host: 'agiworkforce.com', pathPrefix: '/open/' },
          { scheme: 'https', host: 'agiworkforce.com', path: '/github/installed' },
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
        image: SPLASH_SYMBOL,
        imageWidth: SPLASH_IMAGE_WIDTH,
        resizeMode: 'contain',
        backgroundColor: SPLASH_BACKGROUND_LIGHT,
        dark: {
          image: SPLASH_SYMBOL,
          backgroundColor: SPLASH_BACKGROUND_DARK,
        },
      },
    ],
    backgroundTasksEnabled ? 'expo-background-task' : withoutBackgroundTaskModes,
    withAndroidDisplayName,
    withAndroidFontScale,
    'expo-image',
    hostedOrigin ? ['expo-router', { origin: hostedOrigin }] : 'expo-router',
    'expo-secure-store',
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
          // Google Play has required API 36 for new submissions and updates
          // since 2026-08-31; API 35 now only keeps an already-published app
          // available to existing users. Expo's own default is still 35
          // (ExpoRootProjectPlugin.kt), so without these three lines every
          // build we upload is rejected at submission.
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          buildToolsVersion: '36.0.0',
        },
        ios: {
          // An app built with the iOS 27 SDK traps in UIKit at launch unless it
          // adopts the scene lifecycle. SDK 58's template does this natively;
          // remove this flag on that upgrade.
          enableSceneSupport: true,
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
        microphonePermission:
          'AGI Mobile uses the microphone for voice input and real-time voice conversations with AI.',
        speechRecognitionPermission:
          'AGI Mobile uses speech recognition to transcribe voice input for AI conversations.',
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
        calendarPermission: `Allow ${APP_DISPLAY_NAME} to read your calendars when you ask about your schedule, and to add the events you confirm in a chat.`,
        remindersPermission: `Allow ${APP_DISPLAY_NAME} to add the reminders you confirm in a chat.`,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: CAMERA_PURPOSE,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: PHOTOS_PURPOSE,
        cameraPermission: CAMERA_PURPOSE,
      },
    ],
    [
      'expo-media-library',
      {
        savePhotosPermission: 'AGI Mobile saves images you choose to save into your photo library.',
        isAccessMediaLocationEnabled: false,
        granularPermissions: [],
      },
    ],
    ['expo-sqlite', { useSQLCipher: true }],
    'expo-updates',
    'expo-web-browser',
    [
      'expo-local-authentication',
      {
        faceIDPermission: FACE_ID_PURPOSE,
      },
    ],
    'expo-document-picker',
    'expo-sharing',
    ['expo-screen-orientation', { initialOrientation: 'PORTRAIT_UP' }],
    // The accelerometer needs no permission; without this the plugin adds a
    // motion purpose string for a prompt the app never shows.
    ['expo-sensors', { motionPermission: false }],
    'llama.rn',
    './native/android/withAGITranslate.cjs',
    './native/android/withAGIVisionOCR.cjs',
    './native/android/withoutWebRTCScreenCapture.cjs',
    './native/ios/withAGINativeModulesIOS.cjs',
    './native/ios/withAGIShareExtension.cjs',
    './native/ios/withAGIWidgets.cjs',
    './native/ios/withAGIDevEntitlements.cjs',
    './native/ios/withClerkModularHeaders.cjs',
    './native/android/withAGIAICore.cjs',
    './native/android/withAGIShareIntent.cjs',
    './native/android/withAGITabletOrientation.cjs',
    './native/android/withAGIWidget.cjs',
    './native/android/withAGIShortcuts.cjs',
    // Emits the iOS NSPinnedDomains and Android network_security_config pin-sets
    // derived from lib/pinning.ts. It emits nothing until that file provisions
    // every required host AND sets PINNING_ROLLOUT to 'enforced', so it is inert
    // today, but without it registered here the pins never reach a build and
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

// EAS Build signs only the targets it is told about: each extension needs its own
// provisioning profile, and only these targets get the remote build number. The
// names match the targets native/ios/withAGIShareExtension.cjs and withAGIWidgets.cjs add.
const appExtensionEntitlements = {
  'com.apple.security.application-groups': [iosShareAppGroupIdentifier],
};
config.extra.eas.build = {
  experimental: {
    ios: {
      appExtensions: [
        {
          targetName: 'AGIShareExtension',
          bundleIdentifier: `${config.ios.bundleIdentifier}.share-extension`,
          entitlements: appExtensionEntitlements,
        },
        {
          targetName: 'AGIWidgets',
          bundleIdentifier: `${config.ios.bundleIdentifier}.widgets`,
          entitlements: appExtensionEntitlements,
        },
      ],
    },
  },
};

module.exports = { expo: config };
