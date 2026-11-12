import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  pinnedReleaseKeyFailures,
  pinnedReleaseKeys,
} from '../lib/rollout/pinned-release-keys.mjs';
import { exportPinnedReleaseKeys, pinReleaseKey } from './release-signing-key.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const INSTALLER = path.join(REPO_ROOT, 'apps/web/public/install.sh');
const KEY_SCRIPT = path.join(REPO_ROOT, 'scripts/release/release-signing-key.mjs');
const SIGNING_KEY_LINE = /^RELEASE_SIGNING_KEY='[^']*'$/mu;
const UNPINNED_FAILURE =
  'RELEASE_SIGNING_KEY pins no public key, so neither the installer nor agi update could verify a release';

const roots = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function scratch(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { privateKey, pem: publicKey.export({ type: 'spki', format: 'pem' }).trim() };
}

const TEST_KEY = keyPair();
const OWNER_KEY = keyPair();

function withSigningKey(source, value) {
  assert.match(source, SIGNING_KEY_LINE, 'install.sh keeps one RELEASE_SIGNING_KEY assignment');
  return source.replace(SIGNING_KEY_LINE, () => `RELEASE_SIGNING_KEY='${value}'`);
}

const COMMITTED = readFileSync(INSTALLER, 'utf8');
const UNPINNED = withSigningKey(COMMITTED, '');
const OWNER_PINNED = pinReleaseKey(UNPINNED, OWNER_KEY.pem).source;
const PINNED = pinnedReleaseKeys(COMMITTED).length > 0 ? COMMITTED : OWNER_PINNED;
const INSTALLER_STATES = [
  ['unpinned', UNPINNED],
  ['pinned', PINNED],
];

function executable(file, body) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

function versionBinary(output, exitCode = 0) {
  return `#!/bin/sh\necho '${output}'\nexit ${exitCode}\n`;
}

const HOSTS = {
  linux: { uname: ['Linux', 'x86_64'], archive: 'agiworkforce-linux-x64.tar.gz', exe: '' },
  darwin: { uname: ['Darwin', 'arm64'], archive: 'agiworkforce-darwin-arm64.tar.gz', exe: '' },
  windows: {
    uname: ['MINGW64_NT-10.0-26100', 'x86_64'],
    archive: 'agiworkforce-windows-x64.zip',
    exe: '.exe',
  },
};

const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * A release served from fixture files: a fake curl answers each download URL
 * with the file of the same name and logs it, uname reports the chosen host,
 * and the installer source carries the key the manifest is signed with.
 */
