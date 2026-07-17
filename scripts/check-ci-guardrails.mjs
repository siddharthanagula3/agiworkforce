#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireIncludes(relativePath, expected) {
  if (!exists(relativePath)) {
    errors.push(`Missing required CI file: ${relativePath}`);
    return;
  }

  const body = readText(relativePath);
  if (!body.includes(expected)) {
    errors.push(`${relativePath} must include ${JSON.stringify(expected)}`);
  }
}

function requireNotIncludes(relativePath, forbidden) {
  if (!exists(relativePath)) return;
  const body = readText(relativePath);
  if (body.includes(forbidden)) {
    errors.push(`${relativePath} must not include ${JSON.stringify(forbidden)}`);
  }
}

requireIncludes('.github/workflows/repo-operability.yml', 'pull_request:');
requireIncludes('.github/workflows/repo-operability.yml', 'bash scripts/check-node-version.sh');
requireIncludes('.github/workflows/repo-operability.yml', 'pnpm install --frozen-lockfile');
requireIncludes(
  '.github/workflows/repo-operability.yml',
  'pnpm exec turbo run build lint test typecheck --dry=json',
);
requireIncludes(
  '.github/workflows/repo-operability.yml',
  'needs: [validate-version, build, sign-release-assets]',
);
requireNotIncludes('.github/workflows/repo-operability.yml', 'needs: [build, sign-release-assets]');
requireIncludes('.github/workflows/repo-operability.yml', 'pnpm check:llm-operability');

requireIncludes('.github/workflows/ci.yml', 'python3 scripts/check-no-conflict-markers.py');
requireIncludes('.github/workflows/ci.yml', 'fetch-depth: 0');
requireIncludes('.github/workflows/ci.yml', 'pnpm audit --audit-level=critical');
requireIncludes('.github/workflows/ci.yml', 'pnpm audit --audit-level=high');
requireIncludes('.github/workflows/ci.yml', 'pnpm exec turbo run lint --affected');
requireIncludes('.github/workflows/ci.yml', 'pnpm check:module-reachability');
requireIncludes('.github/workflows/ci.yml', 'pnpm exec turbo run typecheck --affected');
requireIncludes('.github/workflows/ci.yml', 'pnpm exec turbo run test --affected');
requireIncludes('.github/workflows/ci.yml', 'pnpm exec turbo run build --affected');
requireIncludes('.github/workflows/ci.yml', 'pnpm check:protocol-types');
requireIncludes('.github/workflows/ci.yml', '--filter=@agiworkforce/web');
requireIncludes('.github/workflows/ci.yml', '--filter=agi-workforce');
requireIncludes('.github/workflows/ci.yml', 'pnpm --filter agi-workforce package');
requireIncludes('.github/workflows/ci.yml', 'pnpm --filter @agiworkforce/extension package');
// Rust dependency policy moved from cargo-audit to cargo-deny (2026-07-16):
// bans/sources/licenses gate merges; advisories report against the triaged
// baseline in docs/security/rust-dependency-advisories-2026-07-16.md.
requireIncludes('.github/workflows/ci.yml', 'cargo deny check bans sources licenses');
requireIncludes('.github/workflows/ci.yml', 'cargo deny check advisories');
requireIncludes(
  '.github/workflows/ci.yml',
  'cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib',
);
requireIncludes('.github/workflows/ci.yml', 'bash apps/desktop/check-wiring.sh');

requireIncludes('.github/workflows/ci.yml', 'Semgrep (security audit)');
requireIncludes('.github/workflows/ci.yml', 'continue-on-error: true');
requireIncludes('.github/workflows/ci.yml', 'TEMPORARY revert to advisory mode');
requireIncludes('.github/workflows/ci.yml', 'proper drive-to-zero');

