import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'publish-cli.sh');

const PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64',
];

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
}

/**
 * A repository shaped like the one a release is cut from: the two manifests,
 * a changelog, the staged platform binaries, and a tag on the commit.
 */
function makeRelease({ version = '1.7.1', tag = 'v-cli-1.7.1', binaries = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'publish-cli-'));
  sandboxes.push(dir);
  const write = (rel, contents) => {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, contents, 'utf8');
  };
  write('apps/cli/Cargo.toml', `[package]\nname = "agiworkforce-cli"\nversion = "${version}"\n`);
  write('apps/cli/npm/package.json', JSON.stringify({ name: '@agiworkforce/cli', version }));
  write('CHANGELOG.md', `# Changelog\n\n## [${version}], 2026-09-20\n\n- The release.\n`);
  if (binaries) {
    for (const platform of PLATFORMS) {
      write(`dist/cli/${platform}/bin/agi`, `binary for ${platform}\n`);
      chmodSync(path.join(dir, `dist/cli/${platform}/bin/agi`), 0o755);
    }
  }
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'release@example.invalid');
  git(dir, 'config', 'user.name', 'Release');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'release');
  if (tag) git(dir, 'tag', tag);
  return dir;
}

/** Call one function out of the publish script against a fixture. */
function callGate(body, { cwd = REPO_ROOT, env = {} } = {}) {
  return spawnSync(
    'bash',
    ['-c', `set -euo pipefail\nPUBLISH_CLI_LIB_ONLY=1 source ${JSON.stringify(SCRIPT)}\n${body}`],
    { cwd, encoding: 'utf8', env: { ...process.env, ...env } },
  );
}

test('the script parses as bash', () => {
  const parsed = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test('a tag that is not v-cli-X.Y.Z never resolves to a version', () => {
  for (const tag of ['v1.7.1', 'v-cli-1.7', 'v-cli-1.7.1.2', 'v-cli-', 'cli-1.7.1']) {
    const run = callGate(`version_for_tag ${JSON.stringify(tag)}`);
    assert.notEqual(run.status, 0, `${tag} was accepted as a release tag`);
  }
  assert.equal(callGate('version_for_tag v-cli-1.7.1').stdout, '1.7.1');
  assert.equal(callGate('version_for_tag v-cli-2.0.0-rc.1').stdout, '2.0.0-rc.1');
});

test('a prerelease publishes to next and a release to latest', () => {
  assert.equal(callGate('expected_dist_tag 1.7.1').stdout, 'latest');
  assert.equal(callGate('expected_dist_tag 2.0.0-rc.1').stdout, 'next');
  assert.equal(callGate('expected_dist_tag 2.0.0+build.5').stdout, 'latest');
  assert.equal(callGate('expected_dist_tag 2.0.0-beta.1+build.5').stdout, 'next');
});

test('a dist-tag that contradicts the version is refused', () => {
  assert.equal(callGate('assert_dist_tag_matches_version 1.7.1 latest').status, 0);
  const wrong = callGate('assert_dist_tag_matches_version 2.0.0-rc.1 latest');
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /contradicts version/);
});

test('the tag, Cargo.toml and npm manifest must name one version', () => {
  assert.equal(callGate('assert_versions_agree 1.7.1 1.7.1 1.7.1').status, 0);
  const npmDrift = callGate('assert_versions_agree 1.7.1 1.7.0 1.7.1');
  assert.notEqual(npmDrift.status, 0);
  assert.match(npmDrift.stderr, /npm package.json version/);
  const tagDrift = callGate('assert_versions_agree 1.7.1 1.7.1 1.8.0');
  assert.notEqual(tagDrift.status, 0);
  assert.match(tagDrift.stderr, /release tag names/);
});

test('a dirty tree cannot be published', () => {
  const dir = makeRelease();
  assert.equal(callGate(`assert_clean_tree ${JSON.stringify(dir)}`).status, 0);
  writeFileSync(path.join(dir, 'apps/cli/npm/stray.txt'), 'left over\n');
  const dirty = callGate(`assert_clean_tree ${JSON.stringify(dir)}`);
  assert.notEqual(dirty.status, 0);
  assert.match(dirty.stderr, /tree is dirty/);
});

test('a commit that is not the release tag cannot be published', () => {
  const dir = makeRelease();
  assert.equal(callGate(`assert_release_ref ${JSON.stringify(dir)} v-cli-1.7.1`).status, 0);

  const missing = callGate(`assert_release_ref ${JSON.stringify(dir)} v-cli-9.9.9`);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /does not exist/);

  const untagged = callGate(`assert_release_ref ${JSON.stringify(dir)} ''`);
  assert.notEqual(untagged.status, 0);
  assert.match(untagged.stderr, /no release tag/);

  writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [1.7.1]\n\n- later\n');
  git(dir, 'commit', '-aqm', 'work after the tag');
  const moved = callGate(`assert_release_ref ${JSON.stringify(dir)} v-cli-1.7.1`);
  assert.notEqual(moved.status, 0);
  assert.match(moved.stderr, /is not the commit release tag/);
});