function release({
  agi,
  alias = agi,
  tamper = false,
  source = COMMITTED,
  signer = TEST_KEY,
  pinTestKey = true,
  host = 'linux',
  ldd = '#!/bin/sh\necho "ldd (GNU libc) 2.39"\n',
}) {
  const { uname, archive, exe } = HOSTS[host];
  const root = scratch('install-script-');
  const bin = path.join(root, 'bin');
  const served = path.join(root, 'served');
  const stage = path.join(root, 'stage');
  const home = path.join(root, 'home');
  const curlLog = path.join(root, 'curl.log');
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
      `echo "$url" >> "${curlLog}"`,
      `source_file="${served}/\${url##*/}"`,
      '[ -n "$out" ] && [ -f "$source_file" ] || exit 22',
      'cp "$source_file" "$out"',
      '',
    ].join('\n'),
  );
  executable(
    path.join(bin, 'uname'),
    `#!/bin/sh\ncase "$1" in -m) echo ${uname[1]} ;; *) echo ${uname[0]} ;; esac\n`,
  );
  executable(path.join(bin, 'ldd'), ldd);
  executable(path.join(bin, 'sysctl'), '#!/bin/sh\necho 0\n');

  executable(path.join(stage, `agi${exe}`), agi);
  if (alias !== null) executable(path.join(stage, `agiworkforce${exe}`), alias);
  if (exe) {
    writeFileSync(path.join(served, archive), 'zip fixture unpacked by the fake unzip\n');
    executable(
      path.join(bin, 'unzip'),
      `#!/bin/sh\nfor last; do :; done\ncp -p "${stage}"/* "$last"/\n`,
    );
    executable(
      path.join(bin, 'cygpath'),
      '#!/bin/sh\n[ "$1" = "-w" ] && printf \'C:\\\\Users\\\\tester\\\\.agi\\\\bin\\n\'\n',
    );
  } else {
    const tar = spawnSync('tar', ['-czf', path.join(served, archive), '-C', stage, '.']);
    assert.equal(tar.status, 0, String(tar.stderr));
  }

  const archiveBytes = readFileSync(path.join(served, archive));
  const manifest = `${createHash('sha256').update(archiveBytes).digest('hex')}  ${archive}\n`;
  writeFileSync(path.join(served, 'SHA256SUMS'), manifest);
  writeFileSync(
    path.join(served, 'SHA256SUMS.sig'),
    sign('sha256', Buffer.from(manifest), signer.privateKey),
  );
  if (tamper)
    writeFileSync(path.join(served, archive), Buffer.concat([archiveBytes, Buffer.from('x')]));

  const installer = path.join(root, 'install.sh');
  writeFileSync(installer, pinTestKey ? withSigningKey(source, TEST_KEY.pem) : source);

  const installDir = path.join(root, 'install');
  return {
    home,
    installDir,
    downloads() {
      return existsSync(curlLog) ? readFileSync(curlLog, 'utf8') : '';
    },
    run(version, { args = ['--no-modify-path'], shell = '/bin/bash', pathPrefix = [] } = {}) {
      const result = spawnSync(
        'bash',
        [installer, '--version', version, '--install-dir', installDir, ...args],
        {
          encoding: 'utf8',
          env: {
            PATH: [...pathPrefix, bin, '/usr/bin', '/bin'].join(':'),
            HOME: home,
            SHELL: shell,
          },
        },
      );
      return { ...result, text: result.stdout.replace(ANSI, '') };
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

for (const [state, source] of INSTALLER_STATES) {
  test(`${state} installer: a signed build that reports the requested version is installed`, () => {
    const fixture = release({ source, agi: versionBinary('agi 2.0.0') });
    existingInstall(fixture.installDir);
    const result = fixture.run('2.0.0');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.text, /Installed agi 2\.0\.0/);
    assert.equal(
      readFileSync(path.join(fixture.installDir, 'agi'), 'utf8'),
      versionBinary('agi 2.0.0'),
    );
  });

  test(`${state} installer: an older signed build served under a newer version is refused and nothing is replaced`, () => {
    const fixture = release({ source, agi: versionBinary('agi 1.0.0') });
    existingInstall(fixture.installDir);
    const result = fixture.run('2.0.0');
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /Release 2\.0\.0 contains a agi that reports version 1\.0\.0; refusing/,
    );
    assertUntouched(fixture.installDir);
  });

  test(`${state} installer: a refused build leaves no install directory behind`, () => {
    const fixture = release({ source, agi: versionBinary('agi 1.0.0') });
    const result = fixture.run('2.0.0');
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(fixture.installDir), false);
  });

  test(`${state} installer: a compatibility alias from another version is refused before either binary moves`, () => {
    const fixture = release({
      source,
      agi: versionBinary('agi 2.0.0'),
      alias: versionBinary('agi 1.0.0'),
    });
    existingInstall(fixture.installDir);
    const result = fixture.run('2.0.0');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /contains a agiworkforce that reports version 1\.0\.0/);
    assertUntouched(fixture.installDir);
  });

  test(`${state} installer: a binary that does not run is refused`, () => {
    const fixture = release({ source, agi: versionBinary('agi 2.0.0', 1) });
    existingInstall(fixture.installDir);
    const result = fixture.run('2.0.0');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /The downloaded agi did not run, so nothing was installed/);
    assertUntouched(fixture.installDir);
  });

  test(`${state} installer: a version reported with terminal control bytes is refused and printed without them`, () => {
    const fixture = release({ source, agi: "#!/bin/sh\nprintf 'agi 2.0.0\\033[2J\\n'\n" });
    existingInstall(fixture.installDir);
    const result = fixture.run('2.0.0');
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /\x1b\[2J/);
    assertUntouched(fixture.installDir);
  });

  test(`${state} installer: an archive that no longer matches the signed checksum is still refused first`, () => {
    const fixture = release({ source, agi: versionBinary('agi 2.0.0'), tamper: true });
    existingInstall(fixture.installDir);
    const result = fixture.run('2.0.0');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Archive checksum verification failed/);
    assertUntouched(fixture.installDir);
  });
}

test('the committed installer is either unpinned or pinned the documented way', () => {
  const failures = pinnedReleaseKeyFailures(COMMITTED);
  assert.ok(
    failures.length === 0 || (failures.length === 1 && failures[0] === UNPINNED_FAILURE),
    failures.join('; '),
  );
});

