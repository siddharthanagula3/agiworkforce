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
