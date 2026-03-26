/**
 * Secrets Audit Utility
 *
 * Helps detect potential secret leaks in logs, responses, and user-facing content.
 * Run these checks before logging or returning data to clients.
 */

// Common patterns that indicate secrets or sensitive data
const SECRET_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
}> = [
  // API Keys
  { name: 'Stripe Secret Key', pattern: /sk_live_[a-zA-Z0-9]{24,}/g, severity: 'critical' },
  { name: 'Stripe Test Key', pattern: /sk_test_[a-zA-Z0-9]{24,}/g, severity: 'high' },
  {
    name: 'Supabase Service Role',
    pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    severity: 'critical',
  },
  // NOTE: The above JWT pattern also matches the Supabase anon key, which is a
  // public, non-secret key. Use isPublicSupabaseKey() below to filter false positives.
  { name: 'OpenAI API Key', pattern: /sk-[a-zA-Z0-9]{48,}/g, severity: 'critical' },
  { name: 'Anthropic API Key', pattern: /sk-ant-[a-zA-Z0-9-]{90,}/g, severity: 'critical' },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z_-]{35}/g, severity: 'critical' },

  // Generic patterns
  {
    name: 'Generic API Key',
    pattern: /api[_-]?key[=:]\s*["']?[a-zA-Z0-9]{20,}["']?/gi,
    severity: 'high',
  },
  {
    name: 'Generic Secret',
    pattern: /secret[=:]\s*["']?[a-zA-Z0-9]{20,}["']?/gi,
    severity: 'high',
  },
  { name: 'Password in URL', pattern: /password[=:][^&\s]{8,}/gi, severity: 'critical' },

  // AWS
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
  {
    name: 'AWS Secret Key',
    pattern: /aws[_-]?secret[_-]?access[_-]?key[=:]\s*["']?[A-Za-z0-9/+=]{40}["']?/gi,
    severity: 'critical',
  },

  // GitHub
  { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/g, severity: 'critical' },
  { name: 'GitHub OAuth', pattern: /gho_[a-zA-Z0-9]{36}/g, severity: 'critical' },

  // Database
  {
    name: 'Database URL with Credentials',
    pattern: /postgres(ql)?:\/\/[^:]+:[^@]+@[^/]+/gi,
    severity: 'critical',
  },
  {
    name: 'MongoDB URL with Credentials',
    pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@[^/]+/gi,
    severity: 'critical',
  },

  // Private Keys
  {
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    severity: 'critical',
  },

  // Tokens
  { name: 'Bearer Token', pattern: /Bearer\s+[a-zA-Z0-9_-]{20,}/g, severity: 'high' },
  { name: 'Basic Auth', pattern: /Basic\s+[a-zA-Z0-9+/=]{20,}/g, severity: 'high' },

  // Personal Data
  {
    name: 'Email in sensitive context',
    pattern: /password.*@.*\.(com|org|net|io)/gi,
    severity: 'medium',
  },
  { name: 'SSN Pattern', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, severity: 'critical' },
  {
    name: 'Credit Card',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
    severity: 'critical',
  },
];

/**
 * Check if a JWT is a Supabase anon key (public, non-secret).
 * Supabase anon keys have a payload containing "role":"anon" and are safe to expose.
 */
function isPublicSupabaseKey(jwt: string): boolean {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]!));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

export interface SecretDetection {
  name: string;
  severity: 'critical' | 'high' | 'medium';
  position: number;
  preview: string; // Masked preview showing context
}

/**
 * Scan content for potential secrets.
 * Returns array of detected patterns with masked previews.
 */
export function scanForSecrets(content: string): SecretDetection[] {
  const detections: SecretDetection[] = [];

  for (const { name, pattern, severity } of SECRET_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const matchedText = match[0];

      // Skip Supabase anon keys (public, non-secret JWTs)
      if (name === 'Supabase Service Role' && isPublicSupabaseKey(matchedText)) {
        continue;
      }

      // Create a masked preview (show first 4 and last 4 chars)
      const masked =
        matchedText.length > 12 ? `${matchedText.slice(0, 4)}****${matchedText.slice(-4)}` : '****';

      // Get surrounding context
      const start = Math.max(0, match.index - 20);
      const end = Math.min(content.length, match.index + matchedText.length + 20);
      const context = content.slice(start, end).replace(matchedText, masked);

      detections.push({
        name,
        severity,
        position: match.index,
        preview: `...${context}...`,
      });
    }
  }

  return detections;
}

/**
 * Check if content contains any secrets.
 * Use this for quick boolean checks before logging.
 */
export function containsSecrets(content: string): boolean {
  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip Supabase anon keys (public, non-secret)
      if (name === 'Supabase Service Role' && isPublicSupabaseKey(match[0])) {
        continue;
      }
      return true;
    }
  }
  return false;
}

/**
 * Redact secrets from content for safe logging.
 * Replaces detected secrets with [REDACTED].
 */
export function redactSecrets(content: string): string {
  let redacted = content;

  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (name === 'Supabase Service Role') {
      // Preserve public anon keys, only redact service role keys
      redacted = redacted.replace(pattern, (match) =>
        isPublicSupabaseKey(match) ? match : '[REDACTED]',
      );
    } else {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
  }

  return redacted;
}

/**
 * Safe logging wrapper that automatically redacts secrets.
 * Use this instead of console.log for any potentially sensitive data.
 */
export function safeLog(message: string, data?: unknown): void {
  const safeMessage = redactSecrets(message);
  const safeData = data ? JSON.parse(redactSecrets(JSON.stringify(data))) : undefined;

  if (process.env.NODE_ENV === 'production') {
    // In production, only log if no secrets were detected
    if (!containsSecrets(message) && (!data || !containsSecrets(JSON.stringify(data)))) {
      // eslint-disable-next-line no-console
      console.log(safeMessage, safeData);
    } else {
      // eslint-disable-next-line no-console
      console.log('[LOG REDACTED - contained sensitive data]');
    }
  } else {
    // In development, log with redaction
    // eslint-disable-next-line no-console
    console.log(safeMessage, safeData);
  }
}

/**
 * Validate environment variables don't contain obvious test/placeholder values.
 */
export function validateEnvNotPlaceholder(_envName: string, value: string | undefined): boolean {
  if (!value) return false;

  const placeholderPatterns = [
    /^your[_-]?/i,
    /^placeholder/i,
    /^changeme/i,
    /^xxx+$/i,
    /^test[_-]?key/i,
    /^example/i,
    /^TODO/i,
  ];

  return !placeholderPatterns.some((pattern) => pattern.test(value));
}

/**
 * Check if a response body is safe to return to the client.
 * Returns true if safe, false if it contains secrets.
 */
export function isResponseSafe(body: unknown): boolean {
  const stringified = typeof body === 'string' ? body : JSON.stringify(body);
  return !containsSecrets(stringified);
}
