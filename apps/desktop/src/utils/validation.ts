import {
  checkForInjection as checkForInjectionSecure,
  escapeHtml as escapeHtmlSecure,
  sanitizeHtml as sanitizeHtmlSecure,
} from './security';

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http://' || parsed.protocol === 'https://';
  } catch {
    return false;
  }
}

export function validateFilePath(path: string): { valid: boolean; error?: string } {
  if (path.includes('..')) {
    return { valid: false, error: 'Directory traversal is not allowed' };
  }

  const blockedWindowsPaths = [
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData',
  ];

  for (const blocked of blockedWindowsPaths) {
    if (path.toLowerCase().startsWith(blocked.toLowerCase())) {
      return { valid: false, error: `Access to system directory ${blocked} is not allowed` };
    }
  }

  const blockedUnixPaths = ['/etc', '/sys', '/proc', '/dev', '/boot', '/root'];

  for (const blocked of blockedUnixPaths) {
    if (path.startsWith(blocked)) {
      return { valid: false, error: `Access to system directory ${blocked} is not allowed` };
    }
  }

  return { valid: true };
}

export function sanitizeHtml(html: string): string {
  console.warn('DEPRECATED: Use sanitizeHtml from security.ts for proper HTML sanitization');
  return sanitizeHtmlSecure(html);
}

export function escapeHtml(text: string): string {
  return escapeHtmlSecure(text);
}

export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
} {
  const errors: string[] = [];
  let strength: 'weak' | 'medium' | 'strong' = 'weak';

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  if (errors.length === 0) {
    if (password.length >= 12) {
      strength = 'strong';
    } else {
      strength = 'medium';
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    strength,
  };
}

export function validateApiKey(apiKey: string): boolean {
  if (apiKey.length < 20) {
    return false;
  }

  const apiKeyRegex = /^[a-zA-Z0-9_-]+$/;
  return apiKeyRegex.test(apiKey);
}

export function sanitizeCommandArgs(args: string[]): string[] {
  const dangerousChars = ['|', '&', ';', '>', '<', '`', '$', '(', ')', '\n', '\r'];

  return args.map((arg) => {
    let sanitized = arg;
    for (const char of dangerousChars) {
      sanitized = sanitized.replace(new RegExp(`\\${char}`, 'g'), '');
    }
    return sanitized;
  });
}

export function validateJson(json: string): { valid: boolean; error?: string } {
  try {
    JSON.parse(json);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid JSON',
    };
  }
}

export function validateSqlQuery(query: string): { valid: boolean; error?: string } {
  const dangerousPatterns = [
    /DROP\s+TABLE/i,
    /DROP\s+DATABASE/i,
    /TRUNCATE/i,
    /DELETE\s+FROM\s+.*\s+WHERE\s+1\s*=\s*1/i,
    /;\s*DROP/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(query)) {
      return { valid: false, error: 'Query contains potentially dangerous operation' };
    }
  }

  return { valid: true };
}

export function checkForInjection(input: string): { safe: boolean; type?: string } {
  return checkForInjectionSecure(input);
}

export class ClientRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  checkLimit(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    const validRequests = requests.filter((timestamp) => now - timestamp < this.windowMs);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(key, validRequests);

    return true;
  }

  reset(key: string): void {
    this.requests.delete(key);
  }

  clearAll(): void {
    this.requests.clear();
  }
}
