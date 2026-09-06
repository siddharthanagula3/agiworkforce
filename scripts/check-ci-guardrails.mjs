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

// For assertions on a YAML block Prettier may reflow between one line and many.
// A literal substring pins the formatter's current choice, so the guard breaks on
// a reformat that changed nothing it cares about.
function requireMatches(relativePath, pattern, description) {
  if (!exists(relativePath)) {
    errors.push(`Missing required CI file: ${relativePath}`);
    return;
  }

  if (!pattern.test(readText(relativePath))) {
    errors.push(`${relativePath} must ${description}`);
  }
}

function requireNotIncludes(relativePath, forbidden) {
  // A missing file used to return silently, which turned every assertion over a
  // moved or deleted file into a permanent no-op that still reported green.
  if (!exists(relativePath)) {
    errors.push(
      `${relativePath} is asserted not to include ${JSON.stringify(forbidden)} but does not exist; delete the assertion or fix the path`,
    );
    return;
  }
  const body = readText(relativePath);
  if (body.includes(forbidden)) {
    errors.push(`${relativePath} must not include ${JSON.stringify(forbidden)}`);
  }
}

function requireOnlyAfter(relativePath, anchor, expected) {
  if (!exists(relativePath)) {
    errors.push(`Missing required CI file: ${relativePath}`);
    return;
  }
  const body = readText(relativePath);
  const anchorIndex = body.indexOf(anchor);
  if (anchorIndex === -1) {
    errors.push(`${relativePath} must include anchor ${JSON.stringify(anchor)}`);
    return;
  }
  if (body.slice(0, anchorIndex).includes(expected)) {
    errors.push(
      `${relativePath} must keep ${JSON.stringify(expected)} inside or after ${JSON.stringify(anchor)}`,
    );
  }
  if (!body.slice(anchorIndex).includes(expected)) {
    errors.push(
      `${relativePath} must include ${JSON.stringify(expected)} after ${JSON.stringify(anchor)}`,
    );
  }
}

