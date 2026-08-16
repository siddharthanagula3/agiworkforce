
/** @type {Detox.DetoxConfig} */
const simulatorArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';

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
      build: `xcodebuild -workspace ios/AGIWorkforce.xcworkspace -scheme AGIWorkforce -configuration Release -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath ios/build ONLY_ACTIVE_ARCH=YES ARCHS=${simulatorArch}`,
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
      device: process.env.DETOX_IOS_UDID
        ? { id: process.env.DETOX_IOS_UDID }
        : { type: process.env.DETOX_IOS_DEVICE || 'iPhone 17 Pro' },
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
