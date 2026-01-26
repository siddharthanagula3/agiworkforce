/**
 * Password Validator Tests
 *
 * Tests for password validation and strength checking
 */

import { describe, it, expect } from 'vitest';
import {
  validatePassword,
  getPasswordRequirementsText,
  PASSWORD_REQUIREMENTS,
} from '@/lib/password-validator';

describe('Password Validator', () => {
  describe('PASSWORD_REQUIREMENTS', () => {
    it('should have minimum length of 12', () => {
      expect(PASSWORD_REQUIREMENTS.minLength).toBe(12);
    });

    it('should require uppercase letters', () => {
      expect(PASSWORD_REQUIREMENTS.requireUppercase).toBe(true);
    });

    it('should require lowercase letters', () => {
      expect(PASSWORD_REQUIREMENTS.requireLowercase).toBe(true);
    });

    it('should require numbers', () => {
      expect(PASSWORD_REQUIREMENTS.requireNumber).toBe(true);
    });

    it('should require special characters', () => {
      expect(PASSWORD_REQUIREMENTS.requireSpecial).toBe(true);
    });
  });

  describe('validatePassword', () => {
    describe('Length Validation', () => {
      it('should reject passwords shorter than minimum length', () => {
        const result = validatePassword('Short1!aA');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least 12 characters required');
      });

      it('should accept passwords meeting minimum length', () => {
        const result = validatePassword('ValidPass123!');
        expect(result.valid).toBe(true);
        expect(result.errors).not.toContain('At least 12 characters required');
      });

      it('should accept very long passwords', () => {
        const longPassword = 'A'.repeat(50) + 'a1!';
        const result = validatePassword(longPassword);
        expect(result.errors).not.toContain('At least 12 characters required');
      });
    });

    describe('Uppercase Validation', () => {
      it('should reject passwords without uppercase letters', () => {
        const result = validatePassword('lowercase123!aa');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least one uppercase letter (A-Z) required');
      });

      it('should accept passwords with uppercase letters', () => {
        const result = validatePassword('Uppercase123!aa');
        expect(result.errors).not.toContain('At least one uppercase letter (A-Z) required');
      });
    });

    describe('Lowercase Validation', () => {
      it('should reject passwords without lowercase letters', () => {
        const result = validatePassword('UPPERCASE123!AA');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least one lowercase letter (a-z) required');
      });

      it('should accept passwords with lowercase letters', () => {
        const result = validatePassword('UPPERCASE123!aA');
        expect(result.errors).not.toContain('At least one lowercase letter (a-z) required');
      });
    });

    describe('Number Validation', () => {
      it('should reject passwords without numbers', () => {
        const result = validatePassword('NoNumbersHere!A');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least one number (0-9) required');
      });

      it('should accept passwords with numbers', () => {
        const result = validatePassword('WithNumber1!Aa');
        expect(result.errors).not.toContain('At least one number (0-9) required');
      });
    });

    describe('Special Character Validation', () => {
      it('should reject passwords without special characters', () => {
        const result = validatePassword('NoSpecialChar1A');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least one special character (!@#$%^&* etc.) required');
      });

      it('should accept passwords with common special characters', () => {
        const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+'];

        for (const char of specialChars) {
          const result = validatePassword(`ValidPass1${char}Aa`);
          expect(result.errors).not.toContain(
            'At least one special character (!@#$%^&* etc.) required',
          );
        }
      });

      it('should accept passwords with bracket special characters', () => {
        const bracketChars = ['[', ']', '{', '}'];

        for (const char of bracketChars) {
          const result = validatePassword(`ValidPass1${char}Aa`);
          expect(result.errors).not.toContain(
            'At least one special character (!@#$%^&* etc.) required',
          );
        }
      });

      it('should accept passwords with punctuation special characters', () => {
        const punctuationChars = [';', "'", ':', '"', ',', '.', '<', '>', '/', '?', '|', '\\'];

        for (const char of punctuationChars) {
          const result = validatePassword(`ValidPass1${char}Aa`);
          expect(result.errors).not.toContain(
            'At least one special character (!@#$%^&* etc.) required',
          );
        }
      });
    });

    describe('Empty/Null Password', () => {
      it('should reject empty password', () => {
        const result = validatePassword('');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password is required');
        expect(result.strength).toBe('weak');
      });
    });

    describe('Valid Passwords', () => {
      it('should accept a fully valid password', () => {
        const result = validatePassword('ValidPass123!');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept complex valid passwords', () => {
        const validPasswords = [
          'MySecure@Pass1',
          'C0mpl3x!Passw0rd',
          'Testing123!Abc',
          'P@ssw0rd!234Ab',
        ];

        for (const password of validPasswords) {
          const result = validatePassword(password);
          expect(result.valid).toBe(true);
        }
      });
    });

    describe('Password Strength', () => {
      it('should return weak strength for empty password', () => {
        const result = validatePassword('');
        expect(result.strength).toBe('weak');
      });

      it('should return weak strength for passwords meeting few requirements', () => {
        const result = validatePassword('short'); // Only lowercase
        expect(result.strength).toBe('weak');
      });

      it('should return fair strength for passwords meeting 3 requirements', () => {
        // Has length, lowercase, uppercase (3 requirements)
        const result = validatePassword('LongerPassword');
        expect(result.strength).toBe('fair');
      });

      it('should return good strength for passwords meeting 4 requirements', () => {
        // Has length, lowercase, uppercase, numbers (4 requirements)
        const result = validatePassword('LongerPass123');
        expect(result.strength).toBe('good');
      });

      it('should return strong strength for passwords meeting all requirements', () => {
        const result = validatePassword('ValidPass123!');
        expect(result.strength).toBe('strong');
      });
    });

    describe('Multiple Errors', () => {
      it('should return all applicable errors', () => {
        const result = validatePassword('short');
        expect(result.errors.length).toBeGreaterThan(1);
        expect(result.errors).toContain('At least 12 characters required');
        expect(result.errors).toContain('At least one uppercase letter (A-Z) required');
        expect(result.errors).toContain('At least one number (0-9) required');
        expect(result.errors).toContain('At least one special character (!@#$%^&* etc.) required');
      });
    });
  });

  describe('getPasswordRequirementsText', () => {
    it('should return formatted requirements text', () => {
      const text = getPasswordRequirementsText();

      expect(text).toContain('At least 12 characters');
      expect(text).toContain('Uppercase letter (A-Z)');
      expect(text).toContain('Lowercase letter (a-z)');
      expect(text).toContain('Number (0-9)');
      expect(text).toContain('Special character');
    });

    it('should return comma-separated list', () => {
      const text = getPasswordRequirementsText();
      const parts = text.split(', ');
      expect(parts.length).toBe(5);
    });
  });
});
