/* global module */
const DETOX_IOS_UDID_ENV = 'DETOX_IOS_UDID';
const DETOX_IOS_DEVICE_ENV = 'DETOX_IOS_DEVICE';
const DETOX_ANDROID_AVD_ENV = 'DETOX_ANDROID_AVD';

const DEFAULT_IOS_DEVICE = 'iPhone 17 Pro';
const DEFAULT_ANDROID_AVD = 'pixel_8_api_34';

const APP_BUNDLE_ID = 'com.agiworkforce.app';

const IOS_APP_BINARY = {
  debug: 'ios/build/Build/Products/Debug-iphonesimulator/AGIWorkforce.app',
  release: 'ios/build/Build/Products/Release-iphonesimulator/AGIWorkforce.app',
};

const ANDROID_APP_BINARY = {
  debug: 'android/app/build/outputs/apk/debug/app-debug.apk',
  release: 'android/app/build/outputs/apk/release/app-release.apk',
};

module.exports = {
  DETOX_IOS_UDID_ENV,
  DETOX_IOS_DEVICE_ENV,
  DETOX_ANDROID_AVD_ENV,
  DEFAULT_IOS_DEVICE,
  DEFAULT_ANDROID_AVD,
  APP_BUNDLE_ID,
  IOS_APP_BINARY,
  ANDROID_APP_BINARY,
};
