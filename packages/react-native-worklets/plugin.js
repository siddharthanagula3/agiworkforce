// Stub Babel plugin for react-native-worklets/plugin.
// react-native-reanimated@3.16+ registers this as a Babel plugin peer dep.
// In Jest test environments the real worklets runtime is unavailable, so we
// return a no-op plugin that satisfies Babel's plugin contract without
// performing any transforms.
module.exports = function reactNativeWorkletsPlugin() {
  return { visitor: {} };
};
