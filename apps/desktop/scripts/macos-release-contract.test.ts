import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const workflow = fs.readFileSync(
  path.join(repositoryRoot, '.github/workflows/release-desktop.yml'),
  'utf8',
);
const sidecarBuilder = fs.readFileSync(
  path.join(import.meta.dirname, 'build-native-messaging-host.mjs'),
  'utf8',
);
const infoPlist = fs.readFileSync(
  path.join(repositoryRoot, 'apps/desktop/src-tauri/Info.plist'),
  'utf8',
);

describe('macOS release contract', () => {
  it('builds one protected universal signed and notarized release', () => {
    expect(workflow).toContain('name: macos-release');
    expect(workflow).toContain('runs-on: macos-15');
    expect(workflow).toContain('target: aarch64-apple-darwin,x86_64-apple-darwin');
    expect(workflow).toContain('args: --target universal-apple-darwin --bundles app,dmg');
    expect(workflow).toContain('APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}');
    expect(workflow).toContain('echo "APPLE_API_KEY_PATH=${key_path}" >> "$GITHUB_ENV"');
    expect(workflow).not.toMatch(/build-macos:[\s\S]*--no-sign/u);
    expect(workflow).not.toMatch(/build-macos:[\s\S]*--skip-stapling/u);
  });

  it('verifies the complete Apple and updater trust boundary before publication', () => {
    expect(workflow).toContain('lipo "$main_executable" -verify_arch arm64 x86_64');
    expect(workflow).toContain('lipo "${sidecars[0]}" -verify_arch arm64 x86_64');
    expect(workflow).toContain('codesign --verify --deep --strict');
    expect(workflow).toContain('spctl --assess --type execute');
    expect(workflow).toContain('xcrun stapler validate "$app_path"');
    expect(workflow).toContain('xcrun stapler validate "${dmgs[0]}"');
    expect(workflow).toContain('minisign -Vm "${updaters[0]}"');
    expect(workflow).toContain('needs: [prepare-release, build-linux, build-macos]');
    expect(workflow).toContain('macos-universal-artifacts darwin-aarch64 .app.tar.gz');
    expect(workflow).toContain('macos-universal-artifacts darwin-x86_64 .app.tar.gz');
  });

  it('builds and combines both sidecar architectures for Tauri universal bundles', () => {
    expect(sidecarBuilder).toContain('process.env.TAURI_ENV_TARGET_TRIPLE');
    expect(sidecarBuilder).toContain("['aarch64-apple-darwin', 'x86_64-apple-darwin']");
    expect(sidecarBuilder).toContain("execFileSync('lipo', ['-create'");
    expect(sidecarBuilder).toContain("['arm64', 'x86_64']");
    expect(sidecarBuilder).toContain('path.join(targetDir, requestedTarget, profileDir)');
    expect(sidecarBuilder).toContain("path.join(universalBundleDir, 'native_messaging_host')");
  });

  it('leaves generated bundle versions under Tauri ownership', () => {
    expect(infoPlist).not.toContain('<key>CFBundleShortVersionString</key>');
    expect(infoPlist).not.toContain('<key>CFBundleVersion</key>');
  });
});
