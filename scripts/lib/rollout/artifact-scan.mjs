/**
 * What a shipped artifact may not contain. Both lists are deliberately narrow:
 * a scan that fires on every public identifier gets an allowlist entry per
 * release and stops being read, which is how a real key gets through.
 */
export const SECRET_PATTERNS = [
  { rule: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{24,}/g },
  { rule: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/g },
  { rule: 'stripe-or-clerk-secret', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/g },
  { rule: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { rule: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { rule: 'github-token', re: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b/g },
  { rule: 'github-fine-grained-token', re: /\bgithub_pat_[A-Za-z0-9_]{50,}/g },
  { rule: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{12,}/g },
  { rule: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { rule: 'private-key-block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
];

/**
 * A loopback address is not on this list on purpose: the desktop bridge binds
 * one at runtime, so banning it would only teach people to allowlist it. What
 * must never ship is a build pointed at somebody's tunnel, a preview deploy or
 * a dev server.
 */
export const DEV_ENDPOINT_PATTERNS = [
  {
    rule: 'tunnel-host',
    re: /\bhttps?:\/\/[A-Za-z0-9.-]*\.(?:ngrok(?:-free)?\.(?:io|app|dev)|trycloudflare\.com|loca\.lt)\b/g,
  },
  {
    rule: 'preview-deploy-host',
    re: /\bhttps?:\/\/[A-Za-z0-9-]+-git-[A-Za-z0-9-]+\.vercel\.app\b/g,
  },
  {
    rule: 'dev-server-origin',
    re: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1):(?:3000|3100|5173|8787)\b/g,
  },
  { rule: 'staging-api-host', re: /\bhttps?:\/\/staging[.-][A-Za-z0-9.-]+\b/g },
];

const PRINTABLE_RUN = /[\x20-\x7e]{8,}/g;
const NUL_SAMPLE_BYTES = 8192;

export function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, NUL_SAMPLE_BYTES));
  return sample.includes(0);
}

/** The printable runs of a binary, which is where an embedded literal lands. */
export function extractStrings(buffer) {
  return (buffer.toString('latin1').match(PRINTABLE_RUN) ?? []).join('\n');
}

export function readableText(buffer) {
  return looksBinary(buffer) ? extractStrings(buffer) : buffer.toString('utf8');
}

function redact(value) {
  return `${value.slice(0, 6)}…${value.length} chars`;
}

export function scanText(text, file, allowlist = []) {
  const findings = [];
  for (const { rule, re } of [...SECRET_PATTERNS, ...DEV_ENDPOINT_PATTERNS]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = match[0];
      if (allowlist.some((allowed) => value.includes(allowed))) continue;
      const secret = SECRET_PATTERNS.some((pattern) => pattern.rule === rule);
      findings.push({ file, rule, detail: secret ? redact(value) : value });
    }
  }
  return findings;
}
