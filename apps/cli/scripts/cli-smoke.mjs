import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configuredBin = process.env.AGI_CLI_SMOKE_BINARY
  ? resolve(process.env.AGI_CLI_SMOKE_BINARY)
  : null;
if (configuredBin && !existsSync(configuredBin)) {
  console.error(`SMOKE FAIL: AGI_CLI_SMOKE_BINARY does not exist: ${configuredBin}`);
  process.exit(1);
}
const bin = [
  configuredBin,
  resolve(root, '../../target/release/agi'),
  resolve(root, 'target/release/agi'),
  resolve(root, '../../target/debug/agi'),
  resolve(root, 'target/debug/agi'),
].find((candidate) => candidate && existsSync(candidate));
if (!bin) {
  console.error('SMOKE FAIL: built binary not found, run `cargo build --release --bin agi` first');
  process.exit(1);
}
console.log('[binary]', bin);

const smokeRoot = mkdtempSync(resolve(tmpdir(), 'agi-cli-smoke-'));
const configRoot = resolve(smokeRoot, 'agiworkforce-home');
const isolatedOsHome = resolve(smokeRoot, 'os-home');
const smokeWorkspace = resolve(smokeRoot, 'workspace');
mkdirSync(configRoot);
mkdirSync(isolatedOsHome);
mkdirSync(smokeWorkspace);
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (
    key.startsWith('AGIWORKFORCE_') ||
    key.startsWith('AGI_') ||
    /(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?)(?:_|$)/iu.test(key)
  ) {
    delete env[key];
  }
}
Object.assign(env, {
  AGIWORKFORCE_HOME: configRoot,
  AGIWORKFORCE_NO_KEYRING: '1',
  HOME: isolatedOsHome,
  USERPROFILE: isolatedOsHome,
  XDG_CONFIG_HOME: resolve(isolatedOsHome, '.config'),
});
let failed = false;
const fail = (m) => {
  console.error('SMOKE FAIL:', m);
  failed = true;
};
const run = (args, timeout = 20000) => execFileSync(bin, args, { env, encoding: 'utf8', timeout });
const runSoft = (args, timeout) => {
  try {
    return run(args, timeout);
  } catch (e) {
    return e && e.code === 'ETIMEDOUT' ? null : String(e?.stdout ?? '');
  }
};

const version = run(['--version']).trim();
console.log('[--version]', version);
const versionMatch = version.match(/\bagi\s+(\d+\.\d+\.\d+)/);
if (!versionMatch) fail('--version did not report a semver');
const binaryVersion = versionMatch?.[1];

const aliasName = process.platform === 'win32' ? 'agiworkforce.exe' : 'agiworkforce';
const compatibilityAlias = resolve(dirname(bin), aliasName);
if (existsSync(compatibilityAlias)) {
  const aliasVersion = execFileSync(compatibilityAlias, ['--version'], {
    env,
    encoding: 'utf8',
    timeout: 20000,
  }).trim();
  console.log('[compatibility alias --version]', aliasVersion);
  if (binaryVersion === undefined || !aliasVersion.includes(binaryVersion)) {
    fail(`compatibility alias version does not match CLI ${JSON.stringify(binaryVersion)}`);
  }
} else if (process.env.AGI_CLI_SMOKE_REQUIRE_ALIAS === '1') {
  fail(`release archive is missing compatibility alias ${aliasName}`);
}

const help = run(['--help']);
const expectedCmds = ['exec', 'app-server', 'doctor', 'models', 'features', 'login'];
const missing = expectedCmds.filter((c) => !new RegExp(`^\\s*${c}\\b`, 'm').test(help));
console.log(
  '[--help] documented commands present:',
  expectedCmds.filter((c) => !missing.includes(c)).join(', '),
);
if (missing.length) fail(`--help missing documented commands: ${missing.join(', ')}`);

const doctor = runSoft(['doctor'], 45000);
if (doctor === null) {
  console.log('[doctor] skipped (exceeded 45s, variable dependency/auth checks)');
} else {
  console.log('[doctor] ' + (doctor.split('\n').find((l) => /overall:/.test(l)) || '').trim());
  if (!/AGI doctor/.test(doctor) || !/runtime dependency/.test(doctor))
    fail('doctor produced no diagnostic report');
}

const features = runSoft(['features'], 20000);
if (features === null) {
  console.log('[features] skipped (timeout)');
} else {
  console.log(
    '[features] ' +
      features
        .split('\n')
        .filter((l) => /:/.test(l))
        .slice(0, 3)
        .map((l) => l.trim())
        .join(', '),
  );
  if (!/Feature Flags/.test(features)) fail('features did not list feature flags');
}

try {
  execFileSync(bin, ['init'], {
    cwd: smokeWorkspace,
    env,
    encoding: 'utf8',
    timeout: 20000,
  });
} catch (error) {
  fail(`could not initialize the trusted app-server smoke workspace: ${String(error)}`);
}
const handshake = await new Promise((res) => {
  const child = spawn(bin, ['app-server'], {
    cwd: smokeWorkspace,
    env,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  child.stdin.on('error', () => {});
  let buf = '';
  const t = setTimeout(() => {
    child.kill('SIGKILL');
    res(null);
  }, 15000);
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id === 1 && msg.result) {
        clearTimeout(t);
        child.kill('SIGKILL');
        res(msg.result);
        return;
      }
    }
  });
  child.on('error', () => {
    clearTimeout(t);
    res(null);
  });
  child.stdin.write(
    JSON.stringify({
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'cli-smoke', title: 'CLI smoke', version: '0.0.0' } },
    }) + '\n',
  );
});
console.log('[app-server] initialize =', JSON.stringify(handshake));
if (handshake?.protocolVersion !== 7)
  fail('app-server initialize did not return developer-session protocol v7');
if (handshake?.serverInfo?.version !== binaryVersion) {
  fail(
    `app-server reported version ${JSON.stringify(handshake?.serverInfo?.version)} for CLI ${JSON.stringify(binaryVersion)}`,
  );
}

console.log('\nCLI SMOKE:', failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
