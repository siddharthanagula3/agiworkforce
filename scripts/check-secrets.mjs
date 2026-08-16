#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const PATTERNS = [
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'Anthropic API key', re: /sk-ant-(?!EXAMPLE|FAKE|TEST)[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI project key', re: /sk-proj-(?!EXAMPLE|FAKE|TEST)[A-Za-z0-9_-]{20,}/g },
  { name: 'Groq API key', re: /gsk_[A-Za-z0-9]{48,}/g },
  { name: 'xAI API key', re: /xai-[A-Za-z0-9]{20,}/g },
  { name: 'Stripe live key', re: /(?:sk|rk)_live_[A-Za-z0-9_]{16,}/g },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{12,}/g },
  { name: 'GitHub fine-grained PAT', re: /github_pat_[A-Za-z0-9_]{22,}/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{30,}/g },
  { name: 'Google API key', re: /AIza[A-Za-z0-9_-]{35}/g },
  { name: 'AWS access key id', re: /A(?:KIA|SIA)[A-Z0-9]{16}/g },
  { name: 'Supabase personal access token', re: /sbp_[a-f0-9]{40}/g },
  {
    name: 'Postgres/Redis URL with password',
    re: /\b(?:postgres|postgresql|rediss?|mongodb)(?:\+\w+)?:\/\/[^\s:@/]+:[^\s@/]{6,}@/gi,
  },
  { name: 'Private key in JSON', re: /"private_key"\s*:\s*"-----BEGIN/g },
];

const PLACEHOLDER =
  /EXAMPLE|PLACEHOLDER|REDACTED|XXXXXX|000000|123456|your[_-]?key|dummy|sample|<[a-z-]+>/i;

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

const SELF = new Set(['scripts/check-secrets.mjs', 'scripts/__tests__/check-secrets.test.mjs']);

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
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(src)) !== null) {
      const lineNo = src.slice(0, match.index).split('\n').length;
      const line = src.split('\n')[lineNo - 1] ?? '';
      if (PLACEHOLDER.test(line)) continue;
      const key = allowKey(rel, name);
      if (useAllowlist && allowed.has(key)) {
        allowed.set(key, true);
        exempted += 1;
        continue;
      }
      findings.push({ rel, lineNo, name, hint: match[0].slice(0, 12) });
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
  console.error(`Secret scan FAILED — ${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.lineNo}  ${f.name}  (starts "${f.hint}…")`);
  }
  console.error(
    `\nIf a finding is a deliberate fixture, make the value unmistakably fake — add EXAMPLE,\n` +
      `PLACEHOLDER or <your-key> to the line — rather than allowlisting the file. A fixture that\n` +
      `still looks like a live credential misleads every future reader, which is the actual defect.\n` +
      `\nIf it is a real credential: it is already in git history. ROTATE IT FIRST, then remove it.\n`,
  );
  process.exit(1);
}

const stale = [...allowed.entries()].filter(([, matched]) => !matched).map(([key]) => key);
if (stale.length > 0) {
  console.error(
    `Secret scan FAILED — ${stale.length} stale allowlist entry(ies) matched nothing:\n\n` +
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
