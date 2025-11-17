/**
 * Input validation utilities for security
 * Updated Nov 16, 2025: Migrated security functions to security.ts
 */

import {
  checkForInjection as checkForInjectionSecure,
  escapeHtml as escapeHtmlSecure,
  sanitizeHtml as sanitizeHtmlSecure,
} from './security';

/**
 * Validate email address format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 * @deprecated Use validateUrl from security.ts for better security
 * Updated Nov 16, 2025: Deprecated in favor of security.ts version
 */
export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate file path (prevent directory traversal)
 */
export function validateFilePath(path: string): { valid: boolean; error?: string } {
  // Check for directory traversal attempts
  if (path.includes('..')) {
    return { valid: false, error: 'Directory traversal is not allowed' };
  }

  // Check for absolute paths to system directories (Windows)
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

  // Check for absolute paths to system directories (Unix/macOS)
  const blockedUnixPaths = ['/etc', '/sys', '/proc', '/dev', '/boot', '/root'];

  for (const blocked of blockedUnixPaths) {
    if (path.startsWith(blocked)) {
      return { valid: false, error: `Access to system directory ${blocked} is not allowed` };
    }
  }

  return { valid: true };
}

/**
 * Sanitize HTML content to prevent XSS
 * @deprecated Use sanitizeHtml from security.ts with DOMPurify
 * Updated Nov 16, 2025: Deprecated - this function only escapes text, doesn't sanitize HTML
 */
export function sanitizeHtml(html: string): string {
  console.warn('DEPRECATED: Use sanitizeHtml from security.ts for proper HTML sanitization');
  return sanitizeHtmlSecure(html);
}

/**
 * Escape HTML entities
 * @deprecated Use escapeHtml from security.ts
 * Updated Nov 16, 2025: Migrated to security.ts
 */
export function escapeHtml(text: string): string {
  return escapeHtmlSecure(text);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
} {
  const errors: string[] = [];
  let strength: 'weak' | 'medium' | 'strong' = 'weak';

  // Minimum length
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  // Check for uppercase
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check for lowercase
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Check for numbers
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Check for special characters
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Calculate strength
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

/**
 * Validate API key format
 */
export function validateApiKey(apiKey: string): boolean {
  // API keys should be at least 20 characters and alphanumeric with hyphens/underscores
  if (apiKey.length < 20) {
    return false;
  }

  const apiKeyRegex = /^[a-zA-Z0-9_-]+$/;
  return apiKeyRegex.test(apiKey);
}

/**
 * Sanitize command-line arguments
 */
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

/**
 * Validate JSON string
 */
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

/**
 * Validate SQL query (basic check for dangerous operations)
 */
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

/**
 * Validate input against common injection patterns
 * @deprecated Use checkForInjection from security.ts for improved detection
 * Updated Nov 16, 2025: Migrated to security.ts with enhanced patterns
 */
export function checkForInjection(input: string): { safe: boolean; type?: string } {
  return checkForInjectionSecure(input);
}

/**
 * Rate limiting helper for client-side
 */
export class ClientRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request is allowed
   */
  checkLimit(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Remove old requests outside the window
    const validRequests = requests.filter((timestamp) => now - timestamp < this.windowMs);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(key, validRequests);

    return true;
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clearAll(): void {
    this.requests.clear();
  }
}
