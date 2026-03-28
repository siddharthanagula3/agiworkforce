/* eslint-disable */
// Fix jest-expo setup.js crash: "Object.defineProperty called on non-object"
// jest-expo@52.x expects UIManager to exist on mockNativeModules before its
// setup runs. This file runs via `setupFiles` (before preset setup) to
// provide the missing global.
const { NativeModules } = require('react-native');

process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';

if (!NativeModules.UIManager) {
  NativeModules.UIManager = {};
}
if (!NativeModules.UIManager.getViewManagerConfig) {
  NativeModules.UIManager.getViewManagerConfig = () => ({});
}
