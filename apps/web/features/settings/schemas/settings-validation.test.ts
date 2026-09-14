import { describe, it, expect } from 'vitest';
import {
  changePasswordSchema,
  securitySettingsSchema,
  createApiKeySchema,
  validateFormData,
  isValidIpOrCidr,
} from './settings-validation';

function getErrorMessages(result: { success: boolean; error?: unknown; data?: unknown }): string[] {
  if (result.success) return [];
  const issues = (result.error as { issues?: Array<{ message: string }> }).issues || [];
  return issues.map((issue) => issue.message);
}

function hasErrorContaining(
  result: { success: boolean; error?: unknown; data?: unknown },
  text: string,
): boolean {
  const messages = getErrorMessages(result);
  return messages.some((msg) => msg.toLowerCase().includes(text.toLowerCase()));
}

describe('Settings Validation Schemas', () => {
  describe('changePasswordSchema', () => {
    it('should validate a strong password', () => {
      const validPassword = {
        newPassword: 'SecurePass123!',
        confirmPassword: 'SecurePass123!',
      };

      const result = changePasswordSchema.safeParse(validPassword);
      expect(result.success).toBe(true);
    });

    it('should reject password without uppercase', () => {
      const weakPassword = {
        newPassword: 'securepass123!',
        confirmPassword: 'securepass123!',
      };

      const result = changePasswordSchema.safeParse(weakPassword);
      expect(result.success).toBe(false);
      expect(hasErrorContaining(result, 'uppercase')).toBe(true);
    });

    it('should reject password without lowercase', () => {
      const weakPassword = {
        newPassword: 'SECUREPASS123!',
        confirmPassword: 'SECUREPASS123!',
      };

      const result = changePasswordSchema.safeParse(weakPassword);
      expect(result.success).toBe(false);
      expect(hasErrorContaining(result, 'lowercase')).toBe(true);
    });

    it('should reject password without number', () => {
      const weakPassword = {
        newPassword: 'SecurePassword!',
        confirmPassword: 'SecurePassword!',
      };

      const result = changePasswordSchema.safeParse(weakPassword);
      expect(result.success).toBe(false);
      expect(hasErrorContaining(result, 'number')).toBe(true);
    });

    it('should reject password without special character', () => {
      const weakPassword = {
        newPassword: 'SecurePass123',
        confirmPassword: 'SecurePass123',
      };

      const result = changePasswordSchema.safeParse(weakPassword);
      expect(result.success).toBe(false);
      expect(hasErrorContaining(result, 'special')).toBe(true);
    });

    it('should reject password shorter than 8 characters', () => {
      const shortPassword = {
        newPassword: 'Pass1!',
        confirmPassword: 'Pass1!',
      };

      const result = changePasswordSchema.safeParse(shortPassword);
      expect(result.success).toBe(false);
      expect(hasErrorContaining(result, '8')).toBe(true);
    });

    it('should reject mismatched passwords', () => {
      const mismatchedPassword = {
        newPassword: 'SecurePass123!',
        confirmPassword: 'DifferentPass123!',
      };

      const result = changePasswordSchema.safeParse(mismatchedPassword);
      expect(result.success).toBe(false);
      expect(hasErrorContaining(result, 'match')).toBe(true);
    });
  });

  describe('securitySettingsSchema', () => {
    it('should validate valid security settings', () => {
      const validSettings = {
        two_factor_enabled: true,
        session_timeout: 60,
      };

      const result = securitySettingsSchema.safeParse(validSettings);
      expect(result.success).toBe(true);
    });

    it('should reject session timeout below minimum', () => {
      const invalidSettings = {
        two_factor_enabled: false,
        session_timeout: 10, // Below 15 minute minimum
      };

      const result = securitySettingsSchema.safeParse(invalidSettings);
      expect(result.success).toBe(false);
      expect(hasErrorContaining(result, '15')).toBe(true);
    });

    it('should reject session timeout above maximum', () => {
      const invalidSettings = {
        two_factor_enabled: false,
        session_timeout: 2000, // Above 1440 minute maximum
      };

      const result = securitySettingsSchema.safeParse(invalidSettings);
      expect(result.success).toBe(false);
      expect(hasErrorContaining(result, '24') || hasErrorContaining(result, '1440')).toBe(true);
    });
  });

  describe('createApiKeySchema', () => {
    it('should validate a valid API key name', () => {
      const validKey = {
        name: 'Production API Key',
        scopes: ['models:read', 'inference:write'],
      };

      const result = createApiKeySchema.safeParse(validKey);
      expect(result.success).toBe(true);
    });

    it('should reject empty API key name', () => {
      const invalidKey = {
        name: '',
        scopes: ['inference:write'],
      };

      const result = createApiKeySchema.safeParse(invalidKey);
      expect(result.success).toBe(false);
    });

    it('should sanitize XSS in API key name', () => {
      const xssKey = {
        name: '<script>alert("xss")</script>MyKey',
        scopes: ['inference:write'],
      };

      const result = createApiKeySchema.safeParse(xssKey);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).not.toContain('<script>');
      }
    });

    it('should enforce max length', () => {
      const longName = {
        name: 'a'.repeat(150),
        scopes: ['inference:write'],
      };

      const result = createApiKeySchema.safeParse(longName);
      expect(result.success).toBe(false);
    });

    it('should require at least one known, unique scope', () => {
      expect(createApiKeySchema.safeParse({ name: 'No scopes', scopes: [] }).success).toBe(false);
      expect(
        createApiKeySchema.safeParse({
          name: 'Unknown scope',
          scopes: ['account:admin'],
        }).success,
      ).toBe(false);
      expect(
        createApiKeySchema.safeParse({
          name: 'Duplicate scope',
          scopes: ['usage:read', 'usage:read'],
        }).success,
      ).toBe(false);
    });
  });

  describe('validateFormData utility', () => {
    it('should return success with valid data', () => {
      const result = validateFormData(securitySettingsSchema, {
        two_factor_enabled: true,
        session_timeout: 30,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.session_timeout).toBe(30);
      }
    });

    it('should return errors for invalid data', () => {
      const result = validateFormData(securitySettingsSchema, {
        two_factor_enabled: true,
        session_timeout: 5,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(Object.keys(result.errors).length).toBeGreaterThan(0);
      }
    });
  });
});

