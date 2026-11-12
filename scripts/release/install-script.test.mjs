import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const INSTALLER = path.join(REPO_ROOT, 'apps/web/public/install.sh');
const ARCHIVE = 'agiworkforce-linux-x64.tar.gz';

const roots = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PINNED_KEY = publicKey.export({ type: 'spki', format: 'pem' }).trim();

function executable(file, body) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

function versionBinary(output, exitCode = 0) {
  return `#!/bin/sh\necho '${output}'\nexit ${exitCode}\n`;
}

/**
 * A release served from fixture files: a fake curl answers each download URL
 * with the file of the same name, uname reports a glibc Linux x64 host, and
 * the installer pins a key generated for this test.
 */
function release({ agi, alias = agi, tamper = false }) {
  const root = mkdtempSync(path.join(tmpdir(), 'install-script-'));
  roots.push(root);
  const bin = path.join(root, 'bin');
  const served = path.join(root, 'served');
  const stage = path.join(root, 'stage');
  const home = path.join(root, 'home');
  for (const dir of [bin, served, stage, home]) mkdirSync(dir, { recursive: true });

  executable(
    path.join(bin, 'curl'),
    [
      '#!/bin/bash',
      'out="" url=""',
      'while [ $# -gt 0 ]; do',
      '  case "$1" in',
      '    -o) out="$2"; shift 2 ;;',
      '    http*) url="$1"; shift ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      `source_file="${served}/\${url##*/}"`,
      '[ -n "$out" ] && [ -f "$source_file" ] || exit 22',
      'cp "$source_file" "$out"',
      '',
    ].join('\n'),
  );
  executable(
    path.join(bin, 'uname'),
    '#!/bin/sh\ncase "$1" in -s) echo Linux ;; -m) echo x86_64 ;; *) echo Linux ;; esac\n',
  );
  executable(path.join(bin, 'ldd'), '#!/bin/sh\necho "ldd (GNU libc) 2.39"\n');

  executable(path.join(stage, 'agi'), agi);
  if (alias !== null) executable(path.join(stage, 'agiworkforce'), alias);
  const tar = spawnSync('tar', ['-czf', path.join(served, ARCHIVE), '-C', stage, '.']);
  assert.equal(tar.status, 0, String(tar.stderr));

  const archiveBytes = readFileSync(path.join(served, ARCHIVE));
  const manifest = `${createHash('sha256').update(archiveBytes).digest('hex')}  ${ARCHIVE}\n`;
  writeFileSync(path.join(served, 'SHA256SUMS'), manifest);
  writeFileSync(
    path.join(served, 'SHA256SUMS.sig'),
    sign('sha256', Buffer.from(manifest), privateKey),
  );
  if (tamper)
    writeFileSync(path.join(served, ARCHIVE), Buffer.concat([archiveBytes, Buffer.from('x')]));

  const source = readFileSync(INSTALLER, 'utf8');
  assert.ok(source.includes("RELEASE_SIGNING_KEY=''"), 'the committed installer pins no key yet');
  const installer = path.join(root, 'install.sh');
  writeFileSync(
    installer,
    source.replace("RELEASE_SIGNING_KEY=''", `RELEASE_SIGNING_KEY='${PINNED_KEY}'`),
  );

  const installDir = path.join(root, 'install');
  return {
    installDir,
    run(version) {
      return spawnSync(
        'bash',
        [installer, '--version', version, '--install-dir', installDir, '--no-modify-path'],
        {
          encoding: 'utf8',
          env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, SHELL: '/bin/bash' },
        },
      );
    },
  };
}

function existingInstall(installDir) {
  mkdirSync(installDir, { recursive: true });
  writeFileSync(path.join(installDir, 'agi'), 'previous agi\n');
  writeFileSync(path.join(installDir, 'agiworkforce'), 'previous alias\n');
}

function assertUntouched(installDir) {
  assert.equal(readFileSync(path.join(installDir, 'agi'), 'utf8'), 'previous agi\n');
  assert.equal(readFileSync(path.join(installDir, 'agiworkforce'), 'utf8'), 'previous alias\n');
}

test('a signed build that reports the requested version is installed', () => {
  const fixture = release({ agi: versionBinary('agi 2.0.0') });
  existingInstall(fixture.installDir);
  const result = fixture.run('2.0.0');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed agi 2\.0\.0/);
  assert.equal(
    readFileSync(path.join(fixture.installDir, 'agi'), 'utf8'),
    versionBinary('agi 2.0.0'),
  );
});

test('an older signed build served under a newer version is refused and nothing is replaced', () => {
  const fixture = release({ agi: versionBinary('agi 1.0.0') });
  existingInstall(fixture.installDir);
  const result = fixture.run('2.0.0');
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Release 2\.0\.0 contains a agi that reports version 1\.0\.0; refusing/,
  );
  assertUntouched(fixture.installDir);
});

test('a refused build leaves no install directory behind', () => {
  const fixture = release({ agi: versionBinary('agi 1.0.0') });
  const result = fixture.run('2.0.0');
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(fixture.installDir), false);
});

test('a compatibility alias from another version is refused before either binary moves', () => {
  const fixture = release({ agi: versionBinary('agi 2.0.0'), alias: versionBinary('agi 1.0.0') });
  existingInstall(fixture.installDir);
  const result = fixture.run('2.0.0');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contains a agiworkforce that reports version 1\.0\.0/);
  assertUntouched(fixture.installDir);
});

test('a binary that does not run is refused', () => {
  const fixture = release({ agi: versionBinary('agi 2.0.0', 1) });
  existingInstall(fixture.installDir);
  const result = fixture.run('2.0.0');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /The downloaded agi did not run, so nothing was installed/);
  assertUntouched(fixture.installDir);
});

test('a version reported with terminal control bytes is refused and printed without them', () => {
  const fixture = release({ agi: "#!/bin/sh\nprintf 'agi 2.0.0\\033[2J\\n'\n" });
  existingInstall(fixture.installDir);
  const result = fixture.run('2.0.0');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /\x1b\[2J/);
  assertUntouched(fixture.installDir);
});

test('an archive that no longer matches the signed checksum is still refused first', () => {
  const fixture = release({ agi: versionBinary('agi 2.0.0'), tamper: true });
  existingInstall(fixture.installDir);
  const result = fixture.run('2.0.0');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Archive checksum verification failed/);
  assertUntouched(fixture.installDir);
});
