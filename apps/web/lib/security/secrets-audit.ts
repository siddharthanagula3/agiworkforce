import { findHighEntropyStrings, HIGH_ENTROPY_DETECTION_NAME } from './entropy';
import { SECRET_PATTERN_REGISTRY, globalize, type SecretSeverity } from './secret-patterns';

const SECRET_PATTERNS = SECRET_PATTERN_REGISTRY.map((entry) => ({
  name: entry.name,
  severity: entry.severity,
  pattern: globalize(entry.pattern),
}));

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
  preview: string;
}

export interface SecretScanOptions {
  /**
   * Adds the entropy detector, which recognises no format and therefore
   * reports rather than asserts. Off by default so that no redaction or
   * refusal can be driven by a guess.
   */
  includeHighEntropy?: boolean;
}

function mask(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}****${value.slice(-4)}` : '****';
}

export function scanForSecrets(
  content: string,
  options: SecretScanOptions = {},
): SecretDetection[] {
  const detections: SecretDetection[] = [];

  for (const { name, pattern, severity } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const matchedText = match[0];

      if (name === 'JWT' && isPublicNeonKey(matchedText)) {
        continue;
      }

      const masked = mask(matchedText);

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

  if (options.includeHighEntropy) {
    const covered = new Set(detections.map((detection) => detection.position));
    for (const candidate of findHighEntropyStrings(content)) {
      if (covered.has(candidate.position)) continue;
      detections.push({
        name: HIGH_ENTROPY_DETECTION_NAME,
        severity: 'medium',
        position: candidate.position,
        preview: `...${mask(candidate.value)} (${candidate.entropyBits.toFixed(2)} bits/char)...`,
      });
    }
  }

  return detections;
}

export function containsSecrets(content: string): boolean {
  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (name === 'JWT' && isPublicNeonKey(match[0])) {
        continue;
      }
      return true;
    }
  }
  return false;
}

export function redactAuditedSecrets(content: string, allowedNames?: ReadonlySet<string>): string {
  let redacted = content;

  for (const { name, pattern } of SECRET_PATTERNS) {
    if (allowedNames && !allowedNames.has(name)) continue;
    pattern.lastIndex = 0;
    if (name === 'JWT') {
      redacted = redacted.replace(pattern, (match) =>
        isPublicNeonKey(match) ? match : '[REDACTED]',
      );
    } else {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
  }

  return redacted;
}

const VALUE_SCAN_BOUNDARY = '\0AGI-SECRET-SCAN-BOUNDARY\0';

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
}

function replaceStrings(
  value: unknown,
  replacements: string[],
  cursor: { index: number },
): unknown {
  if (typeof value === 'string') {
    const next = replacements[cursor.index] ?? value;
    cursor.index += 1;
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceStrings(item, replacements, cursor));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = replaceStrings(item, replacements, cursor);
    }
    return result;
  }
  return value;
}

export interface ValueSecretScanResult<T> {
  value: T;
  detections: SecretDetection[];
}

export function scanValueForSecrets(value: unknown): SecretDetection[] {
  const strings: string[] = [];
  collectStrings(value, strings);
  if (strings.length === 0) return [];
  return scanForSecrets(strings.join(VALUE_SCAN_BOUNDARY));
}

export class SecretRedactionIncompleteError extends Error {
  readonly patternNames: readonly string[];

  constructor(patternNames: readonly string[]) {
    super('Secret redaction left a match in place');
    this.name = 'SecretRedactionIncompleteError';
    this.patternNames = patternNames;
    Object.setPrototypeOf(this, SecretRedactionIncompleteError.prototype);
  }
}

/**
 * Redacts one string at a time. Joining every string, redacting the join and
 * splitting it apart again loses the mapping whenever a replacement eats a
 * boundary, and the fallback for a short split was the caller's own unredacted
 * value. The result is checked before it is returned, so a caller can never be
 * handed a value this function has told it was redacted.
 */
export function redactSecretsFromValue<T>(value: T): ValueSecretScanResult<T> {
  const strings: string[] = [];
  collectStrings(value, strings);
  if (strings.length === 0) return { value, detections: [] };

  const detections = scanForSecrets(strings.join(VALUE_SCAN_BOUNDARY));
  if (detections.length === 0) return { value, detections };

  const redactedStrings = strings.map((text) => redactAuditedSecrets(text));

  const residue = scanForSecrets(redactedStrings.join(VALUE_SCAN_BOUNDARY));
  if (residue.length > 0) {
    throw new SecretRedactionIncompleteError([...new Set(residue.map((entry) => entry.name))]);
  }

  const cursor = { index: 0 };
  return { value: replaceStrings(value, redactedStrings, cursor) as T, detections };
}
