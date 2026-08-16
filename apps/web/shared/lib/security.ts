import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify';
import { MAX_CHAT_ATTACHMENT_BYTES } from '@agiworkforce/cloud-contracts';

export interface SanitizeOptions {
  allowedTags?: string[];
  allowedAttributes?: string[];
  allowedSchemes?: string[];
  stripIgnoreTag?: boolean;
  stripIgnoreTagBody?: boolean;
}

export class SecurityManager {
  private encryptionKey: CryptoKey | null = null;
  private static readonly ENCRYPTION_SALT = 'agiagent-security-salt-v1';
  private static readonly KEY_ITERATIONS = 100000;

  private getKeySource(): string {
    const envKey =
      typeof process !== 'undefined' && process.env ? process.env['ENCRYPTION_KEY'] : undefined;

    if (envKey && envKey.length >= 32) {
      return envKey;
    }

    const isProduction =
      (typeof process !== 'undefined' && process.env && process.env['NODE_ENV'] === 'production') ||
      (typeof window !== 'undefined' &&
        window.location?.hostname !== 'localhost' &&
        !window.location?.hostname?.startsWith('127.') &&
        !window.location?.hostname?.endsWith('.local'));

    if (isProduction) {
      throw new Error(
        'ENCRYPTION_KEY environment variable is required in production ' +
          '(minimum 32 characters). SecurityManager cannot use a deterministic fallback key.',
      );
    }

    if (typeof window !== 'undefined') {
      console.warn(
        '[SecurityManager] No ENCRYPTION_KEY available client-side. ' +
          'Using development fallback. Encryption should be done server-side in production.',
      );
    }

    console.warn(
      '[SecurityManager] Using development fallback encryption key. ' +
        'Set ENCRYPTION_KEY (>=32 chars) for production.',
    );
    const factors = [
      'agi-agent-dev-encryption-key',
      typeof window !== 'undefined' ? window.location.origin : 'server',
      'v1',
    ];
    return factors.join('-');
  }

  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    if (typeof window === 'undefined' || !window.crypto?.subtle) {
      throw new Error(
        'Web Crypto API not available. Encryption requires a secure context (HTTPS).',
      );
    }

    try {
      const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(this.getKeySource()),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey'],
      );

