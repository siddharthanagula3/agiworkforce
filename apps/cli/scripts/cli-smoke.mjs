// Production-binary smoke for the CLI: builds nothing itself — run after
// `cargo build --bin agi` — and exercises the real, no-API-key command surface of
// the shipped `agi` binary end to end: --version, --help (documented commands),
// `doctor` (local preflight diagnostics), `features` (feature flags), and the
// `app-server` JSON-RPC initialize handshake (the IDE/desktop developer-session
// interface). Verifies production build + startup + documented run commands.
//
// Run: cargo build --bin agi && node apps/cli/scripts/cli-smoke.mjs
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = [resolve(root, '../../target/debug/agi'), resolve(root, 'target/debug/agi')].find((p) =>
  existsSync(p),
);
if (!bin) {
  console.error('SMOKE FAIL: built binary not found — run `cargo build --bin agi` first');
  process.exit(1);
}

const home = mkdtempSync(resolve(tmpdir(), 'agi-cli-smoke-'));
const env = { ...process.env, HOME: home };
let failed = false;
const fail = (m) => {
  console.error('SMOKE FAIL:', m);
  failed = true;
};
const run = (args) => execFileSync(bin, args, { env, encoding: 'utf8', timeout: 20000 });

// --version
const version = run(['--version']).trim();
console.log('[--version]', version);
if (!/\bagi\s+\d+\.\d+\.\d+/.test(version)) fail('--version did not report a semver');

// --help lists the documented command surface
const help = run(['--help']);
const expectedCmds = ['exec', 'app-server', 'doctor', 'models', 'features', 'login'];
const missing = expectedCmds.filter((c) => !new RegExp(`^\\s*${c}\\b`, 'm').test(help));
console.log(
  '[--help] documented commands present:',
  expectedCmds.filter((c) => !missing.includes(c)).join(', '),
);
if (missing.length) fail(`--help missing documented commands: ${missing.join(', ')}`);

// doctor runs real preflight diagnostics
const doctor = run(['doctor']);
console.log('[doctor] ' + (doctor.split('\n').find((l) => /overall:/.test(l)) || '').trim());
if (!/AGI doctor/.test(doctor) || !/runtime dependency/.test(doctor))
  fail('doctor did not produce a diagnostic report');

// features lists real flags
const features = run(['features']);
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

// app-server initialize handshake (the developer-session IPC surface)
const pv = await new Promise((res) => {
  const child = spawn(bin, ['app-server'], { cwd: home, env, stdio: ['pipe', 'pipe', 'ignore'] });
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
        res(msg.result.protocolVersion);
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
console.log('[app-server] initialize protocolVersion =', JSON.stringify(pv));
if (typeof pv !== 'number' || pv < 1)
  fail('app-server initialize did not return a protocolVersion');

console.log('\nCLI SMOKE:', failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
