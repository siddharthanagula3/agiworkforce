#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const NON_SECRET =
  /EXAMPLE|PLACEHOLDER|REDACTED|FAKE|FIXTURE|SYNTHETIC|DUMMY|SAMPLE|NOT[_-]?A?[_-]?REAL|NEVER[_-]?ISSUED|YOUR[_-]?(?:KEY|TOKEN|SECRET|PASSWORD)|<[a-z][a-z0-9-]*>/gi;

const RESERVED_LABEL = new Set(['test', 'invalid', 'example', 'localhost', 'local']);
const EXAMPLE_TLD = new Set(['com', 'net', 'org']);
const DOC_IP = /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/;

const PATTERNS = [
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'Anthropic API key', re: /sk-ant-([A-Za-z0-9_-]{20,})/g, floor: 20 },
  { name: 'OpenAI project key', re: /sk-proj-([A-Za-z0-9_-]{20,})/g, floor: 20 },
  { name: 'Groq API key', re: /gsk_([A-Za-z0-9]{48,})/g, floor: 48 },
  { name: 'xAI API key', re: /xai-([A-Za-z0-9]{20,})/g, floor: 20 },
  { name: 'Stripe live key', re: /(?:sk|rk)_live_([A-Za-z0-9_]{16,})/g, floor: 24 },
  { name: 'Slack token', re: /xox[baprs]-([A-Za-z0-9-]{12,})/g, floor: 24 },
  { name: 'GitHub fine-grained PAT', re: /github_pat_([A-Za-z0-9_]{22,})/g, floor: 40 },
  { name: 'GitHub token', re: /gh[pousr]_([A-Za-z0-9]{30,})/g, floor: 36 },
  { name: 'Google API key', re: /AIza([A-Za-z0-9_-]{35,})/g, floor: 35 },
  { name: 'AWS access key id', re: /A(?:KIA|SIA)([A-Za-z0-9]{16,})/g, floor: 16 },
  { name: 'Supabase personal access token', re: /sbp_([A-Za-z0-9]{40,})/g, floor: 40 },
  {
    name: 'Postgres/Redis URL with password',
    connection: true,
    re: /\b(?:postgres|postgresql|rediss?|mongodb)(?:\+\w+)?:\/\/[^\s:@/]+:[^\s@/]{6,}@[^\s"'`?#/\\,;)\]}<>]*/gi,
  },
  { name: 'Private key in JSON', re: /"private_key"\s*:\s*"-----BEGIN/g },
];

// Credentials vendors publish as their own example. Each is a fixed string that authenticates
// nothing, and the comparison is whole-token equality, so no contributor-supplied text can steer a
// live key into one.
const DOCUMENTED = new Set(['AKIAIOSFODNN7EXAMPLE', 'ASIAIOSFODNN7EXAMPLE']);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'target',
  'dist',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'out',
]);

const SKIP_FILE =
  /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|mp4|mp3|wav|pdf|zip|gz|node|wasm|lock)$/i;

// Only the scanner itself: it has to spell out every credential shape it recognises. Its test file
// is deliberately not exempt, so a credential pasted there is still caught.
const SELF = new Set(['scripts/check-secrets.mjs']);

const FILLER_RUN = 6;

const PASSWORD_FLOOR = 8;

const fold = (code) => (code >= 65 && code <= 90 ? code + 32 : code);
const digit = (code) => code >= 48 && code <= 57;

// Counting runs wrap round: `1234567890` and `0987654321` are each one sequence, and the digit the
// wrap strands would otherwise be the one character standing between a fixture and the allowlist.
function stepBetween(from, to) {
  if (digit(from) && digit(to)) {
    const forward = (to - from + 10) % 10;
    if (forward === 0 || forward === 1) return forward;
    return forward === 9 ? -1 : 2;
  }
  return fold(to) - fold(from);
}

function maskParts(value) {
  const mask = new Array(value.length).fill(false);
  NON_SECRET.lastIndex = 0;
  for (let m = NON_SECRET.exec(value); m !== null; m = NON_SECRET.exec(value)) {
    for (let i = m.index; i < m.index + m[0].length; i += 1) mask[i] = true;
  }
  const runs = [];
  let start = 0;
  while (start < value.length) {
    let end = start + 1;
    const step =
      end < value.length ? stepBetween(value.charCodeAt(start), value.charCodeAt(end)) : NaN;
    if (Math.abs(step) <= 1) {
      end += 1;
      while (
        end < value.length &&
        stepBetween(value.charCodeAt(end - 1), value.charCodeAt(end)) === step
      ) {
        end += 1;
      }
    }
    if (end - start >= FILLER_RUN) {
      for (let i = start; i < end; i += 1) mask[i] = true;
      runs.push([start, end]);
    }
    start = end;
  }
  return { mask, runs };
}

