/**
 * Every secret pattern the platform matches, in one registry, and the policies
 * that say which of them each use applies and what a match becomes.
 *
 * A policy is an ordered list of rules with a replacement, because order and
 * replacement are part of each use's output: the log sink names the kind of
 * secret, telemetry and Guardian evidence say only that something was removed,
 * a support transcript labels each redaction for the human reading it. The
 * variants of one shape (a JWT with a bounded or unbounded signature, an API
 * key of 16, 20 or 32 characters) are separate rules so the difference is
 * visible here rather than hidden in four files; consolidating two of them
 * changes an output and belongs in its own change with its fixture.
 *
 * Every quantifier in the detection rules is bounded where a second run follows
 * a required literal, which is what keeps them linear on hostile input; the
 * web ReDoS test measures them.
 */

export type SecretRuleSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecretPatternRule {
  readonly label: string;
  readonly severity: SecretRuleSeverity;
  readonly pattern: RegExp;
  /** Safe to assert on in outbound payloads without drowning in false positives. */
  readonly assertable?: boolean;
  /** How likely a match is a real secret rather than a lookalike. */
  readonly confidence?: 'high' | 'low';
}

export const SECRET_PATTERN_RULES = Object.freeze({
  'private-key': {
    label: 'Private key block',
    severity: 'critical',
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  'private-key-any-type': {
    label: 'Private key block',
    severity: 'critical',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  'private-key-header': {
    label: 'Private Key',
    severity: 'critical',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    assertable: false,
    confidence: 'high',
  },
  'aws-secret-assignment': {
    label: 'AWS secret or session token assignment',
    severity: 'critical',
    pattern:
      /\b(aws[_-]?(?:secret[_-]?access[_-]?key|session[_-]?token))\b["']?\s*[=:]\s*["']?(?!\[REDACTED)[^\s,'"}]{8,}["']?/gi,
  },
  'aws-secret-key': {
    label: 'AWS Secret Key',
    severity: 'critical',
    pattern: /aws[_-]?secret[_-]?access[_-]?key[=:]\s*["']?[A-Za-z0-9/+=]{40}["']?/i,
    assertable: false,
    confidence: 'high',
  },
  'anthropic-api-key': {
    label: 'Anthropic API key',
    severity: 'critical',
    pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  },
  'openai-project-key': {
    label: 'OpenAI project key',
    severity: 'critical',
    pattern: /sk-proj-[A-Za-z0-9_-]{20,}/g,
  },
  'generic-api-key': {
    label: 'API key',
    severity: 'high',
    pattern: /sk-[a-zA-Z0-9_-]{20,}/g,
  },
  'generic-api-key-alphanumeric': {
    label: 'API key',
    severity: 'high',
    pattern: /sk-[A-Za-z0-9]{20,}/g,
  },
  'generic-api-key-16': {
    label: 'API key',
    severity: 'high',
    pattern: /sk-[A-Za-z0-9_-]{16,}/g,
  },
  'generic-api-key-32': {
    label: 'Anthropic/OpenAI API Key',
    severity: 'critical',
    pattern: /sk-[A-Za-z0-9_-]{32,}/,
    assertable: true,
    confidence: 'low',
  },
  'google-api-key': {
    label: 'Google API key',
    severity: 'critical',
    pattern: /AIza[a-zA-Z0-9_-]{30,}/g,
  },
  'google-api-key-20': {
    label: 'Google API key',
    severity: 'critical',
    pattern: /AIza[A-Za-z0-9_-]{20,}/g,
  },
  'google-api-key-exact': {
    label: 'Google API Key',
    severity: 'critical',
    pattern: /AIza[0-9A-Za-z_-]{35}/,
    assertable: false,
    confidence: 'high',
  },
  'groq-api-key': {
    label: 'Groq API key',
    severity: 'critical',
    pattern: /gsk_[a-zA-Z0-9]{48,}/g,
  },
  'stripe-key': {
    label: 'Stripe key',
    severity: 'critical',
    pattern: /(?:sk|pk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}/g,
  },
  'stripe-key-16': {
    label: 'Stripe key',
    severity: 'critical',
    pattern: /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_]{16,}/g,
  },
  'stripe-or-webhook-secret': {
    label: 'Stripe or webhook secret',
    severity: 'critical',
    pattern: /(?:sk|rk|whsec)_[A-Za-z0-9_-]{16,}/g,
  },
  'stripe-live-key': {
    label: 'Stripe Live Key',
    severity: 'critical',
    pattern: /sk_live_[A-Za-z0-9]{24,}/,
    assertable: true,
    confidence: 'high',
  },
  'stripe-test-key': {
    label: 'Stripe Test Key',
    severity: 'high',
    pattern: /sk_test_[A-Za-z0-9]{24,}/,
    assertable: true,
    confidence: 'low',
  },
  'aws-access-key': {
    label: 'AWS access key',
    severity: 'critical',
    pattern: /A(?:KIA|SIA)[A-Z0-9]{16}/g,
  },
  'aws-access-key-id': {
    label: 'AWS Access Key',
    severity: 'critical',
    pattern: /AKIA[0-9A-Z]{16}/,
    assertable: false,
    confidence: 'high',
  },
  'github-token': {
    label: 'GitHub token',
    severity: 'critical',
    pattern: /gh[psour]_[a-zA-Z0-9]{30,}/g,
  },
  'github-token-any': {
    label: 'GitHub token',
    severity: 'critical',
    pattern: /(?:github_pat|gh[pousr])_[A-Za-z0-9_]{20,}/g,
  },
  'github-personal-token': {
    label: 'GitHub Token',
    severity: 'critical',
    pattern: /ghp_[a-zA-Z0-9]{36}/,
    assertable: false,
    confidence: 'high',
  },
  'github-oauth-token': {
    label: 'GitHub OAuth',
    severity: 'critical',
    pattern: /gho_[a-zA-Z0-9]{36}/,
    assertable: false,
    confidence: 'high',
  },
  'github-pat': {
    label: 'GitHub personal access token',
    severity: 'critical',
    pattern: /github_pat_[a-zA-Z0-9_]{22,}/g,
  },
  'xai-api-key': {
    label: 'xAI API key',
    severity: 'critical',
    pattern: /xai-[a-zA-Z0-9]{20,}/g,
  },
  'slack-token': {
    label: 'Slack token',
    severity: 'critical',
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  },
  jwt: {
    label: 'JWT',
    severity: 'high',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  'jwt-any-signature': {
    label: 'JWT',
    severity: 'high',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g,
  },
  'jwt-short-signature': {
    label: 'JWT',
    severity: 'high',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g,
  },
  'jwt-header-payload': {
    label: 'JWT',
    severity: 'critical',
    pattern: /eyJ[A-Za-z0-9_-]{20,256}\.[A-Za-z0-9_-]{20,4096}/,
    assertable: true,
    confidence: 'low',
  },
  'bearer-token': {
    label: 'Bearer token',
    severity: 'high',
    pattern: /bearer\s+[a-zA-Z0-9._\-/+=]{8,}/gi,
  },
  'bearer-token-20': {
    label: 'Bearer Token',
    severity: 'high',
    pattern: /Bearer\s+[A-Za-z0-9_-]{20,}/,
    assertable: true,
    confidence: 'low',
  },
  'authorization-scheme': {
    label: 'Authorization credential',
    severity: 'high',
    pattern: /\b(bearer|basic|digest)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  },
  'authorization-header': {
    label: 'Authorization header',
    severity: 'high',
    pattern: /((?:proxy-)?authorization["']?\s*[:=]\s*)[^\r\n]+/gi,
  },
  'basic-auth': {
    label: 'Basic Auth',
    severity: 'high',
    pattern: /Basic\s+[a-zA-Z0-9+/=]{20,}/,
    assertable: false,
    confidence: 'low',
  },
  'named-secret': {
    label: 'Named secret',
    severity: 'high',
    pattern:
      /(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|\bsecret\b|\btoken\b)["']?\s*[=:]\s*["']?(?!\[REDACTED)[^\s,'"}]{8,}["']?/gi,
  },
  'compound-named-secret': {
    label: 'Named secret with a compound field name',
    severity: 'high',
    // `_` is a word character, so the named-secret rule's \bsecret\b never fires on
    // snake_case field names such as `session_secret`. The leading boundary is consumed
    // rather than asserted so the benign-`*_key` exclusion cannot be sidestepped by
    // restarting the match one character into the field name.
    pattern:
      /(^|[^A-Za-z0-9_-])((?!(?:public|idempotency|partition|primary|foreign|composite|sort|row|object|cache|shard|group|index|locale|translation|column|query|search|route|storage|bucket|blob|map|dedupe?)[_-]keys?[^A-Za-z0-9])[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*?[_-](?:secrets?|tokens?|passphrases?|credentials?|keys?))["']?\s*[=:]\s*["']?(?!\[REDACTED)[^\s,'"}]{8,}["']?/gi,
  },
  'named-credential-assignment': {
    label: 'Named credential assignment',
    severity: 'high',
    pattern:
      /\b([A-Za-z0-9_]{0,32}(?:password|passwd|api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token))["']?\s*[=:]\s*["']?[^\s,'"}]{8,}/gi,
  },
  'quoted-credential-assignment': {
    label: 'Credential assignment',
    severity: 'high',
    pattern:
      /((?:password|passwd|secret|token|api[_-]?key|apikey|credential)[A-Za-z0-9_-]*["']?\s*[:=]\s*)(["']?)[^\s"',;)\]}]{6,}\2/gi,
  },
  'generic-api-key-assignment': {
    label: 'Generic API Key',
    severity: 'high',
    pattern: /api[_-]?key[=:]\s*["']?[a-zA-Z0-9]{20,}["']?/i,
    assertable: false,
    confidence: 'low',
  },
  'generic-secret-assignment': {
    label: 'Generic Secret',
    severity: 'high',
    pattern: /secret[=:]\s*["']?[a-zA-Z0-9]{20,}["']?/i,
    assertable: false,
    confidence: 'low',
  },
  'password-assignment': {
    label: 'Password in URL',
    severity: 'critical',
    pattern: /password[=:][^&\s]{8,}/i,
    assertable: false,
    confidence: 'low',
  },
  'password-line': {
    label: 'Password-bearing line',
    severity: 'critical',
    pattern: /^.*\bpassw(?:or)?d\b.*$/gim,
  },
  'database-url-credentials': {
    label: 'Database URL credentials',
    severity: 'critical',
    pattern: /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s/:@]+:[^\s]+@/gi,
  },
  'url-credentials': {
    label: 'Credentials in a URL',
    severity: 'critical',
    pattern: /\b([a-z][a-z0-9+.-]*):\/\/[^\s:@/]+:[^\s@/]+@/gi,
  },
  'postgres-url-credentials': {
    label: 'Database URL with Credentials',
    severity: 'critical',
    pattern: /postgres(ql)?:\/\/[^\s:/@]{1,256}:[^\s@/]{1,256}@[^\s/]{1,256}/i,
    assertable: false,
    confidence: 'high',
  },
  'mongodb-url-credentials': {
    label: 'MongoDB URL with Credentials',
    severity: 'critical',
    pattern: /mongodb(\+srv)?:\/\/[^\s:/@]{1,256}:[^\s@/]{1,256}@[^\s/]{1,256}/i,
    assertable: false,
    confidence: 'high',
  },
  'neon-connection-string': {
    label: 'Neon Connection String',
    severity: 'critical',
    pattern: /NEON_DATABASE_URL[=:][^\s]{8,}/,
    assertable: true,
    confidence: 'high',
  },
  'payment-card-number': {
    label: 'Payment card number',
    severity: 'critical',
    pattern: /\b(?:\d{4}[ \t-]){3}\d{4}\b|\b\d{4}[ \t-]\d{6}[ \t-]\d{5}\b|\b[3-6]\d{12,18}\b/g,
  },
  'credit-card-number': {
    label: 'Credit Card',
    severity: 'critical',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/,
    assertable: false,
    confidence: 'low',
  },
  'us-ssn': {
    label: 'SSN Pattern',
    severity: 'critical',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    assertable: false,
    confidence: 'low',
  },
  'opaque-token': {
    label: 'Opaque token',
    severity: 'medium',
    pattern: /[A-Za-z0-9+/]{40,}={0,2}|[A-Za-z0-9_+=-]{32,}/g,
  },
} satisfies Record<string, SecretPatternRule>);

export type SecretRuleId = keyof typeof SECRET_PATTERN_RULES;

export type RedactionReplacement = string | ((match: string, ...groups: string[]) => string);

export interface RedactionStep {
  readonly rule: SecretRuleId;
  readonly replacement: RedactionReplacement;
}

function hasMixedCharacterClasses(token: string): boolean {
  return /[a-z]/.test(token) && /[A-Z]/.test(token) && /[0-9]/.test(token);
}

/**
 * The detection registry the web leak detector and secrets audit read, in the
 * order they have always scanned it.
 */
export const SECRET_DETECTION_RULES: readonly SecretRuleId[] = Object.freeze([
  'generic-api-key-32',
  'stripe-live-key',
  'stripe-test-key',
  'jwt-header-payload',
  'neon-connection-string',
  'bearer-token-20',
  'google-api-key-exact',
  'aws-access-key-id',
  'aws-secret-key',
  'github-personal-token',
  'github-oauth-token',
  'postgres-url-credentials',
  'mongodb-url-credentials',
  'private-key-header',
  'generic-api-key-assignment',
  'generic-secret-assignment',
  'password-assignment',
  'basic-auth',
  'us-ssn',
  'credit-card-number',
]);

const REDACTED = '[REDACTED]';

export const REDACTION_POLICIES = Object.freeze({
  /** Log sinks: every match names the kind of secret it was. */
  log: [
    { rule: 'private-key', replacement: '[REDACTED_PRIVATE_KEY]' },
    { rule: 'aws-secret-assignment', replacement: '$1=[REDACTED_AWS_SECRET]' },
    { rule: 'anthropic-api-key', replacement: '[REDACTED_ANTHROPIC_KEY]' },
    { rule: 'generic-api-key', replacement: '[REDACTED_API_KEY]' },
    { rule: 'google-api-key', replacement: '[REDACTED_GOOGLE_KEY]' },
    { rule: 'groq-api-key', replacement: '[REDACTED_GROQ_KEY]' },
    { rule: 'stripe-key', replacement: '[REDACTED_STRIPE_KEY]' },
    { rule: 'aws-access-key', replacement: '[REDACTED_AWS_KEY]' },
    { rule: 'github-token', replacement: '[REDACTED_GITHUB_TOKEN]' },
    { rule: 'github-pat', replacement: '[REDACTED_GITHUB_TOKEN]' },
    { rule: 'xai-api-key', replacement: '[REDACTED_XAI_KEY]' },
    { rule: 'slack-token', replacement: '[REDACTED_SLACK_TOKEN]' },
    { rule: 'jwt', replacement: '[REDACTED_JWT]' },
    { rule: 'bearer-token', replacement: 'Bearer [REDACTED_TOKEN]' },
    { rule: 'named-secret', replacement: '$1=[REDACTED]' },
    { rule: 'compound-named-secret', replacement: '$1$2=[REDACTED]' },
    { rule: 'database-url-credentials', replacement: '$1://[CREDENTIALS_REDACTED]@' },
    { rule: 'payment-card-number', replacement: REDACTED },
    { rule: 'password-line', replacement: '[REDACTED LINE]' },
  ],
  /** Product telemetry: a match says only that something was removed. */
  telemetry: [
    { rule: 'private-key', replacement: REDACTED },
    { rule: 'jwt-any-signature', replacement: REDACTED },
    { rule: 'bearer-token', replacement: REDACTED },
    { rule: 'anthropic-api-key', replacement: REDACTED },
    { rule: 'openai-project-key', replacement: REDACTED },
    { rule: 'generic-api-key-alphanumeric', replacement: REDACTED },
    { rule: 'stripe-key-16', replacement: REDACTED },
    { rule: 'groq-api-key', replacement: REDACTED },
    { rule: 'xai-api-key', replacement: REDACTED },
    { rule: 'slack-token', replacement: REDACTED },
    { rule: 'github-pat', replacement: REDACTED },
    { rule: 'github-token', replacement: REDACTED },
    { rule: 'google-api-key', replacement: REDACTED },
    { rule: 'aws-access-key', replacement: REDACTED },
    { rule: 'url-credentials', replacement: '$1://[REDACTED]@' },
    { rule: 'named-credential-assignment', replacement: '$1=[REDACTED]' },
  ],
  /** A support transcript a person reads: each redaction says what it hid. */
  content: [
    { rule: 'generic-api-key-32', replacement: '[redacted:api-key]' },
    { rule: 'stripe-live-key', replacement: '[redacted:stripe-live-key]' },
    { rule: 'stripe-test-key', replacement: '[redacted:stripe-test-key]' },
    { rule: 'jwt-header-payload', replacement: '[redacted:jwt]' },
    { rule: 'neon-connection-string', replacement: '[redacted:database-url]' },
    { rule: 'bearer-token-20', replacement: '[redacted:bearer-token]' },
  ],
  /** Guardian finding evidence, which also removes unrecognised high-entropy tokens. */
  evidence: [
    { rule: 'private-key-any-type', replacement: '[REDACTED PRIVATE KEY]' },
    { rule: 'authorization-header', replacement: '$1[REDACTED]' },
    { rule: 'authorization-scheme', replacement: '$1 [REDACTED]' },
    { rule: 'jwt-short-signature', replacement: REDACTED },
    { rule: 'github-token-any', replacement: REDACTED },
    { rule: 'generic-api-key-16', replacement: REDACTED },
    { rule: 'stripe-or-webhook-secret', replacement: REDACTED },
    { rule: 'google-api-key-20', replacement: REDACTED },
    { rule: 'aws-access-key-id', replacement: REDACTED },
    { rule: 'slack-token', replacement: REDACTED },
    { rule: 'quoted-credential-assignment', replacement: '$1$2[REDACTED]$2' },
    {
      rule: 'opaque-token',
      replacement: (token: string) => (hasMixedCharacterClasses(token) ? REDACTED : token),
    },
  ],
} satisfies Record<string, readonly RedactionStep[]>);

export type RedactionPolicy = keyof typeof REDACTION_POLICIES;

/** A rule's pattern, matching every occurrence. */
export function globalRulePattern(rule: SecretRuleId): RegExp {
  const { pattern } = SECRET_PATTERN_RULES[rule];
  return new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
}

export function redactWithSteps(text: string, steps: readonly RedactionStep[]): string {
  let out = text;
  for (const { rule, replacement } of steps) {
    out =
      typeof replacement === 'string'
        ? out.replace(globalRulePattern(rule), replacement)
        : out.replace(globalRulePattern(rule), replacement);
  }
  return out;
}

export function redactWithPolicy(text: string, policy: RedactionPolicy): string {
  return redactWithSteps(text, REDACTION_POLICIES[policy]);
}
