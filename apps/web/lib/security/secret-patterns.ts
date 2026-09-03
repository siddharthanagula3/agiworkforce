export type SecretSeverity = 'critical' | 'high' | 'medium';

export type SecretConfidence = 'high' | 'low';

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: SecretSeverity;
  assertable: boolean;
  confidence: SecretConfidence;
}

export const SECRET_PATTERN_REGISTRY: readonly SecretPattern[] = Object.freeze([
  {
    name: 'Anthropic/OpenAI API Key',
    pattern: /sk-[A-Za-z0-9_-]{32,}/,
    severity: 'critical',
    assertable: true,
    confidence: 'high',
  },
  {
    name: 'Stripe Live Key',
    pattern: /sk_live_[A-Za-z0-9]{24,}/,
    severity: 'critical',
    assertable: true,
    confidence: 'high',
  },
  {
    name: 'Stripe Test Key',
    pattern: /sk_test_[A-Za-z0-9]{24,}/,
    severity: 'high',
    assertable: true,
    confidence: 'high',
  },
  {
    name: 'JWT',
    pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    severity: 'critical',
    assertable: true,
    confidence: 'low',
  },
  {
    name: 'Neon Connection String',
    pattern: /NEON_DATABASE_URL[=:][^\s]{8,}/,
    severity: 'critical',
    assertable: true,
    confidence: 'high',
  },
  {
    name: 'Bearer Token',
    pattern: /Bearer\s+[A-Za-z0-9_-]{20,}/,
    severity: 'high',
    assertable: true,
    confidence: 'low',
  },

  {
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z_-]{35}/,
    severity: 'critical',
    assertable: false,
    confidence: 'high',
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/,
    severity: 'critical',
    assertable: false,
    confidence: 'high',
  },
  {
    name: 'AWS Secret Key',
    pattern: /aws[_-]?secret[_-]?access[_-]?key[=:]\s*["']?[A-Za-z0-9/+=]{40}["']?/i,
    severity: 'critical',
    assertable: false,
    confidence: 'high',
  },
  {
    name: 'GitHub Token',
    pattern: /ghp_[a-zA-Z0-9]{36}/,
    severity: 'critical',
    assertable: false,
    confidence: 'high',
  },
  {
    name: 'GitHub OAuth',
    pattern: /gho_[a-zA-Z0-9]{36}/,
    severity: 'critical',
    assertable: false,
    confidence: 'high',
  },
  {
    name: 'Database URL with Credentials',
    pattern: /postgres(ql)?:\/\/[^:]+:[^@]+@[^/]+/i,
    severity: 'critical',
    assertable: false,
    confidence: 'high',
  },
  {
    name: 'MongoDB URL with Credentials',
    pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@[^/]+/i,
    severity: 'critical',
    assertable: false,
    confidence: 'high',
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: 'critical',
    assertable: false,
    confidence: 'high',
  },
  {
    name: 'Generic API Key',
    pattern: /api[_-]?key[=:]\s*["']?[a-zA-Z0-9]{20,}["']?/i,
    severity: 'high',
    assertable: false,
    confidence: 'low',
  },
  {
    name: 'Generic Secret',
    pattern: /secret[=:]\s*["']?[a-zA-Z0-9]{20,}["']?/i,
    severity: 'high',
    assertable: false,
    confidence: 'low',
  },
  {
    name: 'Password in URL',
    pattern: /password[=:][^&\s]{8,}/i,
    severity: 'critical',
    assertable: false,
    confidence: 'low',
  },
  {
    name: 'Basic Auth',
    pattern: /Basic\s+[a-zA-Z0-9+/=]{20,}/,
    severity: 'high',
    assertable: false,
    confidence: 'low',
  },
  {
    name: 'SSN Pattern',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    severity: 'critical',
    assertable: false,
    confidence: 'low',
  },
  {
    name: 'Credit Card',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/,
    severity: 'critical',
    assertable: false,
    confidence: 'low',
  },
]);

export const ASSERTABLE_SECRET_PATTERNS: readonly RegExp[] = Object.freeze(
  SECRET_PATTERN_REGISTRY.filter((entry) => entry.assertable).map((entry) => entry.pattern),
);

export const HIGH_CONFIDENCE_SECRET_NAMES: ReadonlySet<string> = Object.freeze(
  new Set(
    SECRET_PATTERN_REGISTRY.filter((entry) => entry.confidence === 'high').map(
      (entry) => entry.name,
    ),
  ),
);

export function isHighConfidenceSecretName(name: string): boolean {
  return HIGH_CONFIDENCE_SECRET_NAMES.has(name);
}

export function globalize(pattern: RegExp): RegExp {
  return new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
}
