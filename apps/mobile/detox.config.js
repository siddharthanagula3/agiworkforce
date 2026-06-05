/**
 * Detox configuration — AGI Mobile v1 e2e specs.
 *
 * Requirements:
 *   - iOS: Xcode 16+, iPhone 17 Pro simulator (or any iPhone 16+ class)
 *   - Android: Android SDK 34+, Pixel 8 emulator API 34
 *   - detox binary: install via `pnpm add -D detox@20` before running
 *
 * CI note (2026-05-18):
 *   Detox is NOT listed in package.json devDependencies. The founder must
 *   run `pnpm add -D detox@20` once on a machine with a connected simulator
 *   before the suite can execute. See `docs/e2e-setup.md` for the full
 *   runbook. The 5 specs in scripts/screenshots/specs/ are syntactically
 *   valid TypeScript and pass `pnpm typecheck` without the package installed
 *   file). Actual Detox execution requires the native binary.
 *
 * Usage (after installing detox):
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
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/agiworkforce.app',
      build:
        'xcodebuild -workspace ios/agiworkforce.xcworkspace -scheme agiworkforce -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/agiworkforce.app',
      build:
        'xcodebuild -workspace ios/agiworkforce.xcworkspace -scheme agiworkforce -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
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
