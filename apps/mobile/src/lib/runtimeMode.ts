/**
 * Fail-closed build classification for security gates.
 *
 * A runtime counts as dev/test only on an explicit signal. Anything else — a
 * release build whose NODE_ENV was never set, an EAS profile that does not
 * declare it — is treated as a release runtime, so a missing env var can never
 * silently disable a gate that only release builds are supposed to run.
 */
export function isDevOrTestRuntime(): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  if (typeof process === 'undefined') return false;
  const env = process.env;
  return env?.NODE_ENV === 'test' || env?.EXPO_PUBLIC_APP_ENV === 'development';
}

export function isReleaseRuntime(): boolean {
  return !isDevOrTestRuntime();
}
