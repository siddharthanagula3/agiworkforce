/**
 * Detox configuration — AGI Mobile v1 e2e specs.
 *
 * Requirements:
 *   - iOS: Xcode 16+, iPhone 17 Pro simulator (or any iPhone 16+ class)
 *   - Android: Android SDK 34+, Pixel 8 emulator API 34
 *   - detox, detox-cli, ts-jest are devDependencies (installed 2026-07-04)
 *
 * Usage:
 *   iOS build:   pnpm exec detox build --configuration ios.sim.debug
 *   iOS debug:   pnpm exec detox test --configuration ios.sim.debug
 *   iOS release: pnpm exec detox test --configuration ios.sim.release
 *   Android:     pnpm exec detox test --configuration android.emu.debug
 */

/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'scripts/screenshots/jest.detox.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },

  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/AGIWorkforce.app',
      build:
        'xcodebuild -workspace ios/AGIWorkforce.xcworkspace -scheme AGIWorkforce -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/AGIWorkforce.app',
      build:
        'xcodebuild -workspace ios/AGIWorkforce.xcworkspace -scheme AGIWorkforce -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build:
        'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug && cd ..',
      reversePorts: [8081],
    },
  },

  devices: {
    'ios.sim': {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 17 Pro',
      },
    },
    'android.emu': {
      type: 'android.emulator',
      device: {
        avdName: 'pixel_8_api_34',
      },
    },
  },

  configurations: {
    'ios.sim.debug': {
      device: 'ios.sim',
      app: 'ios.debug',
    },
    'ios.sim.release': {
      device: 'ios.sim',
      app: 'ios.release',
    },
    'android.emu.debug': {
      device: 'android.emu',
      app: 'android.debug',
    },
  },
};
