import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Resolved from this file, not from `process.cwd()`, so the suite behaves the
 * same however it is invoked, from `apps/desktop`, from the repo root, or from
 * a CI step that sets its own working directory.
 *
 * Note what this file can and cannot tell you: it reads the working tree, so a
 * green run means the tree is coherent, never that the release is. The updater
 * template that shipped dead through the whole 1.2.0 line would have passed
 * here the moment someone edited it, committed or not.
 */
const SRC_TAURI = resolve(import.meta.dirname, '../../src-tauri');

const conf = JSON.parse(readFileSync(resolve(SRC_TAURI, 'tauri.conf.json'), 'utf8')) as {
  productName: string;
  bundle: { createUpdaterArtifacts: boolean | string; macOS: { entitlements: string } };
  plugins: { updater: { endpoints: string[] } };
};

const entitlements = readFileSync(
  resolve(SRC_TAURI, conf.bundle.macOS.entitlements),
  'utf8',
).replace(/<!--[\s\S]*?-->/g, '');

/**
 * tauri-plugin-updater 2.10.0 resolves the URL placeholders from two separate
 * sources: `{{target}}` from `updater_os()` (updater.rs:1319-1325) and
 * `{{arch}}` from `updater_arch()` (:1332). The combined `{target}-{arch}`
 * string only exists in `pub fn target()` (:1311), which the URL path never
 * calls, so an endpoint carrying `{{target}}` alone requests a bare OS name.
 */
const UPDATER_OS = ['linux', 'darwin', 'windows'] as const;
const UPDATER_ARCH = ['i686', 'x86_64', 'arm', 'aarch64', 'riscv64'] as const;

/** Keys the release ingest publishes and /api/releases/[target]/[version] resolves. */
const INGESTED_TARGETS = [
  'darwin-aarch64',
  'darwin-x86_64',
  'windows-x86_64',
  'linux-x86_64',
] as const;

function renderEndpoint(endpoint: string, os: string, arch: string): string {
  return endpoint
    .replace(/\{\{target\}\}/g, os)
    .replace(/\{\{arch\}\}/g, arch)
    .replace(/\{\{current_version\}\}/g, '1.2.0');
}

/**
 * The shape of the artifacts this project publishes, which the server-side
 * asset selector in `apps/web/lib/releases/github-desktop-releases.ts` has to
 * match by filename. Both facts below are decided here, in desktop config, so
 * a change on this side silently breaks a selector on the other side unless it
 * is changed with it.
 */
describe('published updater artifact shape', () => {
  it('emits v2 updater artifacts, so Windows ships a bare installer and not a .nsis.zip', () => {
    // `"v1Compatible"` is the setting that produces the legacy `.nsis.zip`;
    // the tauri CLI deprecates it and drops it in v3. Under `true` the Windows
    // updater asset is `<productName>_<version>_x64-setup.exe` plus its `.sig`,
    // and the plugin sniffs the downloaded bytes rather than the file name
    // (updater.rs `extract`/`extract_exe`), so a raw PE is the correct artifact.
    expect(conf.bundle.createUpdaterArtifacts).toBe(true);
  });

  it('names the macOS updater archive with no architecture token', () => {
    // The macOS updater artifact is the `.app` directory tarred by
    // tauri-bundler's updater_bundle, which derives the name from the bundle's
    // own file_name, `${productName}.app.tar.gz`. The release builds one
    // universal binary (`--target universal-apple-darwin`), so the triple
    // appears in the output *directory*, never in the artifact name. Any
    // selector requiring `aarch64`, `arm64`, `x86_64` or `universal` in the
    // filename therefore matches nothing.
    expect(conf.productName).not.toMatch(/aarch64|arm64|x86_64|x64|amd64|universal/i);
  });
});

describe('macOS signing entitlements', () => {
  it('does not enable App Sandbox on the Developer ID build', () => {
    expect(entitlements).not.toContain('com.apple.security.app-sandbox');
  });

  it('carries no sandbox-only entitlement that a Developer ID build cannot honour', () => {
    for (const key of [
      'com.apple.security.files.user-selected',
      'com.apple.security.files.downloads',
      'com.apple.security.temporary-exception',
    ]) {
      expect(entitlements).not.toContain(key);
    }
  });

  it('keeps the hardened-runtime entitlements the app actually depends on', () => {
    for (const key of [
      'com.apple.security.cs.allow-jit',
      'com.apple.security.automation.apple-events',
      'com.apple.security.device.camera',
      'com.apple.security.device.audio-input',
    ]) {
      expect(entitlements).toContain(key);
    }
  });

  it('does not reintroduce the runtime protections that were deliberately removed', () => {
    for (const key of [
      'com.apple.security.cs.allow-unsigned-executable-memory',
      'com.apple.security.cs.disable-library-validation',
      'com.apple.security.cs.allow-dyld-environment-variables',
    ]) {
      expect(entitlements).not.toContain(key);
    }
  });
});

describe('updater endpoint target resolution', () => {
  const endpoints = conf.plugins.updater.endpoints;

  it('templates arch separately from target, as the plugin resolves them', () => {
    for (const endpoint of endpoints) {
      expect(endpoint).toContain('{{target}}');
      expect(endpoint).toContain('{{arch}}');
      expect(endpoint).toContain('{{current_version}}');
    }
  });

  it('never requests a bare operating-system name the release table cannot resolve', () => {
    for (const endpoint of endpoints) {
      for (const os of UPDATER_OS) {
        const bareOsPath = new URL(renderEndpoint(endpoint, os, 'aarch64')).pathname;
        expect(bareOsPath.split('/')).not.toContain(os);
      }
    }
  });

  it('resolves every shipped os/arch pair to a target the release ingest publishes', () => {
    for (const endpoint of endpoints) {
      for (const target of INGESTED_TARGETS) {
        const separator = target.lastIndexOf('-');
        const os = target.slice(0, separator);
        const arch = target.slice(separator + 1);
        expect(UPDATER_OS as readonly string[]).toContain(os);
        expect(UPDATER_ARCH as readonly string[]).toContain(arch);

        const { pathname } = new URL(renderEndpoint(endpoint, os, arch));
        expect(pathname.split('/')).toContain(target);
      }
    }
  });

  it('serves the updater over https so the signature is not the only integrity check', () => {
    for (const endpoint of endpoints) {
      expect(new URL(renderEndpoint(endpoint, 'darwin', 'aarch64')).protocol).toBe('https:');
    }
  });
});
