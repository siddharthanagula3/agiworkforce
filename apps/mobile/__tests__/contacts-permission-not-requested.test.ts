/* eslint-disable @typescript-eslint/no-require-imports */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..');

const appConfig = require('../app.config.js') as {
  expo: { ios?: { infoPlist?: Record<string, unknown> }; android?: { permissions?: string[] } };
};

const SKIP_DIRS = new Set([
  'node_modules',
  'ios',
  'android',
  '__tests__',
  '.expo',
  'assets',
  'secrets',
  'dist',
  'build',
]);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

describe('mobile does not ask for Contacts access it never reads', () => {
  it('declares no Contacts usage description in the iOS Info.plist', () => {
    expect(appConfig.expo.ios?.infoPlist).toBeDefined();
    expect(
      Object.prototype.hasOwnProperty.call(
        appConfig.expo.ios?.infoPlist ?? {},
        'NSContactsUsageDescription',
      ),
    ).toBe(false);
  });

  it('requests no Android contacts permission', () => {
    for (const permission of appConfig.expo.android?.permissions ?? []) {
      expect(permission).not.toMatch(/CONTACTS/);
    }
  });

  it('imports expo-contacts from no shipped source file', () => {
    const offenders = sourceFiles(mobileRoot).filter((file) =>
      /from\s+'expo-contacts'|require\('expo-contacts'\)/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders.map((file) => file.slice(mobileRoot.length + 1))).toEqual([]);
  });

  it('offers no contacts entry in the permissions registry', () => {
    const { PERMISSION_KINDS, PERMISSION_REGISTRY } =
      require('../src/features/settings/permissions/registry') as {
        PERMISSION_KINDS: string[];
        PERMISSION_REGISTRY: Record<string, unknown>;
      };
    expect(PERMISSION_KINDS).not.toContain('contacts');
    expect(Object.keys(PERMISSION_REGISTRY)).not.toContain('contacts');
  });

  it('exports no contacts permission helper from device integrations', () => {
    const deviceIntegrations = require('../src/features/integrations/services/deviceIntegrations');
    expect(Object.keys(deviceIntegrations)).not.toContain('requestContactsPermission');
    expect(Object.keys(deviceIntegrations)).not.toContain('getContactsPermissionStatus');
  });
});
