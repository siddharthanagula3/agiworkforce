export function isDevOrTestRuntime(): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  if (typeof process === 'undefined') return false;
  const env = process.env;
  return env?.NODE_ENV === 'test' || env?.EXPO_PUBLIC_APP_ENV === 'development';
}

export function isReleaseRuntime(): boolean {
  return !isDevOrTestRuntime();
}