requireIncludes(
  '.github/workflows/actions-pinned-check.yml',
  'All third-party actions are SHA-pinned',
);
requireIncludes(
  '.github/workflows/actions-pinned-check.yml',
  'VERIFY_ACTION_PIN_OBJECTS=1 bash scripts/check-action-pins.sh',
);
requireIncludes('.github/workflows/release-cli.yml', 'agiworkforce-*.${{ matrix.archive }}');
requireIncludes('.github/workflows/release-cli.yml', 'group: release-cli-${{ github.ref_name }}');
requireIncludes('.github/workflows/release-cli.yml', 'cancel-in-progress: false');
requireIncludes(
  '.github/workflows/release-cli.yml',
  'softprops/action-gh-release@3d0d9888cb7fd7b750713d6e236d1fcb99157228 # v3',
);
requireIncludes('.github/workflows/release-cli.yml', 'generate_release_notes: true');
requireNotIncludes('.github/workflows/release-cli.yml', 'body_path: CHANGELOG.md');
requireIncludes('.github/workflows/release-cli.yml', 'name: Validate CLI source');
requireIncludes('.github/workflows/release-cli.yml', 'cargo fmt --all -- --check');
requireIncludes(
  '.github/workflows/release-cli.yml',
  'cargo clippy -p agiworkforce-cli --lib -- -D warnings',
);
requireIncludes('.github/workflows/release-cli.yml', 'cargo test -p agiworkforce-cli');
requireIncludes(
  '.github/workflows/release-cli.yml',
  'cargo install cross --version 0.2.5 --locked',
);
requireIncludes('.github/workflows/release-cli.yml', 'needs: [validate-version, validate]');
requireIncludes('.github/workflows/release-cli.yml', 'npm_dist_tag:');
requireIncludes('.github/workflows/release-cli.yml', 'NPM_DIST_TAG:');
requireIncludes('.github/workflows/release-cli.yml', 'NPM_TOKEN is required before a CLI release');
requireIncludes(
  '.github/workflows/release-cli.yml',
  'prerelease: ${{ needs.validate-version.outputs.prerelease }}',
);
requireIncludes('scripts/publish-cli.sh', 'npm publish --access public --tag "$NPM_DIST_TAG"');
requireIncludes('scripts/publish-cli.sh', 'npm pack --dry-run');
requireNotIncludes('.github/workflows/release-desktop.yml', 'Available in v1.2.1');
requireIncludes('.github/workflows/release-desktop.yml', "format('v-desktop-{0}', inputs.version)");
requireIncludes('.github/workflows/release-desktop.yml', 'cancel-in-progress: false');
requireNotIncludes('.github/workflows/release-desktop.yml', 'Coming Q3 2026');
requireNotIncludes('.github/workflows/release-desktop.yml', '| Linux | x86_64 | Signed');
requireIncludes('.github/workflows/release-desktop.yml', 'Tauri updater-signature');
requireNotIncludes('.github/workflows/release-desktop.yml', 'last shipped');
requireNotIncludes('.github/workflows/release-desktop.yml', '$249/yr');
requireNotIncludes('.github/workflows/release-desktop.yml', '${tag}...HEAD');
requireNotIncludes('.github/workflows/release-desktop.yml', 'macos-universal-artifacts');
requireNotIncludes('.github/workflows/release-desktop.yml', 'windows-x64-artifacts');
requireNotIncludes('.github/workflows/release-desktop.yml', 'apps/desktop/src-tauri/target/');
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'target/release/bundle/appimage/*.AppImage',
);
requireIncludes('.github/workflows/release-desktop.yml', 'projectPath: apps/desktop');
requireIncludes(
  '.github/workflows/release-desktop.yml',
  "workspaces: 'apps/desktop/src-tauri -> target'",
);
requireIncludes('.github/workflows/release-desktop.yml', 'args: --bundles appimage');
requireIncludes('.github/workflows/release-desktop.yml', 'includeUpdaterJson: false');
requireIncludes('.github/workflows/release-desktop.yml', 'Verify Linux updater artifact pair');
requireIncludes('.github/workflows/release-desktop.yml', 'minisign -Vm');
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'NEON_DATABASE_URL is required before a desktop release',
);
requireIncludes('.github/workflows/release-desktop.yml', 'return 1');
requireIncludes('.github/workflows/release-desktop.yml', 'run: pnpm lint:extension');
requireIncludes('.github/workflows/release-desktop.yml', 'HAS_PRERELEASE=');
requireIncludes('.github/workflows/release-desktop.yml', 'stable channel requires a stable SemVer');
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'non-stable channels require a pre-release SemVer',
);
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'needs: [prepare-release, build-linux, publish-release]',
);
requireNotIncludes(
  '.github/workflows/release-desktop.yml',
  'needs: [prepare-release, build-linux, update-database]',
);
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'needs: [prepare-release, publish-release]',
);
requireIncludes(
  '.github/workflows/release-desktop.yml',
  "needs.publish-release.result != 'success'",
);