function realLength(value) {
  const { mask, runs } = maskParts(value);
  let real = 0;
  for (let i = 0; i < mask.length; i += 1) if (!mask[i]) real += 1;
  for (const [start, end] of runs) {
    let hidden = 0;
    if (start > 0 && !mask[start - 1]) hidden += FILLER_RUN - 1;
    if (end < value.length && !mask[end]) hidden += FILLER_RUN - 1;
    real += Math.min(end - start, hidden);
  }
  return real;
}

function fullyMasked(value) {
  const { mask } = maskParts(value);
  return value.length > 0 && mask.every(Boolean);
}

function connectionParts(span) {
  const passwordStart = span.indexOf(':', span.indexOf('://') + 3) + 1;
  const at = span.indexOf('@', passwordStart);
  return {
    password: span.slice(passwordStart, at),
    host: span
      .slice(at + 1)
      .split(/[:/?#\\]/)[0]
      .toLowerCase(),
    // RFC 3986 requires an '@' inside userinfo to be percent-encoded. Left raw, `pass@realhost`
    // and `pass` + `@realhost` are the same bytes, so a reserved host tacked on the end would
    // vouch for a URL that still names the real server.
    ambiguous: span.indexOf('@', at + 1) !== -1,
  };
}

function documentationHost(host) {
  if (DOC_IP.test(host)) return true;
  const labels = host.split('.');
  let reserved = false;
  for (;;) {
    const last = labels[labels.length - 1];
    if (RESERVED_LABEL.has(last)) {
      labels.pop();
      reserved = true;
      continue;
    }
    if (labels.length > 1 && EXAMPLE_TLD.has(last) && labels[labels.length - 2] === 'example') {
      labels.length -= 2;
      reserved = true;
      continue;
    }
    break;
  }
  return reserved && labels.length <= 1;
}

// A connection string whose password component IS the word for a password authenticates nothing:
// it is the placeholder every driver's own documentation prints. Matched whole and lowercased, so
// a real secret that merely contains one of these is untouched, and only the connection rule
// consults it - key detection keeps the stricter marker vocabulary.
const PLACEHOLDER_PASSWORDS = new Set([
  'password',
  'passwd',
  'pass',
  'changeme',
  'change_me',
  'your_password',
  'yourpassword',
  'mypassword',
]);

function documentedFixture(pattern, match) {
  if (pattern.connection) {
    const { password, host, ambiguous } = connectionParts(match[0]);
    if (PLACEHOLDER_PASSWORDS.has(password.toLowerCase())) return true;
    if (fullyMasked(password)) return true;
    if (ambiguous || !documentationHost(host)) return false;
    // A reserved host proves the URL points nowhere, not that the password is fake, and a password
    // is reused far more often than a hostname. Only one short enough to fail every password policy
    // rides in on the host alone.
    return realLength(password) < PASSWORD_FLOOR;
  }
  if (DOCUMENTED.has(match[0])) return true;
  const material = match[1];
  if (material === undefined) return false;
  return realLength(material) < pattern.floor;
}

function lineStarts(src) {
  const starts = [0];
  for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

function lineNumberAt(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, maxBuffer: 512 * 1024 * 1024 }).toString('utf8');
  } catch {
    return '';
  }
}

function workingTreeFiles() {
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

function historyBlobs() {
  const entries = git(['rev-list', '--objects', '--all'])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const sp = line.indexOf(' ');
      return sp === -1 ? null : { sha: line.slice(0, sp), path: line.slice(sp + 1) };
    })
    .filter((e) => e && e.path && !SKIP_FILE.test(e.path))
    .filter((e) => !e.path.split('/').some((segment) => SKIP_DIRS.has(segment)));

  const byId = new Map();
  for (const e of entries) if (!byId.has(e.sha)) byId.set(e.sha, e.path);
  return byId;
}

function readBlobs(shas) {
  if (shas.length === 0) return new Map();
  let raw;
  try {
    raw = execFileSync('git', ['cat-file', '--batch'], {
      cwd: root,
      input: `${shas.join('\n')}\n`,
      maxBuffer: 1024 * 1024 * 1024,
    });
  } catch {
    return new Map();
  }
  const out = new Map();
  let i = 0;
  while (i < raw.length) {
    const nl = raw.indexOf(0x0a, i);
    if (nl === -1) break;
    const header = raw.subarray(i, nl).toString('utf8');
    const [sha, type, sizeText] = header.split(' ');
    if (type !== 'blob') {
      i = nl + 1;
      continue;
    }
    const size = Number(sizeText);
    const start = nl + 1;
    if (size <= 2 * 1024 * 1024) out.set(sha, raw.subarray(start, start + size).toString('utf8'));
    i = start + size + 1;
  }
  return out;
}