test('a key pinned with release-signing-key.mjs passes the pin guard and the release jobs read it back', () => {
  assert.deepEqual(pinnedReleaseKeyFailures(PINNED), []);
  const directory = path.join(scratch('pinned-keys-'), 'keys');
  assert.equal(exportPinnedReleaseKeys(PINNED, directory), 1);
  const exported = readFileSync(path.join(directory, '1.pem'), 'utf8');
  assert.match(exported, /^-----BEGIN PUBLIC KEY-----\n/);
  const key = createPublicKey(exported);
  assert.equal(key.asymmetricKeyDetails?.namedCurve, 'prime256v1');
  const parsed = spawnSync('openssl', ['pkey', '-pubin', '-in', path.join(directory, '1.pem')], {
    encoding: 'utf8',
  });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test('an unpinned installer fails the pin guard and gives the release jobs no key', () => {
  assert.deepEqual(pinnedReleaseKeyFailures(UNPINNED), [UNPINNED_FAILURE]);
  const directory = path.join(scratch('pinned-keys-'), 'keys');
  assert.equal(exportPinnedReleaseKeys(UNPINNED, directory), 0);
  assert.deepEqual(readdirSync(directory), []);
});

test('the installer verifies a release against the key the documented pin wrote', () => {
  const fixture = release({
    source: OWNER_PINNED,
    pinTestKey: false,
    signer: OWNER_KEY,
    agi: versionBinary('agi 2.0.0'),
  });
  const result = fixture.run('2.0.0');
  assert.equal(result.status, 0, result.stderr);
  const refused = release({
    source: OWNER_PINNED,
    pinTestKey: false,
    signer: TEST_KEY,
    agi: versionBinary('agi 2.0.0'),
  }).run('2.0.0');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Release signature verification failed/);
});

test('pinning a rotation key keeps the old one, and pinning a key twice changes nothing', () => {
  const rotation = keyPair();
  const rotated = pinReleaseKey(PINNED, rotation.pem);
  assert.equal(rotated.added, true);
  assert.deepEqual(pinnedReleaseKeyFailures(rotated.source), []);
  const directory = path.join(scratch('pinned-keys-'), 'keys');
  assert.equal(exportPinnedReleaseKeys(rotated.source, directory), 2);
  assert.equal(pinReleaseKey(rotated.source, rotation.pem).added, false);
});

test('the pin and export commands work on a copy of the installer', () => {
  const root = scratch('pin-command-');
  const copy = path.join(root, 'install.sh');
  const publicKey = path.join(root, 'agi-cli-release.pub');
  writeFileSync(copy, UNPINNED);
  writeFileSync(publicKey, `${OWNER_KEY.pem}\n`);
  const pinned = spawnSync('node', [KEY_SCRIPT, 'pin', publicKey, copy], { encoding: 'utf8' });
  assert.equal(pinned.status, 0, pinned.stderr);
  assert.match(pinned.stdout, /Pinned: 1 release signing key/);
  assert.deepEqual(pinnedReleaseKeyFailures(readFileSync(copy, 'utf8')), []);
  const keys = path.join(root, 'keys');
  const exported = spawnSync('node', [KEY_SCRIPT, 'export', keys, copy], { encoding: 'utf8' });
  assert.equal(exported.status, 0, exported.stderr);
  assert.deepEqual(readdirSync(keys), ['1.pem']);
});

test('a P-384 key is refused and the installer is left as it was', () => {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  assert.throws(
    () => pinReleaseKey(UNPINNED, publicKey.export({ type: 'spki', format: 'pem' })),
    /P-256/,
  );
});

function assertHintBeforeGetStarted(text, line) {
  const hint = text.indexOf('open a new terminal or run:');
  assert.ok(hint >= 0, text);
  assert.ok(text.indexOf(line, hint) > hint, text);
  assert.ok(text.indexOf('Get started: agi') > text.indexOf(line, hint), text);
}

test('stock macOS zsh with no .zshrc gets one that puts agi on PATH, once', () => {
  const fixture = release({ host: 'darwin', agi: versionBinary('agi 2.0.0') });
  const line = `export PATH="${fixture.installDir}:$PATH"`;
  const first = fixture.run('2.0.0', { args: [], shell: '/bin/zsh' });
  assert.equal(first.status, 0, first.stderr);
  const zshrc = path.join(fixture.home, '.zshrc');
  assert.equal(readFileSync(zshrc, 'utf8'), `\n# AGI CLI\n${line}\n`);
  assert.match(
    first.text,
    new RegExp(`Added .* to PATH in ${zshrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
  assertHintBeforeGetStarted(first.text, line);

  const second = fixture.run('2.0.0', { args: [], shell: '/bin/zsh' });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readFileSync(zshrc, 'utf8').split(line).length - 1, 1);
  assert.match(second.text, /already adds/);
  assertHintBeforeGetStarted(second.text, line);
});

test('Debian or Ubuntu bash appends to the existing .bashrc and says how to use agi now', () => {
  const fixture = release({ agi: versionBinary('agi 2.0.0') });
  const bashrc = path.join(fixture.home, '.bashrc');
  writeFileSync(bashrc, 'alias ll="ls -l"\n');
  const result = fixture.run('2.0.0', { args: [] });
  assert.equal(result.status, 0, result.stderr);
  const line = `export PATH="${fixture.installDir}:$PATH"`;
  assert.equal(readFileSync(bashrc, 'utf8'), `alias ll="ls -l"\n\n# AGI CLI\n${line}\n`);
  assertHintBeforeGetStarted(result.text, line);
});

test('macOS bash with only a .profile writes there instead of hiding it behind a new .bash_profile', () => {
  const fixture = release({ host: 'darwin', agi: versionBinary('agi 2.0.0') });
  writeFileSync(path.join(fixture.home, '.profile'), '');
  const result = fixture.run('2.0.0', { args: [] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(path.join(fixture.home, '.bash_profile')), false);
  assert.match(readFileSync(path.join(fixture.home, '.profile'), 'utf8'), /# AGI CLI/);
});

test('fish gets a config.fish line in its own syntax', () => {
  const fixture = release({ agi: versionBinary('agi 2.0.0') });
  const result = fixture.run('2.0.0', { args: [], shell: '/usr/local/bin/fish' });
  assert.equal(result.status, 0, result.stderr);
  const line = `fish_add_path "${fixture.installDir}"`;
  assert.equal(
    readFileSync(path.join(fixture.home, '.config/fish/config.fish'), 'utf8'),
    `\n# AGI CLI\n${line}\n`,
  );
  assertHintBeforeGetStarted(result.text, line);
});

test('an install directory already on PATH writes no profile and asks for no new terminal', () => {
  const fixture = release({ agi: versionBinary('agi 2.0.0') });
  const result = fixture.run('2.0.0', { args: [], pathPrefix: [fixture.installDir] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(fixture.home), []);
  assert.doesNotMatch(result.text, /new terminal/);
  assert.match(result.text, /Get started: agi/);
});

test('--no-modify-path leaves profiles alone and prints the exact line to add', () => {
  const fixture = release({ agi: versionBinary('agi 2.0.0') });
  const result = fixture.run('2.0.0', { shell: '/bin/zsh' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(fixture.home), []);
  assert.match(result.text, /is not on your PATH\. Add this line to .*\.zshrc/);
  assert.ok(result.text.includes(`export PATH="${fixture.installDir}:$PATH"`), result.text);
});

test('musl Linux is refused before anything is downloaded, even though its ldd exits 1', () => {
  const fixture = release({
    agi: versionBinary('agi 2.0.0'),
    ldd: '#!/bin/sh\necho "musl libc (x86_64)" >&2\necho "Version 1.2.5" >&2\nexit 1\n',
  });
  const result = fixture.run('2.0.0');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /musl-based Linux \(such as Alpine\) is not supported/);
  assert.equal(fixture.downloads(), '');
  assert.equal(existsSync(fixture.installDir), false);
});

test('a glibc below the floor is refused before anything is downloaded', () => {
  const fixture = release({
    agi: versionBinary('agi 2.0.0'),
    ldd: '#!/bin/sh\necho "ldd (GNU libc) 2.34"\n',
  });
  const result = fixture.run('2.0.0');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /glibc 2\.34, and the published builds need glibc 2\.35 or newer/);
  assert.equal(fixture.downloads(), '');
});

test('Ubuntu 22.04 glibc, the floor, installs', () => {
  const fixture = release({
    agi: versionBinary('agi 2.0.0'),
    ldd: '#!/bin/sh\necho "ldd (Ubuntu GLIBC 2.35-0ubuntu3.8) 2.35"\n',
  });
  const result = fixture.run('2.0.0');
  assert.equal(result.status, 0, result.stderr);
});

test('Windows Git Bash is told the Windows form of the install directory', () => {
  const fixture = release({ host: 'windows', agi: versionBinary('agi 2.0.0') });
  const result = fixture.run('2.0.0');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(path.join(fixture.installDir, 'agi.exe')));
  assert.match(result.text, /add C:\\Users\\tester\\\.agi\\bin to your Windows PATH/);
  assert.doesNotMatch(result.text, new RegExp(`add ${fixture.installDir} to your Windows PATH`));
});