requireIncludes('apps/mobile/eas.json', '"beta"');
requireIncludes('apps/mobile/eas.json', '"buildType": "app-bundle"');
requireNotIncludes('apps/mobile/eas.json', '"ascAppId": "$ASC_APP_ID"');
requireNotIncludes('apps/mobile/eas.json', '"appleId": "$APPLE_ID"');
requireIncludes('apps/mobile/scripts/release/preflight.sh', 'EAS project is not linked');
requireIncludes('apps/mobile/scripts/release/preflight.sh', 'numeric ascAppId');
requireIncludes('apps/mobile/scripts/release/ios-beta.sh', 'PROFILE="beta"');
requireIncludes('apps/mobile/scripts/release/android-beta.sh', 'PROFILE="beta"');
for (const releaseScript of [
  'apps/mobile/scripts/release/ios-beta.sh',
  'apps/mobile/scripts/release/ios-prod.sh',
  'apps/mobile/scripts/release/android-beta.sh',
  'apps/mobile/scripts/release/android-prod.sh',
]) {
  requireIncludes(releaseScript, 'eas_build');
  requireIncludes(releaseScript, '--auto-submit');
  requireIncludes(releaseScript, '"${PROFILE}" "${AUTO_SUBMIT}"');
  requireNotIncludes(releaseScript, 'eas_submit');
  requireNotIncludes(releaseScript, '--latest');
}
for (const submitScript of [
  'apps/mobile/scripts/release/submit-ios.sh',
  'apps/mobile/scripts/release/submit-android.sh',
]) {
  requireIncludes(submitScript, 'provide --build-id or --path');
  requireNotIncludes(submitScript, 'ARGS+=(--latest)');
  requireNotIncludes(submitScript, 'Defaults to the latest');
}
requireNotIncludes('scripts/release.sh', 'gh release create');
requireIncludes('scripts/release.sh', 'v-desktop-${VERSION}');

requireIncludes('vercel.json', '"path": "/api/cron/reset-credits"');
requireIncludes('vercel.json', '"source": "/v1/chat/completions"');
requireIncludes('vercel.json', 'pnpm install --frozen-lockfile');
requireIncludes('apps/web/vercel.json', 'pnpm install --frozen-lockfile');
requireNotIncludes('apps/web/vercel.json', '--no-frozen-lockfile');
requireIncludes('apps/web/scripts/build-with-chat.sh', 'SCRIPT_DIR=');
requireNotIncludes('apps/web/scripts/build-with-chat.sh', 'cd ../..');