requireIncludes('.github/workflows/repo-operability.yml', 'pull_request:');
requireIncludes('.github/workflows/repo-operability.yml', 'bash scripts/check-node-version.sh');
requireIncludes('.github/workflows/repo-operability.yml', 'pnpm install --frozen-lockfile');
requireIncludes('.github/workflows/repo-operability.yml', 'fetch-depth: 0');
requireIncludes(
  '.github/workflows/repo-operability.yml',
  'pnpm exec turbo run build lint test typecheck --dry=json',
);
requireIncludes('.github/workflows/repo-operability.yml', 'pnpm check:audit-inventory');
requireIncludes('.github/workflows/repo-operability.yml', 'pnpm check:ui-gaps');
requireIncludes('.github/workflows/repo-operability.yml', 'pnpm check:ui-gaps:monotonic');
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
requireIncludes(
  '.github/workflows/ci.yml',
  'cargo test -p agiworkforce-model-registry --test auto_route_conformance',
);
requireIncludes('.github/workflows/ci.yml', 'pnpm check:module-reachability');
requireIncludes('.github/workflows/ci.yml', 'run: pnpm check:no-hex-mobile');
requireIncludes(
  '.github/workflows/ci.yml',
  'run: pnpm --filter @agiworkforce/web check:no-hex-web',
);
requireIncludes('.github/workflows/ci.yml', 'pnpm exec turbo run typecheck --affected');
requireIncludes('.github/workflows/ci.yml', 'pnpm test:affected');
requireIncludes('.github/workflows/ci.yml', 'pnpm exec turbo run build --affected');
requireIncludes('package.json', '"test": "turbo run test --concurrency=2"');
requireIncludes('package.json', '"test:affected": "turbo run test --affected --concurrency=2"');
for (const gate of [
  'pnpm check:model-catalog',
  'pnpm check:model-id-literals',
  'pnpm check:marketing-models',
]) {
  requireIncludes('package.json', gate);
}
requireIncludes('.github/workflows/ci.yml', 'pnpm check:protocol-types');
requireIncludes('.github/workflows/ci.yml', 'image: postgres:16-alpine');
requireIncludes('.github/workflows/ci.yml', 'pnpm db:migrate -- apply --target ci');
requireIncludes('.github/workflows/ci.yml', 'pnpm db:migrate -- verify');
requireIncludes('.github/workflows/ci.yml', 'pnpm db:rls-probe -- --target ci');
requireIncludes('.github/workflows/ci.yml', 'node scripts/production-deploy-scope.mjs');
requireIncludes('.github/workflows/ci.yml', 'web_changed: ${{ steps.scope.outputs.web }}');
requireIncludes(
  '.github/workflows/ci.yml',
  'extension_changed: ${{ steps.scope.outputs.extension }}',
);
requireIncludes('.github/workflows/ci.yml', 'vscode_changed: ${{ steps.scope.outputs.vscode }}');
requireIncludes('.github/workflows/ci.yml', 'mobile_changed: ${{ steps.scope.outputs.mobile }}');
requireIncludes('.github/workflows/ci.yml', "if: needs.scope.outputs.native_changed == 'true'");
requireIncludes('.github/workflows/ci.yml', "if: needs.scope.outputs.web_changed == 'true'");
requireIncludes('.github/workflows/ci.yml', '--filter=@agiworkforce/web');
requireIncludes('.github/workflows/ci.yml', '--filter=agi-workforce');
requireIncludes('.github/workflows/ci.yml', 'pnpm --filter agi-workforce package');
requireIncludes('.github/workflows/ci.yml', 'pnpm --filter @agiworkforce/extension package');
requireIncludes('.github/workflows/ci.yml', 'cargo deny check bans sources licenses');
requireIncludes('.github/workflows/ci.yml', 'cargo deny check advisories');
requireIncludes(
  '.github/workflows/ci.yml',
  'cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib',
);
requireIncludes('.github/workflows/ci.yml', 'bash apps/desktop/check-wiring.sh');
requireIncludes('.github/workflows/ci.yml', 'cargo test -p agiworkforce-cli');
requireNotIncludes(
  '.github/workflows/ci.yml',
  'cargo test -p agiworkforce-desktop -p agiworkforce-cli --lib',
);
requireIncludes('.github/workflows/ci.yml', 'pnpm --filter @agiworkforce/extension test:e2e');
requireIncludes(
  '.github/workflows/ci.yml',
  'xvfb-run --auto-servernum pnpm --filter agi-workforce test:integration',
);
requireIncludes(
  '.github/workflows/ci.yml',
  'pnpm --filter @agiworkforce/mobile exec detox build --configuration ios.sim.release',
);
requireIncludes('.github/workflows/ci.yml', 'pnpm --filter @agiworkforce/mobile test:e2e:ios:ci');
requireIncludes(
  '.github/workflows/ci.yml',
  'pnpm exec playwright test public-auth-clean.spec.ts checkout.spec.ts --project=chromium --workers=1',
);
requireIncludes('apps/mobile/detox.config.js', 'ONLY_ACTIVE_ARCH=YES');
requireIncludes('apps/mobile/detox.config.js', 'DETOX_IOS_DEVICE');
requireIncludes('apps/mobile/package.json', '"test:e2e:ios:ci"');
requireIncludes(
  'apps/mobile/scripts/screenshots/specs/ci-smoke.spec.ts',
  "by.id('onboarding-hero-screen')",
);
requireIncludes('.github/workflows/ci.yml', '--project=visual-regression');
requireIncludes('.github/workflows/ci.yml', '--project=accessibility-audit');
requireIncludes('.github/workflows/ci.yml', 'pnpm --filter @agiworkforce/web a11y:audit');
requireIncludes('apps/desktop/playwright.config.ts', "name: 'visual-regression'");
requireIncludes('apps/desktop/playwright.config.ts', "testMatch: '**/visual-regression.spec.ts'");
requireNotIncludes('apps/desktop/playwright.config.ts', "name: 'visual-verification'");
requireIncludes('apps/desktop/playwright.config.ts', "name: 'accessibility-audit'");
requireIncludes('apps/desktop/playwright.config.ts', "testMatch: '**/accessibility-audit.spec.ts'");