      this.encryptionKey = await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: new TextEncoder().encode(SecurityManager.ENCRYPTION_SALT),
          iterations: SecurityManager.KEY_ITERATIONS,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false, // Not extractable for security
        ['encrypt', 'decrypt'],
      );

      return this.encryptionKey;
    } catch (error) {
      console.error('Failed to derive encryption key:', error);
      throw new Error('Encryption key derivation failed');
    }
  }

  /**
   * Asynchronously encrypt a plaintext string using AES-GCM.
   * Returns a base64-encoded string containing IV + ciphertext.
   *
   * @param plaintext - The string to encrypt
   * @returns Promise resolving to base64-encoded encrypted data
   */
  async encryptAsync(plaintext: string): Promise<string> {
    if (!plaintext) {
      return '';
    }

    try {
      const key = await this.getEncryptionKey();

      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      const encoded = new TextEncoder().encode(plaintext);

      const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

      const combined = new Uint8Array(iv.length + ciphertext.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(ciphertext), iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Asynchronously decrypt an encrypted string using AES-GCM.
   * Expects a base64-encoded string containing IV + ciphertext.
   *
   * @param encryptedData - Base64-encoded encrypted data
   * @returns Promise resolving to decrypted plaintext
   */
  async decryptAsync(encryptedData: string): Promise<string> {
    if (!encryptedData) {
      return '';
    }

    try {
      const key = await this.getEncryptionKey();

      const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));

      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext,
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  isEncryptionAvailable(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.crypto !== undefined &&
      window.crypto.subtle !== undefined
    );
  }

  clearEncryptionKey(): void {
    this.encryptionKey = null;
  }

  private static defaultSanitizeConfig: DOMPurifyConfig = {
    ALLOWED_TAGS: [
      'a',
      'b',
      'strong',
      'i',
      'em',
      'u',
      'span',
      'div',
      'p',
      'br',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'code',
      'pre',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
    ],
    ALLOWED_ATTR: [
      'href',
      'title',
      'alt',
      'src',
      'class',
      'id',
      'target',
      'rel',
      'width',
      'height',
      'style',
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'textarea'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  };

  static sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
    if (!html) return '';

    const config: DOMPurifyConfig = {
      ...this.defaultSanitizeConfig,
      ...(options.allowedTags && { ALLOWED_TAGS: options.allowedTags }),
      ...(options.allowedAttributes && {
        ALLOWED_ATTR: options.allowedAttributes,
      }),
    };

    return DOMPurify.sanitize(html, config) as string;
  }

  static sanitizeText(text: string): string {
    if (!text) return '';

    return DOMPurify.sanitize(text, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    });
  }

  static sanitizeUrl(url: string): string {
    if (!url) return '';

    let sanitized = url;
    let prev;
    do {
      prev = sanitized;
      sanitized = sanitized.replace(/^(javascript|data|vbscript):/i, '');
    } while (sanitized !== prev);

    if (!/^(https?:|mailto:|tel:|#|\/)/i.test(sanitized)) {
      return `https://${sanitized}`;
    }

    return sanitized;
  }

  static escapeHtml(text: string): string {
    if (!text) return '';

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  static unescapeHtml(html: string): string {
    if (!html) return '';

    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
  }

  static sanitizeJson<T = unknown>(jsonString: string, maxDepth: number = 10): T | null {
    try {
      const parsed = JSON.parse(jsonString);
      return this.deepSanitize(parsed, maxDepth) as T;
    } catch (error) {
      console.error('JSON sanitization failed:', error);
      return null;
    }
  }

  private static deepSanitize(obj: unknown, maxDepth: number, currentDepth = 0): unknown {
    if (currentDepth >= maxDepth) {
      return null;
    }

    if (typeof obj === 'string') {
      return this.sanitizeText(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepSanitize(item, maxDepth, currentDepth + 1));
    }

    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanKey = this.sanitizeText(key);
        if (cleanKey) {
          sanitized[cleanKey] = this.deepSanitize(value, maxDepth, currentDepth + 1);
        }
      }
      return sanitized;
    }

    return null;
  }

  static validateFileUpload(file: File): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const maxSize = MAX_CHAT_ATTACHMENT_BYTES;
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'text/csv',
      'application/json',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (file.size > maxSize) {
      errors.push('File size exceeds 10MB limit');
    }

    if (!allowedTypes.includes(file.type)) {
      errors.push(`File type ${file.type} is not allowed`);
    }

    const suspiciousPatterns = [
      /\.exe$/i,
      /\.bat$/i,
      /\.cmd$/i,
      /\.scr$/i,
      /\.vbs$/i,
      /\.js$/i,
      /\.jar$/i,
      /\.php$/i,
      /\.asp$/i,
      /\.jsp$/i,
    ];

    if (suspiciousPatterns.some((pattern) => pattern.test(file.name))) {
      errors.push('File type not allowed based on extension');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static generateSecureId(length: number = 32): string {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const array = new Uint8Array(length);
      window.crypto.getRandomValues(array);
      return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
    } else if (typeof globalThis !== 'undefined' && 'crypto' in globalThis) {
      const array = new Uint8Array(length);

      (globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(array);
      return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    throw new Error('No cryptographically secure random number generator available');
  }

  static async hashString(input: string): Promise<string> {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  static validatePassword(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
    } else {
      score += 1;
    }

    if (!/[a-z]/.test(password)) {
      feedback.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    if (!/[A-Z]/.test(password)) {
      feedback.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    if (!/\d/.test(password)) {
      feedback.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      feedback.push('Password must contain at least one special character');
    } else {
      score += 1;
    }

    const weakPatterns = [
      /(.)\1{2,}/i, // repeated characters
      /123456|password|qwerty|admin/i, // common weak passwords
      /(.)(.)\1\2/i, // alternating patterns
    ];

    if (weakPatterns.some((pattern) => pattern.test(password))) {
      feedback.push('Password contains weak patterns');
      score = Math.max(0, score - 1);
    }

    return {
      isValid: score >= 4,
      score,
      feedback,
    };
  }

  static createRateLimiter(windowMs: number, maxRequests: number) {
    const requests = new Map<string, number[]>();

    return (key: string): boolean => {
      const now = Date.now();
      const windowStart = now - windowMs;

      const keyRequests = requests.get(key) || [];

      const validRequests = keyRequests.filter((time) => time > windowStart);

      if (validRequests.length >= maxRequests) {
        if (validRequests.length > 0) {
          requests.set(key, validRequests);
        } else {
          requests.delete(key);
        }
        return false;
      }

      validRequests.push(now);
      requests.set(key, validRequests);

      return true;
    };
  }
}

export class CSPManager {
  private static nonce: string | null = null;

  private static policies: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'https:'],
    'connect-src': ["'self'", 'wss:', 'https:'],
    'media-src': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'upgrade-insecure-requests': [],
  };

  static setNonce(nonce: string): void {
    this.nonce = nonce;
  }

  static addSource(directive: string, source: string): void {
    if (!this.policies[directive]) {
      this.policies[directive] = [];
    }
    if (!this.policies[directive].includes(source)) {
      this.policies[directive].push(source);
    }
  }

  static removeSource(directive: string, source: string): void {
    if (this.policies[directive]) {
      this.policies[directive] = this.policies[directive].filter((s) => s !== source);
    }
  }

  static generateCSPString(): string {
    return Object.entries(this.policies)
      .map(([directive, sources]) => {
        const allSources =
          directive === 'script-src' && this.nonce
            ? [...sources, `'nonce-${this.nonce}'`]
            : sources;

        if (allSources.length === 0) {
          return directive;
        }
        return `${directive} ${allSources.join(' ')}`;
      })
      .join('; ');
  }

  static setCSPMeta(): void {
    if (typeof document === 'undefined') return;

    const existing = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (existing) {
      existing.remove();
    }

    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = this.generateCSPString();
    document.head.appendChild(meta);
  }
}

export class SecureStorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecureStorageUnavailableError';
  }
}

