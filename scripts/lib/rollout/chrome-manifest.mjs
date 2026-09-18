/**
 * Chrome permissions that widen what the extension can reach. A release may not
 * quietly acquire one: the store shows users a new warning, and a permission
 * nobody reviewed is the classic way an extension becomes a supply-chain risk.
 */
export const REQUIRED_MANIFEST_KEYS = [
  'manifest_version',
  'name',
  'version',
  'description',
  'permissions',
  'host_permissions',
  'content_security_policy',
  'background',
  'action',
  'icons',
];

const VERSION_PATTERN = /^\d{1,5}(\.\d{1,5}){0,3}$/;
const MANIFEST_VERSION = 3;

export function manifestSchemaViolations(manifest) {
  const violations = [];
  if (manifest === null || typeof manifest !== 'object') return ['manifest.json is not an object'];
  for (const key of REQUIRED_MANIFEST_KEYS) {
    if (!(key in manifest)) violations.push(`manifest.json is missing ${key}`);
  }
  if (manifest.manifest_version !== MANIFEST_VERSION) {
    violations.push(`manifest_version must be ${MANIFEST_VERSION}`);
  }
  if (typeof manifest.version !== 'string' || !VERSION_PATTERN.test(manifest.version)) {
    violations.push('version must be one to four dot-separated integers');
  }
  if (!Array.isArray(manifest.permissions)) violations.push('permissions must be an array');
  if (!Array.isArray(manifest.host_permissions)) {
    violations.push('host_permissions must be an array');
  }
  if (manifest.background && typeof manifest.background.service_worker !== 'string') {
    violations.push('background.service_worker must name the worker entry point');
  }
  if (manifest.background && manifest.background.type !== 'module') {
    violations.push('background.type must be module so the worker can import its state modules');
  }
  const pages = manifest.content_security_policy?.extension_pages;
  if (typeof pages !== 'string' || pages === '') {
    violations.push('content_security_policy.extension_pages must be set');
  } else {
    // Only the executable directives. `style-src 'unsafe-inline'` runs no code,
    // and banning it here would say nothing about what the extension can run.
    for (const directive of ['script-src', 'object-src', 'default-src']) {
      const value = new RegExp(`${directive} ([^;]+)`).exec(pages)?.[1] ?? '';
      if (/'unsafe-eval'|'unsafe-inline'|'wasm-unsafe-eval'/.test(value)) {
        violations.push(`content_security_policy ${directive} allows ${value.trim()}`);
      }
    }
  }
  for (const host of manifest.host_permissions ?? []) {
    if (host === '<all_urls>' || host === 'http://*/*' || host === 'https://*/*') {
      violations.push(
        `host_permissions grants ${host}; a blanket grant belongs in optional_host_permissions`,
      );
    }
  }
  return violations;
}

function permissionSet(manifest) {
  return {
    permissions: [...(manifest.permissions ?? [])].sort(),
    host_permissions: [...(manifest.host_permissions ?? [])].sort(),
    optional_permissions: [...(manifest.optional_permissions ?? [])].sort(),
    optional_host_permissions: [...(manifest.optional_host_permissions ?? [])].sort(),
  };
}

function added(previous, next) {
  return next.filter((entry) => !previous.includes(entry));
}

/**
 * What this release asks for that the published one did not. Removals are
 * reported but never block: giving a permission back is always safe.
 */
export function permissionDiff(previousManifest, nextManifest) {
  const previous = permissionSet(previousManifest);
  const next = permissionSet(nextManifest);
  const diff = { added: {}, removed: {} };
  for (const field of Object.keys(next)) {
    const gained = added(previous[field], next[field]);
    const lost = added(next[field], previous[field]);
    if (gained.length > 0) diff.added[field] = gained;
    if (lost.length > 0) diff.removed[field] = lost;
  }
  return diff;
}

export function permissionDiffViolations(diff, approved = []) {
  const violations = [];
  for (const [field, entries] of Object.entries(diff.added)) {
    for (const entry of entries) {
      if (approved.includes(`${field}:${entry}`)) continue;
      violations.push(
        `${field} gains ${entry} against the published release; every new grant needs a ` +
          'reviewed entry in the approved-permissions list',
      );
    }
  }
  return violations;
}
