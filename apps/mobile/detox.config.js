/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */
const {
  DETOX_IOS_UDID_ENV,
  DETOX_IOS_DEVICE_ENV,
  DETOX_ANDROID_AVD_ENV,
  DEFAULT_IOS_DEVICE,
  DEFAULT_ANDROID_AVD,
  IOS_APP_BINARY,
  ANDROID_APP_BINARY,
} = require('./detox.env');

/** @type {Detox.DetoxConfig} */
const simulatorArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';

const iosUdid = process.env[DETOX_IOS_UDID_ENV];
const androidAvd = process.env[DETOX_ANDROID_AVD_ENV] || DEFAULT_ANDROID_AVD;

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
      binaryPath: IOS_APP_BINARY.debug,
      build:
        'xcodebuild -workspace ios/AGIWorkforce.xcworkspace -scheme AGIWorkforce -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: IOS_APP_BINARY.release,
      build: `xcodebuild -workspace ios/AGIWorkforce.xcworkspace -scheme AGIWorkforce -configuration Release -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath ios/build ONLY_ACTIVE_ARCH=YES ARCHS=${simulatorArch}`,
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: ANDROID_APP_BINARY.debug,
      build:
        'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug && cd ..',
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: ANDROID_APP_BINARY.release,
      build:
        'cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release && cd ..',
    },
  },

  devices: {
    'ios.sim': {
      type: 'ios.simulator',
      device: iosUdid
        ? { id: iosUdid }
        : { type: process.env[DETOX_IOS_DEVICE_ENV] || DEFAULT_IOS_DEVICE },
    },
    'android.emu': {
      type: 'android.emulator',
      device: {
        avdName: androidAvd,
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
    'android.emu.release': {
      device: 'android.emu',
      app: 'android.release',
    },
  },
};