requireIncludes('.github/workflows/deploy-production.yml', "workflows: ['CI']");
requireIncludes(
  '.github/workflows/deploy-production.yml',
  "github.event.workflow_run.conclusion == 'success'",
);
requireIncludes(
  '.github/workflows/deploy-production.yml',
  'github.event.workflow_run.head_repository.full_name == github.repository',
);
requireIncludes('.github/workflows/deploy-production.yml', 'vercel build --prod');
requireIncludes('.github/workflows/deploy-production.yml', 'vercel deploy --prebuilt --prod');
requireIncludes('.github/workflows/deploy-production.yml', 'vercel@58.4.0');
requireIncludes('.github/workflows/deploy-production.yml', 'environment=production');
requireIncludes('.github/workflows/deploy-production.yml', 'environment:');
requireIncludes('.github/workflows/deploy-production.yml', 'pnpm db:migrate -- verify');
requireIncludes('.dockerignore', '**/.env.*');
requireIncludes('.dockerignore', '**/node_modules');
requireIncludes('.dockerignore', '**/.next');
requireIncludes('.dockerignore', '**/target');
requireIncludes(
  '.github/workflows/deploy-signaling-server.yml',
  "github.event.workflow_run.conclusion == 'success'",
);
requireIncludes(
  '.github/workflows/deploy-signaling-server.yml',
  'Verify manually selected ref passed CI',
);
requireNotIncludes('.github/workflows/deploy-signaling-server.yml', "github.event_name == 'push'");

const vercelConfig = JSON.parse(readText('vercel.json'));
const gitDeploymentsOff =
  vercelConfig.git?.deploymentEnabled === false ||
  vercelConfig.git?.deploymentEnabled?.main === false;
if (!gitDeploymentsOff) {
  errors.push(
    'vercel.json must disable automatic main deployments so CI owns production promotion',
  );
}

const productionMutationOwners = new Set([
  '.github/workflows/deploy-production.yml',
  '.github/workflows/deploy-signaling-server.yml',
]);
const productionMutationPatterns = [
  /\bvercel(?:\s+deploy)?\s+[^\n]*--prod\b/,
  /\bflyctl\s+deploy\b/,
  /\brailway\s+up\b/,
];
const repositoryFiles = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {
    cwd: root,
    encoding: 'utf8',
  },
);
if (repositoryFiles.status !== 0) {
  errors.push('Unable to inventory repository files for production deployment bypasses');
} else {
  for (const relativePath of repositoryFiles.stdout.split('\0').filter(Boolean)) {
    if (
      productionMutationOwners.has(relativePath) ||
      relativePath.startsWith('docs/') ||
      relativePath.includes('.test.') ||
      relativePath === 'scripts/check-ci-guardrails.mjs'
    ) {
      continue;
    }

    let body;
    try {
      body = readText(relativePath);
    } catch {
      continue;
    }
    if (productionMutationPatterns.some((pattern) => pattern.test(body))) {
      errors.push(
        `${relativePath} contains a production mutation outside the CI-owned deploy workflows`,
      );
    }
  }
}

requireIncludes('.github/workflows/ci.yml', 'Semgrep (security audit)');

requireIncludes('.github/workflows/ci.yml', 'This is a broken scanner, not a clean scan');
requireIncludes('.github/workflows/ci.yml', 'semgrep==');
requireIncludes('.github/workflows/ci.yml', 'node scripts/check-semgrep-findings.mjs');
requireNotIncludes('.github/workflows/ci.yml', '--exclude-rule');
requireOnlyAfter(
  '.github/workflows/ci.yml',
  '      - name: Semgrep gate',
  'node scripts/check-semgrep-findings.mjs',
);

