
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

export function scanForSecrets(content: string): SecretDetection[] {
  const detections: SecretDetection[] = [];

  for (const { name, pattern, severity } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const matchedText = match[0];

      if (name === 'JWT' && isPublicNeonKey(matchedText)) {
        continue;
      }

      const masked =
        matchedText.length > 12 ? `${matchedText.slice(0, 4)}****${matchedText.slice(-4)}` : '****';

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

export function redactSecrets(content: string): string {
  let redacted = content;

  for (const { name, pattern } of SECRET_PATTERNS) {
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

export function safeLog(message: string, data?: unknown): void {
  const safeMessage = redactSecrets(message);
  const safeData = data ? JSON.parse(redactSecrets(JSON.stringify(data))) : undefined;

  if (process.env.NODE_ENV === 'production') {
    if (!containsSecrets(message) && (!data || !containsSecrets(JSON.stringify(data)))) {
      console.log(safeMessage, safeData);
    } else {
      console.log('[LOG REDACTED - contained sensitive data]');
    }
  } else {
    console.log(safeMessage, safeData);
  }
}

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

export function isResponseSafe(body: unknown): boolean {
  const stringified = typeof body === 'string' ? body : JSON.stringify(body);
  return !containsSecrets(stringified);
}