requireIncludes(
  'apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md',
  'vsce publish --azure-credential',
);
requireIncludes('apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md', 'December 1, 2026');
requireNotIncludes('apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md', '--pat');
requireIncludes('apps/extension-vscode/.vscodeignore', '**/*.map');
requireNotIncludes('apps/extension-vscode/.vscodeignore', '!out/**');
requireIncludes('apps/extension-vscode/scripts/vsce-package.js', 'rejectDevelopmentArtifacts');
requireIncludes('apps/extension-vscode/scripts/vsce-package.js', 'PackageManager.None');
requireIncludes('apps/extension/package.json', 'node scripts/prepare-package.mjs');
requireIncludes(
  'apps/extension/scripts/prepare-package.mjs',
  "fs.rmSync(path.join(extensionRoot, 'extension.zip')",
);
requireIncludes(
  'apps/extension/scripts/prepare-package.mjs',
  'packageManifest.version !== chromeManifest.version',
);

requireIncludes('.github/workflows/build-windows-release.yml', 'group: release-desktop-windows\n');
requireIncludes(
  '.github/workflows/build-windows-release.yml',
  'ref: ${{ steps.resolve-tag.outputs.tag }}',
);
requireIncludes(
  '.github/workflows/build-windows-release.yml',
  'cargo install artifact-signing-cli --version 0.11.0 --locked',
);
requireIncludes('.github/workflows/build-windows-release.yml', 'AZURE_ARTIFACT_SIGNING_ENDPOINT:');
requireIncludes('.github/workflows/build-windows-release.yml', 'AZURE_CLIENT_ID:');
requireIncludes(
  '.github/workflows/build-windows-release.yml',
  'NEON_DATABASE_URL is required before a Windows desktop release',
);
requireIncludes(
  '.github/workflows/build-windows-release.yml',
  'Tauri updater signing credentials are required before a Windows desktop release',
);
requireNotIncludes('.github/workflows/build-windows-release.yml', 'WINDOWS_CERTIFICATE:');
requireNotIncludes('.github/workflows/build-windows-release.yml', 'Import-PfxCertificate');
requireIncludes('.github/workflows/build-windows-release.yml', 'Get-AuthenticodeSignature');
requireIncludes('.github/workflows/build-windows-release.yml', 'gh release upload');
requireIncludes('.github/workflows/build-windows-release.yml', 'PACKAGE_VERSION=');
requireIncludes('.github/workflows/build-windows-release.yml', 'public.upsert_release');
requireNotIncludes('.github/workflows/build-windows-release.yml', 'apps/desktop/src-tauri/target/');
requireIncludes(
  '.github/workflows/build-windows-release.yml',
  'target/release/bundle/nsis/*.exe.sig',
);
requireNotIncludes('.github/workflows/build-windows-release.yml', '.nsis.zip');
requireIncludes('.github/workflows/build-windows-release.yml', 'projectPath: apps/desktop');
requireIncludes(
  '.github/workflows/build-windows-release.yml',
  "workspaces: 'apps/desktop/src-tauri -> target'",
);
requireIncludes('.github/workflows/build-windows-release.yml', '--bundles nsis');
requireNotIncludes(
  '.github/workflows/build-windows-release.yml',
  'releaseId: ${{ steps.get-release.outputs.release_id }}',
);

const tauriConfigPath = 'apps/desktop/src-tauri/tauri.conf.json';
if (!exists(tauriConfigPath)) {
  errors.push(`Missing required desktop config: ${tauriConfigPath}`);
} else {
  const tauriConfig = JSON.parse(readText(tauriConfigPath));
  if (tauriConfig.bundle?.createUpdaterArtifacts !== true) {
    errors.push(`${tauriConfigPath} must set bundle.createUpdaterArtifacts to true`);
  }
}
requireNotIncludes('.github/workflows/ci.yml', '--filter web');

const actionPins = spawnSync('bash', ['scripts/check-action-pins.sh'], {
  cwd: root,
  env: { ...process.env, VERIFY_ACTION_PIN_OBJECTS: '0' },
  stdio: 'inherit',
});
if (actionPins.status !== 0) {
  errors.push('scripts/check-action-pins.sh failed');
}

if (errors.length > 0) {
  console.error('CI guardrail check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('CI guardrail check passed.');
