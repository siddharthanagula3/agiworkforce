/**
 * Security utilities for XSS prevention, HTML sanitization, and CSRF protection
 * Updated Nov 16, 2025
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * Uses DOMPurify with strict configuration
 * Updated Nov 16, 2025
 */
export function sanitizeHtml(
  html: string,
  options?: {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    allowLinks?: boolean;
  },
): string {
  const config: DOMPurify.Config = {
    ALLOWED_TAGS: options?.allowedTags || [
      'p',
      'br',
      'strong',
      'em',
      'u',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'div',
      'span',
    ],
    ALLOWED_ATTR: options?.allowedAttributes || ['class', 'id'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SAFE_FOR_TEMPLATES: true,
  };

  // Add link support if explicitly allowed
  if (options?.allowLinks) {
    config.ALLOWED_TAGS?.push('a');
    if (config.ALLOWED_ATTR) {
      config.ALLOWED_ATTR.push('href', 'target', 'rel');
    }
    // Add hook to ensure external links have proper security attributes
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        const anchor = node as HTMLAnchorElement;
        if (anchor.getAttribute('target') === '_blank') {
          anchor.setAttribute('rel', 'noopener noreferrer');
        }
        // Prevent javascript: and data: URLs
        const href = anchor.getAttribute('href');
        if (href && !/^https?:\/\//i.test(href)) {
          anchor.removeAttribute('href');
        }
      }
    });
  }

  return DOMPurify.sanitize(html, config);
}

/**
 * Sanitize email HTML content (more permissive for email rendering)
 * Updated Nov 16, 2025
 */
export function sanitizeEmailHtml(html: string): string {
  const config: DOMPurify.Config = {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      'b',
      'i',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'div',
      'span',
      'a',
      'img',
      'hr',
    ],
    ALLOWED_ATTR: ['class', 'id', 'href', 'target', 'rel', 'src', 'alt', 'title', 'style'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SAFE_FOR_TEMPLATES: true,
  };

  // Add hooks for security
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Set all external links to open in new tab with security attributes
    if (node.tagName === 'A') {
      const anchor = node as HTMLAnchorElement;
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');

      // Prevent javascript: and data: URLs
      const href = anchor.getAttribute('href');
      if (href && !/^(?:https?:|mailto:|tel:)/i.test(href)) {
        anchor.removeAttribute('href');
      }
    }

    // Sanitize image sources
    if (node.tagName === 'IMG') {
      const img = node as HTMLImageElement;
      const src = img.getAttribute('src');
      if (src && !/^(?:https?:|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,)/i.test(src)) {
        img.removeAttribute('src');
      }
    }
  });

  return DOMPurify.sanitize(html, config);
}

/**
 * Sanitize markdown-rendered HTML
 * Updated Nov 16, 2025
 */
export function sanitizeMarkdownHtml(html: string): string {
  const config: DOMPurify.Config = {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'a',
      'hr',
      'del',
      'ins',
    ],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SAFE_FOR_TEMPLATES: true,
  };

  // Secure all links
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const anchor = node as HTMLAnchorElement;
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');

      const href = anchor.getAttribute('href');
      if (href && !/^https?:\/\//i.test(href)) {
        anchor.removeAttribute('href');
      }
    }
  });

  return DOMPurify.sanitize(html, config);
}

/**
 * Escape HTML entities (for displaying HTML as text)
 * Updated Nov 16, 2025
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Validate and sanitize URL
 * Updated Nov 16, 2025
 */
export function validateUrl(url: string): { valid: boolean; sanitized?: string; error?: string } {
  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }

    // Prevent localhost and private IP access in production
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

    // Only warn in development, block in production
    if (import.meta.env.PROD && privatePatterns.some((pattern) => pattern.test(hostname))) {
      return { valid: false, error: 'Access to private networks is not allowed' };
    }

    return { valid: true, sanitized: parsed.toString() };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate URL search parameters
 * Updated Nov 16, 2025
 */
export function validateSearchParams(
  params: URLSearchParams,
  allowedKeys: string[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const keys = Array.from(params.keys());

  for (const key of keys) {
    if (!allowedKeys.includes(key)) {
      errors.push(`Unexpected parameter: ${key}`);
    }

    const value = params.get(key);
    if (value) {
      // Check for XSS patterns in parameters
      const xssPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe/i,
        /<object/i,
        /<embed/i,
      ];

      for (const pattern of xssPatterns) {
        if (pattern.test(value)) {
          errors.push(`Potentially malicious content in parameter: ${key}`);
          break;
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate CSRF token (for client-side)
 * Updated Nov 16, 2025
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get CSRF token from storage or generate new one
 * Updated Nov 16, 2025
 */
export function getCsrfToken(): string {
  const storageKey = 'csrf_token';
  let token = sessionStorage.getItem(storageKey);

  if (!token) {
    token = generateCsrfToken();
    sessionStorage.setItem(storageKey, token);
  }

  return token;
}

/**
 * Add CSRF token to fetch headers
 * Updated Nov 16, 2025
 */
export function addCsrfHeaders(headers: HeadersInit = {}): HeadersInit {
  const token = getCsrfToken();
  return {
    ...headers,
    'X-CSRF-Token': token,
  };
}

/**
 * Check for common injection patterns
 * Updated Nov 16, 2025
 */
export function checkForInjection(input: string): { safe: boolean; type?: string } {
  // SQL injection patterns
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

  // Command injection patterns
  const commandPatterns = [/[;&|`$()]/];

  for (const pattern of commandPatterns) {
    if (pattern.test(input)) {
      return { safe: false, type: 'Command Injection' };
    }
  }

  // XSS patterns
  const xssPatterns = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
  ];

  for (const pattern of xssPatterns) {
    if (pattern.test(input)) {
      return { safe: false, type: 'XSS' };
    }
  }

  return { safe: true };
}

/**
 * Content Security Policy configuration
 * Updated Nov 16, 2025
 */
export const CSP_CONFIG = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Monaco Editor requires unsafe-eval
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'https:', 'blob:'],
  'connect-src': [
    "'self'",
    'https://api.openai.com',
    'https://api.anthropic.com',
    'https://generativelanguage.googleapis.com',
    'http://localhost:*', // For local development and Ollama
  ],
  'media-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
};

/**
 * Generate CSP header value
 * Updated Nov 16, 2025
 */
export function generateCspHeader(): string {
  return Object.entries(CSP_CONFIG)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive;
      }
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}
