/**
 * Validation Utilities
 *
 * Shared validation functions for common data types.
 * These utilities provide consistent validation across all applications.
 *
 * @module validation
 * @packageDocumentation
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface PasswordValidationResult extends ValidationResult {
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
}

/**
 * Validate an email address.
 *
 * @param email - Email address to validate
 * @returns Whether the email is valid
 *
 * @example
 * ```typescript
 * validateEmail('user@example.com'); // true
 * validateEmail('invalid'); // false
 * ```
 */
export function validateEmail(email: string): boolean {
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return false;
  if (hasWhitespace(local) || hasWhitespace(domain)) return false;

  const dot = domain.indexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

function hasWhitespace(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 32 || (code >= 9 && code <= 13)) return true;
  }
  return false;
}

/**
 * Validate a URL with optional protocol restriction.
 *
 * @param url - URL to validate
 * @param options - Validation options
 * @returns Validation result with sanitized URL
 *
 * @example
 * ```typescript
 * validateUrl('https://example.com'); // { valid: true, sanitized: 'https://example.com/' }
 * validateUrl('javascript:alert(1)'); // { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' }
 * ```
 */
export function validateUrl(
  url: string,
  options?: {
    allowedProtocols?: string[];
    blockPrivateNetworks?: boolean;
  },
): ValidationResult & { sanitized?: string } {
  const { allowedProtocols = ['http:', 'https:'], blockPrivateNetworks = true } = options ?? {};

  try {
    const parsed = new URL(url);

    if (!allowedProtocols.includes(parsed.protocol)) {
      return {
        valid: false,
        error: `Only ${allowedProtocols.map((p) => p.replace(':', '')).join(', ')} protocols are allowed`,
      };
    }

    if (blockPrivateNetworks) {
      const hostname = parsed.hostname.toLowerCase();
      const privatePatterns = [
        /^localhost$/,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^::1$/,
        /^fc00:/,
        /^fe80:/,
      ];

      if (privatePatterns.some((pattern) => pattern.test(hostname))) {
        return { valid: false, error: 'Access to private networks is not allowed' };
      }
    }

    return { valid: true, sanitized: parsed.toString() };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate a file path for security issues.
 *
 * @param path - File path to validate
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateFilePath('/home/user/file.txt'); // { valid: true }
 * validateFilePath('../../../etc/passwd'); // { valid: false, error: 'Directory traversal is not allowed' }
 * ```
 */
export function validateFilePath(path: string): ValidationResult {
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
    if (
      path.toLowerCase() === blocked.toLowerCase() ||
      path.toLowerCase().startsWith(blocked.toLowerCase() + '/')
    ) {
      return { valid: false, error: `Access to system directory ${blocked} is not allowed` };
    }
  }

  return { valid: true };
}

/**
 * Validate a password against security requirements.
 *
 * Requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 *
 * @param password - Password to validate
 * @returns Validation result with strength assessment
 *
 * @example
 * ```typescript
 * validatePassword('weak');
 * // { valid: false, errors: [...], strength: 'weak' }
 *
 * validatePassword('SecureP@ss123!');
 * // { valid: true, errors: [], strength: 'strong' }
 * ```
 */
export function validatePassword(password: string): PasswordValidationResult {
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

/**
 * Validate an API key format.
 *
 * @param apiKey - API key to validate
 * @param options - Validation options
 * @returns Whether the API key is valid
 *
 * @example
 * ```typescript
 * validateApiKey('sk_live_abc123xyz789'); // true
 * validateApiKey('short'); // false
 * ```
 */
export function validateApiKey(
  apiKey: string,
  options?: {
    minLength?: number;
    pattern?: RegExp;
  },
): boolean {
  const { minLength = 20, pattern = /^[a-zA-Z0-9_-]+$/ } = options ?? {};

  if (apiKey.length < minLength) {
    return false;
  }

  return pattern.test(apiKey);
}

/**
 * Validate JSON string.
 *
 * @param json - JSON string to validate
 * @returns Validation result with parsed data
 *
 * @example
 * ```typescript
 * validateJson('{"key": "value"}'); // { valid: true, data: { key: 'value' } }
 * validateJson('invalid'); // { valid: false, error: 'Unexpected token...' }
 * ```
 */
export function validateJson(json: string): ValidationResult & { data?: unknown } {
  try {
    const data = JSON.parse(json);
    return { valid: true, data };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid JSON',
    };
  }
}

/**
 * Validate SQL query for dangerous operations.
 *
 * Note: This is a basic check and should not be relied upon as the sole
 * security measure. Always use parameterized queries.
 *
 * @param query - SQL query to validate
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateSqlQuery('SELECT * FROM users'); // { valid: true }
 * validateSqlQuery('DROP TABLE users'); // { valid: false, error: '...' }
 * ```
 */
export function validateSqlQuery(query: string): ValidationResult {
  const dangerousPatterns = [/DROP\s+TABLE/i, /DROP\s+DATABASE/i, /TRUNCATE/i, /;\s*DROP/i];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(query)) {
      return { valid: false, error: 'Query contains potentially dangerous operation' };
    }
  }

  if (/DELETE\s+FROM\b/i.test(query) && /\bWHERE\s+1\s*=\s*1/i.test(query)) {
    return { valid: false, error: 'Query contains potentially dangerous operation' };
  }

  return { valid: true };
}

/**
 * Sanitize command-line arguments by removing dangerous characters.
 *
 * @param args - Array of arguments to sanitize
 * @returns Sanitized arguments
 *
 * @example
 * ```typescript
 * sanitizeCommandArgs(['file.txt', '; rm -rf /']);
 * // ['file.txt', ' rm -rf /']
 * ```
 */
export function sanitizeCommandArgs(args: string[]): string[] {
  return args.map((arg) => arg.replace(/[|&;<>`$()\n\r!~\\{}*?[\]]/g, ''));
}

/**
 * Check for common injection attacks in user input.
 *
 * @param input - User input to check
 * @returns Safety assessment
 *
 * @example
 * ```typescript
 * checkForInjection('normal input'); // { safe: true }
 * checkForInjection("'; DROP TABLE users--"); // { safe: false, type: 'SQL Injection' }
 * ```
 */
export function checkForInjection(input: string): { safe: boolean; type?: string } {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    /(--|;|\/\*|\*\/|xp_)/i,
    /(\bOR\b\s+\d+\s*=\s*\d+)/i,
    /(\bUNION\b.*\bSELECT\b)/i,
  ];

  for (const pattern of sqlPatterns) {
    if (pattern.test(input)) {
      return { safe: false, type: 'SQL Injection' };
    }
  }

  const commandPatterns = [/[;&|`$()]/];

  for (const pattern of commandPatterns) {
    if (pattern.test(input)) {
      return { safe: false, type: 'Command Injection' };
    }
  }

  const xssPatterns = [
    /<script\b/i, // Match opening script tag (catches all script tags)
    /<\/script\s*\/?>/i, // Match closing script tag with optional space/slash
    /javascript:/i,
    /^on\w+\s*=/i,
    /[^\w-]on\w{1,32}\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
  ];

  for (const pattern of xssPatterns) {
    if (pattern.test(input)) {
      return { safe: false, type: 'XSS' };
    }
  }

  if (/<svg\b/i.test(input) && /\bon\w+/i.test(input)) {
    return { safe: false, type: 'XSS' };
  }

  return { safe: true };
}
