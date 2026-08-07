/**
 * Secrets Audit Utility
 *
 * Non-throwing detection and redaction of secret-shaped strings, for logs,
 * responses, and user-facing content. The throwing guard is
 * `lib/leak-detector.ts`; both draw their patterns from the single registry in
 * `./secret-patterns` so the two lists cannot drift apart.
 */

import { SECRET_PATTERN_REGISTRY, globalize, type SecretSeverity } from './secret-patterns';

// Global-flag copies for exec/replace loops, built once. The registry stores
// non-global patterns on purpose: a shared global regex carries mutable
// `lastIndex` and would skip matches depending on call order.
const SECRET_PATTERNS = SECRET_PATTERN_REGISTRY.map((entry) => ({
  name: entry.name,
  severity: entry.severity,
  pattern: globalize(entry.pattern),
}));

/**
 * Check if a JWT is a Neon anon key (public, non-secret).
 * Neon anon keys have a payload containing "role":"anon" and are safe to expose.
 */
function isPublicNeonKey(jwt: string): boolean {
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
  severity: SecretSeverity;
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

      // Skip Neon anon keys (public, non-secret JWTs)
      if (name === 'JWT' && isPublicNeonKey(matchedText)) {
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
      // Skip Neon anon keys (public, non-secret)
      if (name === 'JWT' && isPublicNeonKey(match[0])) {
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
    if (name === 'JWT') {
      // Preserve public anon keys, only redact service role keys
      redacted = redacted.replace(pattern, (match) =>
        isPublicNeonKey(match) ? match : '[REDACTED]',
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
      console.log(safeMessage, safeData);
    } else {
      console.log('[LOG REDACTED - contained sensitive data]');
    }
  } else {
    // In development, log with redaction
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