test('a version with no changelog entry cannot be published', () => {
  const dir = makeRelease();
  assert.equal(callGate(`assert_changelog_entry ${JSON.stringify(dir)} 1.7.1`).status, 0);
  const absent = callGate(`assert_changelog_entry ${JSON.stringify(dir)} 1.8.0`);
  assert.notEqual(absent.status, 0);
  assert.match(absent.stderr, /no entry naming/);
});

test('every platform ships or the release is refused', () => {
  const complete = makeRelease();
  assert.equal(callGate(`assert_platform_binaries ${JSON.stringify(complete)}`).status, 0);

  const partial = makeRelease();
  rmSync(path.join(partial, 'dist/cli/win32-arm64'), { recursive: true, force: true });
  const missing = callGate(`assert_platform_binaries ${JSON.stringify(partial)}`);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /win32-arm64/);

  const empty = makeRelease();
  rmSync(path.join(empty, 'dist/cli/linux-x64/bin/agi'));
  const hollow = callGate(`assert_platform_binaries ${JSON.stringify(empty)}`);
  assert.notEqual(hollow.status, 0);
  assert.match(hollow.stderr, /is empty/);
});

test('the receipt names the commit and a digest for every binary', () => {
  const dir = makeRelease();
  const receipt = callGate(`publish_receipt ${JSON.stringify(dir)} 1.7.1 latest`);
  assert.equal(receipt.status, 0, receipt.stderr);
  assert.match(receipt.stdout, /@agiworkforce\/cli@1\.7\.1 -> npm dist-tag latest/);
  assert.match(receipt.stdout, new RegExp(`commit ${git(dir, 'rev-parse', 'HEAD')}`));
  for (const platform of PLATFORMS) {
    assert.match(
      receipt.stdout,
      new RegExp(`^[0-9a-f]{64}  ${platform}/agi$`, 'm'),
      `${platform} has no digest in the receipt`,
    );
  }
});

test('a dry run prints the plan and reaches no registry', () => {
  const dir = makeRelease();
  const npmStub = mkdtempSync(path.join(tmpdir(), 'publish-cli-stub-'));
  sandboxes.push(npmStub);
  writeFileSync(path.join(npmStub, 'npm'), '#!/bin/sh\necho "npm was invoked: $*" >&2\nexit 1\n');
  chmodSync(path.join(npmStub, 'npm'), 0o755);
  writeFileSync(path.join(npmStub, 'node'), `#!/bin/sh\nexec ${process.execPath} "$@"\n`);
  chmodSync(path.join(npmStub, 'node'), 0o755);

  const run = spawnSync('bash', [SCRIPT, '--dry-run'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${npmStub}:${process.env.PATH}`, RELEASE_TAG: 'v-cli-1.7.1' },
  });

  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.doesNotMatch(run.stderr, /npm was invoked/);
  assert.match(run.stdout, /@agiworkforce\/cli@1\.7\.1 -> latest/);
  assert.match(run.stdout, /@agiworkforce\/cli-win32-x64@1\.7\.1/);
  assert.match(run.stdout, /nothing was published/);
});

test('a dry run on a tree that fails a gate exits before printing a plan', () => {
  const dir = makeRelease({ tag: null });
  const run = spawnSync('bash', [SCRIPT, '--dry-run'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, RELEASE_TAG: '' },
  });
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(run.stdout, /Packages to publish/);
});
