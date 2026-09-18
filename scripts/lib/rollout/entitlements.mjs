const KEY_TRUE = /<key>([^<]+)<\/key>\s*<(true|false)\s*\/>/g;
const KEY_STRING = /<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g;

/**
 * Entitlements a Developer ID build must never carry: each one hands an
 * attacker the code-signing guarantee back. They are refused outright rather
 * than diffed, because no baseline update should be able to reintroduce them.
 */
export const FORBIDDEN_ENTITLEMENTS = [
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.cs.allow-dyld-environment-variables',
  'com.apple.security.cs.disable-executable-page-protection',
  'com.apple.security.get-task-allow',
];

export function parseEntitlements(plist) {
  const entitlements = {};
  for (const [, key, value] of plist.matchAll(KEY_TRUE)) entitlements[key] = value === 'true';
  for (const [, key, value] of plist.matchAll(KEY_STRING)) entitlements[key] = value;
  return entitlements;
}

/**
 * What changed against the reviewed baseline. A granted entitlement is a
 * release-blocking difference; a removed one is reported so the baseline can
 * follow rather than silently drifting ahead of it.
 */
export function diffEntitlements(baseline, current) {
  const granted = [];
  const revoked = [];
  const changed = [];
  for (const [key, value] of Object.entries(current)) {
    if (!(key in baseline)) {
      granted.push(key);
      continue;
    }
    if (baseline[key] !== value) changed.push(key);
  }
  for (const key of Object.keys(baseline)) {
    if (!(key in current)) revoked.push(key);
  }
  return { granted, revoked, changed };
}

export function entitlementViolations(baseline, current) {
  const violations = [];
  for (const key of FORBIDDEN_ENTITLEMENTS) {
    if (current[key] === true) {
      violations.push(`${key} is granted; it defeats the hardened runtime and may never ship`);
    }
  }
  const { granted, changed } = diffEntitlements(baseline, current);
  for (const key of granted) {
    violations.push(`${key} is not in the reviewed entitlement baseline`);
  }
  for (const key of changed) {
    violations.push(`${key} changed value against the reviewed entitlement baseline`);
  }
  return violations;
}
