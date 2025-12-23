

import DOMPurify from 'dompurify';


export function sanitizeHtml(
  html: string,
  options?: {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    allowLinks?: boolean;
  },
): string {
  const config: any = {
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

  
  if (options?.allowLinks) {
    config.ALLOWED_TAGS?.push('a');
    if (config.ALLOWED_ATTR) {
      config.ALLOWED_ATTR.push('href', 'target', 'rel');
    }
    
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        const anchor = node as HTMLAnchorElement;
        if (anchor.getAttribute('target') === '_blank') {
          anchor.setAttribute('rel', 'noopener noreferrer');
        }
        
        const href = anchor.getAttribute('href');
        if (href && !/^https?:\/\//.test(href)) {
          anchor.removeAttribute('href');
        }
      }
    });
  }

  return DOMPurify.sanitize(html, config) as unknown as string;
}


export function sanitizeEmailHtml(html: string): string {
  const config: any = {
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

  
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    
    if (node.tagName === 'A') {
      const anchor = node as HTMLAnchorElement;
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');

      
      const href = anchor.getAttribute('href');
      if (href && !/^(?:https?:|mailto:|tel:)/i.test(href)) {
        anchor.removeAttribute('href');
      }
    }

    
    if (node.tagName === 'IMG') {
      const img = node as HTMLImageElement;
      const src = img.getAttribute('src');
      if (src && !/^(?:https?:|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,)/i.test(src)) {
        img.removeAttribute('src');
      }
    }
  });

  return DOMPurify.sanitize(html, config) as unknown as string;
}


export function sanitizeMarkdownHtml(html: string): string {
  const config: any = {
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

  
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const anchor = node as HTMLAnchorElement;
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');

      const href = anchor.getAttribute('href');
      if (href && !/^https?:\/\//.test(href)) {
        anchor.removeAttribute('href');
      }
    }
  });

  return DOMPurify.sanitize(html, config) as unknown as string;
}


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


export function validateUrl(url: string): { valid: boolean; sanitized?: string; error?: string } {
  try {
    const parsed = new URL(url);

    
    if (parsed.protocol !== 'http://' && parsed.protocol !== 'https://') {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }

    
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

    
    if (import.meta.env.PROD && privatePatterns.some((pattern) => pattern.test(hostname))) {
      return { valid: false, error: 'Access to private networks is not allowed' };
    }

    return { valid: true, sanitized: parsed.toString() };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}


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


export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}


export function getCsrfToken(): string {
  const storageKey = 'csrf_token';
  let token = sessionStorage.getItem(storageKey);

  if (!token) {
    token = generateCsrfToken();
    sessionStorage.setItem(storageKey, token);
  }

  return token;
}


export function addCsrfHeaders(headers: HeadersInit = {}): HeadersInit {
  const token = getCsrfToken();
  return {
    ...headers,
    'X-CSRF-Token': token,
  };
}


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


export const CSP_CONFIG = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'https://*', 'blob:'],
  'connect-src': [
    "'self'",
    'https://api.agiworkforce.com',
    'https://api.openai.com',
    'https://api.anthropic.com',
    'http://localhost:*',
  ],
  'media-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
};


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