const ALLOWLIST_PATH = 'scripts/secret-scan-allowlist.json';
let allowlist = { entries: [] };
try {
  allowlist = JSON.parse(fs.readFileSync(path.join(root, ALLOWLIST_PATH), 'utf8'));
} catch {
  // Absent allowlist means nothing is exempt, which fails loudly rather than open.
}
const allowKey = (filePath, format) => `${filePath}::${format}`;

const allowed = new Map();
for (const entry of allowlist.entries ?? []) {
  if (!entry?.path || !entry?.format) continue;
  if (!entry.reason || entry.reason.length < 25) {
    console.error(
      `Allowlist entry for ${entry.path} (${entry.format}) has no real reason. ` +
        `An entry without one reads as "reviewed and accepted" for something nobody reviewed.`,
    );
    process.exit(1);
  }
  allowed.set(allowKey(entry.path, entry.format), false);
}

const findings = [];
let scanned = 0;
let exempted = 0;

function scanSource(rel, src, { useAllowlist }) {
  const starts = lineStarts(src);
  for (const pattern of PATTERNS) {
    const { name, re } = pattern;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(src)) !== null) {
      const key = allowKey(rel, name);
      if (useAllowlist && allowed.has(key)) {
        allowed.set(key, true);
        exempted += 1;
        continue;
      }
      if (documentedFixture(pattern, match)) continue;
      findings.push({
        rel,
        lineNo: lineNumberAt(starts, match.index),
        name,
        hint: match[0].slice(0, 12),
      });
    }
  }
}

const scanHistory = process.argv.includes('--history');

for (const rel of workingTreeFiles()) {
  if (SELF.has(rel)) continue;
  if (SKIP_FILE.test(rel)) continue;
  if (rel.split('/').some((segment) => SKIP_DIRS.has(segment))) continue;

  const full = path.join(root, rel);
  let src;
  try {
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
    src = fs.readFileSync(full, 'utf8');
  } catch {
    continue;
  }
  scanned += 1;
  scanSource(rel, src, { useAllowlist: true });
}

let historyBlobCount = 0;
if (scanHistory) {
  const blobs = historyBlobs();
  const shas = [...blobs.keys()];
  const CHUNK = 512;
  for (let i = 0; i < shas.length; i += CHUNK) {
    const chunk = shas.slice(i, i + CHUNK);
    const contents = readBlobs(chunk);
    for (const [sha, src] of contents) {
      const rel = blobs.get(sha) ?? sha;
      if (SELF.has(rel)) continue;
      historyBlobCount += 1;
      scanSource(`${rel} (history blob ${sha.slice(0, 9)})`, src, { useAllowlist: false });
    }
  }
}

if (findings.length > 0) {
  console.error(`Secret scan FAILED, ${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.lineNo}  ${f.name}  (starts "${f.hint}…")`);
  }
  console.error(
    `\nIf a finding is a deliberate fixture, make the credential itself unmistakably fake: after the\n` +
      `vendor prefix, every letter and digit has to be a marker (EXAMPLE, PLACEHOLDER, REDACTED,\n` +
      `NOT_A_REAL, <your-key>) or counting filler at least ${FILLER_RUN} long (000000, abcdef, 987654).\n` +
      `Filler that merely trails realistic material is discounted by as much as it could hide: it\n` +
      `cannot be told apart from the key's own tail carried on a few characters further.\n` +
      `Point connection strings at an RFC 2606 host such as db.example.com AND give them a password\n` +
      `no real policy would accept. A marker written beside otherwise realistic material exempts\n` +
      `nothing: text typed next to a key cannot be told apart from the key's own tail, and that is\n` +
      `how a live key rode into main behind a trailing "// sample".\n` +
      `If the value has to stay realistic, add a reviewed entry to ${ALLOWLIST_PATH}.\n` +
      `\nIf it is a real credential: it is already in git history. ROTATE IT FIRST, then remove it.\n`,
  );
  process.exit(1);
}

const stale = [...allowed.entries()].filter(([, matched]) => !matched).map(([key]) => key);
if (stale.length > 0) {
  console.error(
    `Secret scan FAILED, ${stale.length} stale allowlist entry(ies) matched nothing:\n\n` +
      stale.map((s) => `  ${s}`).join('\n') +
      `\n\nThe finding is gone, so delete the entry from ${ALLOWLIST_PATH}.\n`,
  );
  process.exit(1);
}

console.log(
  `Secret scan passed (${scanned} working-tree files` +
    (scanHistory ? ` + ${historyBlobCount} history blobs` : '') +
    `, ${PATTERNS.length} credential formats, ` +
    `${exempted} reviewed exemption(s) across ${allowed.size} allowlist entries).`,
);