const semgrepAllowlist = spawnSync(
  process.execPath,
  ['scripts/check-semgrep-findings.mjs', '--allowlist-only'],
  { cwd: root, encoding: 'utf8' },
);
if (semgrepAllowlist.status !== 0) {
  errors.push(
    'scripts/semgrep-allowlist.json is malformed or has expired entries: ' +
      `${semgrepAllowlist.stdout ?? ''}${semgrepAllowlist.stderr ?? ''}`,
  );
}

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
  'softprops/action-gh-release@efb35369e0ad2afab669f228072c1b0d510eae64 # v3.0.3',
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
requireIncludes('.github/workflows/release-cli.yml', 'NPM_TOKEN is required for npm publication');
requireOnlyAfter(
  '.github/workflows/release-cli.yml',
  '  publish-npm:',
  'NPM_TOKEN is required for npm publication',
);
requireIncludes('.github/workflows/release-cli.yml', 'Smoke exact release archive (Unix)');
requireIncludes('.github/workflows/release-cli.yml', 'Smoke exact release archive (Windows)');
requireIncludes('.github/workflows/release-cli.yml', 'AGI_CLI_SMOKE_BINARY');
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
requireIncludes('.github/workflows/release-desktop.yml', 'Tauri updater signature');
requireNotIncludes('.github/workflows/release-desktop.yml', 'last shipped');
requireNotIncludes('.github/workflows/release-desktop.yml', '$249/yr');
requireNotIncludes('.github/workflows/release-desktop.yml', '${tag}...HEAD');
requireNotIncludes('.github/workflows/release-desktop.yml', 'windows-x64-artifacts');
requireNotIncludes('.github/workflows/release-desktop.yml', 'apps/desktop/src-tauri/target/');
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'target/release/bundle/appimage/*.AppImage',
);
requireIncludes('.github/workflows/release-desktop.yml', 'target/release/bundle/deb/*.deb');
requireIncludes('.github/workflows/release-desktop.yml', 'projectPath: apps/desktop');
requireIncludes(
  '.github/workflows/release-desktop.yml',
  "workspaces: 'apps/desktop/src-tauri -> target'",
);
requireIncludes('.github/workflows/release-desktop.yml', 'args: --bundles appimage,deb');
requireIncludes('.github/workflows/release-desktop.yml', 'includeUpdaterJson: false');
requireIncludes('.github/workflows/release-desktop.yml', 'Verify Linux release artifacts');
requireIncludes('.github/workflows/release-desktop.yml', 'minisign -Vm');
requireIncludes('.github/workflows/release-desktop.yml', 'dpkg-deb --info');
requireIncludes('.github/workflows/release-desktop.yml', 'runs-on: macos-15');
requireIncludes('.github/workflows/release-desktop.yml', 'name: macos-release');
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'target: aarch64-apple-darwin,x86_64-apple-darwin',
);
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'args: --target universal-apple-darwin --bundles app,dmg',
);
requireIncludes('.github/workflows/release-desktop.yml', 'APPLE_CERTIFICATE:');
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'echo "APPLE_API_KEY_PATH=${key_path}" >> "$GITHUB_ENV"',
);
requireIncludes('.github/workflows/release-desktop.yml', 'lipo "$main_executable" -verify_arch');
requireIncludes('.github/workflows/release-desktop.yml', 'lipo "${sidecars[0]}" -verify_arch');
requireIncludes('.github/workflows/release-desktop.yml', 'codesign --verify --deep --strict');
requireIncludes('.github/workflows/release-desktop.yml', 'spctl --assess --type execute');
requireIncludes('.github/workflows/release-desktop.yml', 'xcrun stapler validate');
requireIncludes('.github/workflows/release-desktop.yml', 'macos-universal-artifacts');
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'macos-universal-artifacts darwin-aarch64 .app.tar.gz',
);
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'macos-universal-artifacts darwin-x86_64 .app.tar.gz',
);
requireNotIncludes('.github/workflows/release-desktop.yml', '--no-sign');
requireNotIncludes('.github/workflows/release-desktop.yml', '--skip-stapling');
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
  'CHANNEL: ${{ needs.prepare-release.outputs.channel }}',
);
requireIncludes(
  'apps/web/db/neon/0079_desktop_release_channels.sql',
  "check (channel in ('stable', 'beta', 'nightly'))",
);
requireIncludes('apps/web/db/neon/0079_desktop_release_channels.sql', 'r.channel = p_channel');
requireIncludes(
  'apps/web/db/neon/0079_desktop_release_channels.sql',
  "p_is_prerelease <> (p_channel <> 'stable')",
);
requireIncludes(
  'apps/web/app/api/releases/[target]/[version]/route.ts',
  'fetchLatestDesktopRelease(channel)',
);
requireIncludes(
  'apps/web/lib/releases/github-desktop-releases.ts',
  "DESKTOP_RELEASE_CHANNELS = ['stable', 'beta', 'nightly']",
);
requireIncludes(
  '.github/workflows/release-desktop.yml',
  'needs: [prepare-release, build-linux, build-macos, publish-release]',
);
requireNotIncludes(
  '.github/workflows/release-desktop.yml',
  'needs: [prepare-release, build-linux, update-database]',
);
requireMatches(
  '.github/workflows/release-desktop.yml',
  /publish-release:[\s\S]*?needs:\s*\[\s*prepare-release,\s*build-linux,\s*build-macos,\s*clean-install-linux,\s*upgrade-from-previous-linux,?\s*\]/,
  'gate publish-release on both platform builds and both Linux smoke tests',
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
requireIncludes('.github/workflows/release-mobile.yml', "- 'v-mobile-*'");
requireIncludes('.github/workflows/release-mobile.yml', 'name: mobile-store-release');
requireIncludes('.github/workflows/release-mobile.yml', "EAS_CLI_VERSION: '21.4.0'");
requireIncludes('.github/workflows/release-mobile.yml', 'release:ios:prod -- --auto-submit');
requireIncludes('.github/workflows/release-mobile.yml', 'release:android:prod -- --auto-submit');
requireIncludes('.github/workflows/release-mobile.yml', 'release:verify-associations');
requireIncludes(
  '.github/workflows/release-mobile.yml',
  'ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS',
);
requireIncludes('.github/workflows/release-mobile.yml', 'ASC_API_PRIVATE_KEY_BASE64');
requireIncludes('.github/workflows/release-mobile.yml', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64');
requireNotIncludes('.github/workflows/release-mobile.yml', '--latest');
requireIncludes('apps/mobile/scripts/release/configure-ios-submit.sh', 'ASC_APP_ID must be');
requireIncludes(
  'apps/mobile/scripts/release/configure-ios-submit.sh',
  '.submit.production.ios.ascAppId',
);
requireIncludes(
  'apps/mobile/scripts/release/verify-production-associations.mjs',
  "redirect: 'manual'",
);
requireIncludes(
  'apps/mobile/scripts/release/verify-production-associations.mjs',
  'fingerprints do not match the protected Play signing value',
);
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
requireIncludes('apps/web/lib/api-host-route-contract.ts', "source: '/v1/chat/completions'");
requireIncludes('apps/web/next.config.ts', 'API_HOST_REWRITE_ROUTES.map');
requireNotIncludes('vercel.json', '"source": "/v1/chat/completions"');
requireIncludes('vercel.json', 'pnpm install --frozen-lockfile');
requireIncludes('vercel.json', 'pnpm install --frozen-lockfile');
requireNotIncludes('vercel.json', '--no-frozen-lockfile');
requireIncludes('apps/web/scripts/build-with-chat.sh', 'SCRIPT_DIR=');
requireNotIncludes('apps/web/scripts/build-with-chat.sh', 'cd ../..');

requireIncludes(
  'apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md',
  'vsce publish --azure-credential',
);
requireIncludes('apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md', 'December 1, 2026');
requireNotIncludes('apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md', '--pat');
requireIncludes('.github/workflows/release-vscode-extension.yml', "- 'v-vscode-*'");
requireIncludes(
  '.github/workflows/release-vscode-extension.yml',
  "grep -Eq '^v-vscode-[0-9]+\\.[0-9]+\\.[0-9]+$'",
);
requireIncludes(
  '.github/workflows/release-vscode-extension.yml',
  'does not match extension version',
);
requireIncludes(
  '.github/workflows/release-vscode-extension.yml',
  'pnpm --filter agi-workforce test:webview',
);
requireIncludes(
  '.github/workflows/release-vscode-extension.yml',
  'pnpm --dir apps/extension-vscode verify:package',
);
requireIncludes('.github/workflows/ci.yml', 'name: VS Code + CLI clean-profile E2E');
requireIncludes('.github/workflows/ci.yml', 'cargo build --locked -p agiworkforce-cli --bin agi');
requireIncludes(
  '.github/workflows/ci.yml',
  'AGI_VSCODE_E2E_CLI: ${{ github.workspace }}/target/debug/agi',
);
requireIncludes('.github/workflows/release-vscode-extension.yml', 'sha256sum --check');
requireIncludes('.github/workflows/release-vscode-extension.yml', 'name: vscode-marketplace');
requireIncludes('.github/workflows/release-vscode-extension.yml', 'id-token: write');
requireIncludes(
  '.github/workflows/release-vscode-extension.yml',
  'azure/login@7ddb5af1ef8758cf1353cf3b42f940aee27ba21c # v3.0.2',
);
requireIncludes('.github/workflows/release-vscode-extension.yml', '--azure-credential');
requireIncludes(
  '.github/workflows/release-vscode-extension.yml',
  '--packagePath "$GITHUB_WORKSPACE/$VSIX_PATH"',
);
requireNotIncludes('.github/workflows/release-vscode-extension.yml', 'VSCE_PAT');
requireNotIncludes('.github/workflows/release-vscode-extension.yml', '--pat');
requireNotIncludes('.github/workflows/release-vscode-extension.yml', '--skip-duplicate');
requireNotIncludes('.github/workflows/release-vscode-extension.yml', '--no-verify');
requireIncludes('apps/extension-vscode/.vscodeignore', '**/*.map');
requireNotIncludes('apps/extension-vscode/.vscodeignore', '!out/**');
requireIncludes('apps/extension-vscode/scripts/vsce-package.js', 'rejectDevelopmentArtifacts');
requireIncludes('apps/extension-vscode/scripts/vsce-package.js', 'PackageManager.None');
requireIncludes('apps/extension-vscode/scripts/verify-vsix.mjs', 'extension/package.json');
requireIncludes('apps/extension-vscode/scripts/verify-vsix.mjs', 'development-only or sensitive');
requireIncludes('apps/extension/package.json', 'node scripts/prepare-package.mjs');
requireIncludes(
  'apps/extension/scripts/prepare-package.mjs',
  "fs.rmSync(path.join(extensionRoot, 'extension.zip')",
);
requireIncludes(
  'apps/extension/scripts/prepare-package.mjs',
  'packageManifest.version !== chromeManifest.version',
);
requireIncludes('.github/workflows/release-chrome-extension.yml', "- 'v-ext-*'");
requireIncludes(
  '.github/workflows/release-chrome-extension.yml',
  "grep -Eq '^v-ext-[0-9]+\\.[0-9]+\\.[0-9]+$'",
);
requireIncludes('.github/workflows/release-chrome-extension.yml', 'does not match Chrome versions');
requireIncludes(
  '.github/workflows/release-chrome-extension.yml',
  'pnpm --filter @agiworkforce/extension test',
);
requireIncludes('.github/workflows/release-chrome-extension.yml', 'sha256sum --check');
requireIncludes('.github/workflows/release-chrome-extension.yml', 'name: chrome-web-store');
requireIncludes('.github/workflows/release-chrome-extension.yml', 'id-token: write');
requireIncludes(
  '.github/workflows/release-chrome-extension.yml',
  'google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093 # v3.0.0',
);
requireIncludes(
  '.github/workflows/release-chrome-extension.yml',
  'access_token_scopes: https://www.googleapis.com/auth/chromewebstore',
);
requireIncludes(
  '.github/workflows/release-chrome-extension.yml',
  'publish-chrome-web-store.mjs "$ARCHIVE_PATH"',
);
for (const forbiddenCredential of [
  'credentials_json',
  'SERVICE_ACCOUNT_KEY',
  'CLIENT_SECRET',
  'REFRESH_TOKEN',
]) {
  requireNotIncludes('.github/workflows/release-chrome-extension.yml', forbiddenCredential);
}
requireIncludes('apps/extension/scripts/publish-chrome-web-store.mjs', 'blockOnWarnings: true');
requireIncludes('apps/extension/scripts/publish-chrome-web-store.mjs', 'skipReview: false');
requireIncludes(
  'apps/extension/scripts/publish-chrome-web-store.mjs',
  '/upload/v2/${itemName}:upload',
);
requireIncludes('apps/extension/scripts/verify-package.mjs', 'validateReleaseManifest');

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
  const isolationPattern = tauriConfig.app?.security?.pattern;
  if (isolationPattern?.use !== 'isolation' || isolationPattern?.options?.dir !== 'isolation') {
    errors.push(
      `${tauriConfigPath} must route IPC through the compile-time Tauri isolation pattern`,
    );
  }
}
requireIncludes(
  'apps/desktop/src-tauri/isolation/index.html',
  '<script src="./isolation-hook.js"></script>',
);
requireIncludes(
  'apps/desktop/src-tauri/isolation/isolation-hook.js',
  "window, '__TAURI_ISOLATION_HOOK__'",
);
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