export class SecureStorage {
  private static readonly ENCRYPTION_KEY_NAME = 'agi_secure_key';
  private static cachedKey: CryptoKey | null = null;

  private static async getEncryptionKey(): Promise<CryptoKey | null> {
    if (typeof window === 'undefined' || !window.crypto?.subtle) {
      return null;
    }

    if (this.cachedKey) {
      return this.cachedKey;
    }

    try {
      const key = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // non-extractable · raw bytes never leave WebCrypto
        ['encrypt', 'decrypt'],
      );

      localStorage.setItem(this.ENCRYPTION_KEY_NAME, 'key-handle-active');

      this.cachedKey = key;
      return key;
    } catch (error) {
      console.error('Encryption key generation failed:', error);
      return null;
    }
  }

  static async setItem(key: string, value: unknown): Promise<boolean> {
    try {
      const encryptionKey = await this.getEncryptionKey();
      if (!encryptionKey) {
        throw new SecureStorageUnavailableError(
          'Encryption key unavailable; refusing plaintext write',
        );
      }

      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encodedData = new TextEncoder().encode(JSON.stringify(value));

      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        encodedData,
      );

      const encryptedData = {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encryptedBuffer)),
      };

      localStorage.setItem(key, btoa(JSON.stringify(encryptedData)));
      return true;
    } catch (error) {
      if (error instanceof SecureStorageUnavailableError) throw error;
      console.error('Secure storage set failed:', error);
      return false;
    }
  }

  static async getItem<T = unknown>(key: string): Promise<T | null> {
    const storedData = localStorage.getItem(key);
    if (!storedData) return null;

    const encryptionKey = await this.getEncryptionKey();
    if (!encryptionKey) {
      throw new SecureStorageUnavailableError(
        'Encryption key unavailable; refusing plaintext read',
      );
    }

    try {
      const encryptedData = JSON.parse(atob(storedData));
      const iv = new Uint8Array(encryptedData.iv);
      const data = new Uint8Array(encryptedData.data);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        data,
      );

      const decryptedString = new TextDecoder().decode(decryptedBuffer);
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Secure storage get failed:', error);
      return null;
    }
  }

  static removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  static clear(): void {
    localStorage.clear();
  }
}

export interface SecurityHeaders {
  'Content-Security-Policy'?: string;
  'X-Content-Type-Options'?: string;
  'X-Frame-Options'?: string;
  'X-XSS-Protection'?: string;
  'Referrer-Policy'?: string;
  'Permissions-Policy'?: string;
  'Strict-Transport-Security'?: string;
}

export class SecurityHeaderValidator {
  private static recommendedHeaders: SecurityHeaders = {
    'Content-Security-Policy': "default-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(self), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };

  static validateResponse(response: Response): {
    score: number;
    missing: string[];
    present: string[];
  } {
    const missing: string[] = [];
    const present: string[] = [];

    Object.keys(this.recommendedHeaders).forEach((header) => {
      if (response.headers.has(header)) {
        present.push(header);
      } else {
        missing.push(header);
      }
    });

    const score = (present.length / Object.keys(this.recommendedHeaders).length) * 100;

    return { score, missing, present };
  }

  static getRecommendations(): SecurityHeaders {
    return { ...this.recommendedHeaders };
  }
}

export { SecurityManager as Security, CSPManager as CSP };

export const securityManager = new SecurityManager();

export default SecurityManager;
