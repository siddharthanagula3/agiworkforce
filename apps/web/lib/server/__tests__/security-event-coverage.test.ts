import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  IDENTITY_SECURITY_EVENT_KEYS,
  IDENTITY_SECURITY_EVENTS,
} from '@/lib/services/identity-events/catalogue';

const WEB_ROOT = path.resolve(__dirname, '../../..');
const SEARCH_ROOTS = ['app', 'lib', 'features'];
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', '__tests__']);

function sourceFiles(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry)) sourceFiles(full, collected);
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) continue;
    collected.push(full);
  }
  return collected;
}

const PRODUCT_FILES = SEARCH_ROOTS.flatMap((root) => sourceFiles(path.join(WEB_ROOT, root)));

/** `event: '<key>'` as every emit and handle call site writes it. */
const EVENT_LITERAL = /\bevent:\s*'([a-z_]+)'/g;

function raisedEvents(): Set<string> {
  const raised = new Set<string>();
  for (const file of PRODUCT_FILES) {
    const source = readFileSync(file, 'utf8');
    if (!/IdentitySecurityEvent\(/.test(source)) continue;
    for (const match of source.matchAll(EVENT_LITERAL)) raised.add(match[1] as string);
  }
  return raised;
}

/**
 * Catalogued notices nothing raises yet, each with where the act happens today.
 * A notice with no source is a promise the account holder never collects, so an
 * entry here is a debt with an address, and a new one is a failure.
 */
const UNRAISED: Readonly<Record<string, string>> = {
  new_sign_in: 'the sign-in path records a login audit row and raises no notice',
  new_device: 'device_registrations is written by the device registration route without a notice',
  new_location: 'nothing compares the request location against previous sessions',
  password_changed: 'the identity provider owns the password change; no server route sees it',
  email_changed: 'the identity provider owns the email change; no server route sees it',
  passkey_added: 'passkeys are created by the provider SDK in the browser, with no server call',
  passkey_removed: 'passkeys are deleted by the provider SDK in the browser, with no server call',
  api_key_created: 'app/api/settings/api-keys/route.ts mints the key and raises no notice',
  api_key_revoked: 'the api-keys delete route revokes the key and raises no notice',
  identity_linked:
    'lib/server/identity-account.ts audits the link at the authentication boundary, where no notification transport is available',
  sso_connection_changed: 'no route edits an enterprise connection',
  recovery_requested: 'account recovery is started at the identity provider',
  account_deletion_scheduled:
    'app/api/user/delete-account/route.ts schedules the deletion and raises no notice',
};

describe('the identity security notices the product promises', () => {
  const raised = raisedEvents();

  it('sweeps a real tree, so an empty sweep cannot pass', () => {
    expect(PRODUCT_FILES.length).toBeGreaterThan(500);
    expect(raised.size).toBeGreaterThan(0);
  });

  it('raises every catalogued notice that has somewhere to raise it', () => {
    const silent = IDENTITY_SECURITY_EVENT_KEYS.filter((key) => !raised.has(key)).filter(
      (key) => !Object.hasOwn(UNRAISED, key),
    );

    expect(
      silent,
      `catalogued security notice(s) nothing raises: ${silent.join(', ')}. ` +
        'Raise it where the act happens, or say in the unraised list where the act happens today.',
    ).toEqual([]);
  });

  it('keeps the unraised list to notices that are declared and really are silent', () => {
    for (const [key, reason] of Object.entries(UNRAISED)) {
      expect(IDENTITY_SECURITY_EVENT_KEYS, `${key} is listed but not catalogued`).toContain(key);
      expect(raised.has(key), `${key} is raised now; its entry is stale`).toBe(false);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('never raises a notice the catalogue does not declare', () => {
    const invented = [...raised].filter(
      (key) => !(IDENTITY_SECURITY_EVENT_KEYS as readonly string[]).includes(key),
    );

    expect(invented, `undeclared security notice(s): ${invented.join(', ')}`).toEqual([]);
  });

  it('tells the account holder what to do when the act was not theirs', () => {
    for (const key of IDENTITY_SECURITY_EVENT_KEYS) {
      const spec = IDENTITY_SECURITY_EVENTS[key];
      expect(spec.title.length, `${key} has no title`).toBeGreaterThan(10);
      expect(spec.message, `${key} never says what to do`).toMatch(/not you/i);
      expect(spec.settingsSection.length, `${key} ends nowhere`).toBeGreaterThan(0);
    }
  });

  it('raises the three acts that end a way in, each from the route that performs it', () => {
    for (const key of ['two_factor_disabled', 'backup_codes_regenerated', 'identity_unlinked']) {
      expect(raised.has(key), `${key} is no longer raised`).toBe(true);
    }
  });
});