describe('isValidIpOrCidr', () => {
  it('accepts a bare IPv4 address', () => {
    expect(isValidIpOrCidr('203.0.113.5')).toBe(true);
  });

  it('accepts an IPv4 block with a prefix', () => {
    expect(isValidIpOrCidr('203.0.113.0/24')).toBe(true);
  });

  it('accepts a bare IPv6 address', () => {
    expect(isValidIpOrCidr('2001:db8::1')).toBe(true);
  });

  it('accepts an IPv6 block with a prefix', () => {
    expect(isValidIpOrCidr('2001:db8::/32')).toBe(true);
  });

  it('rejects an out-of-range IPv4 octet', () => {
    expect(isValidIpOrCidr('300.0.113.5')).toBe(false);
  });

  it('rejects an IPv4 prefix beyond 32', () => {
    expect(isValidIpOrCidr('203.0.113.0/33')).toBe(false);
  });

  it('rejects an IPv6 prefix beyond 128', () => {
    expect(isValidIpOrCidr('2001:db8::/129')).toBe(false);
  });

  it('rejects a non-numeric prefix', () => {
    expect(isValidIpOrCidr('203.0.113.0/abc')).toBe(false);
  });

  it('rejects more than one slash', () => {
    expect(isValidIpOrCidr('203.0.113.0/24/extra')).toBe(false);
  });

  it('rejects plain text', () => {
    expect(isValidIpOrCidr('not-an-ip')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidIpOrCidr('')).toBe(false);
  });
});
