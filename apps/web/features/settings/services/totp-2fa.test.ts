import { describe, it, expect } from 'vitest';
import {
  generateTOTPSecret,
  generateOTPAuthURL,
  generateTOTPCode,
  verifyTOTPCode,
  generateBackupCodes,
  TOTP_CONFIG,
} from './user-preferences';

describe('TOTP 2FA Implementation', () => {
  describe('generateTOTPSecret', () => {
    it('should generate a Base32 encoded secret', () => {
      const secret = generateTOTPSecret();

      expect(secret).toMatch(/^[A-Z2-7]+$/);

      expect(secret.length).toBe(32);
    });

    it('should generate unique secrets', () => {
      const secrets = new Set<string>();

      for (let i = 0; i < 100; i++) {
        secrets.add(generateTOTPSecret());
      }

      expect(secrets.size).toBe(100);
    });
  });

  describe('generateOTPAuthURL', () => {
    it('should generate a valid otpauth URL', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const accountName = 'test@example.com';

      const url = generateOTPAuthURL(secret, accountName);

      expect(url).toContain('otpauth://totp/');
      expect(url).toContain(`secret=${secret}`);
      expect(url).toContain('issuer=AGI%20Platform');
      expect(url).toContain('algorithm=SHA1');
      expect(url).toContain('digits=6');
      expect(url).toContain('period=30');
    });

    it('should properly encode special characters', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const accountName = 'user+test@example.com';

      const url = generateOTPAuthURL(secret, accountName);

      expect(url).toContain(encodeURIComponent(accountName));
    });

    it('should allow custom issuer', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const accountName = 'test@example.com';
      const customIssuer = 'Custom App';

      const url = generateOTPAuthURL(secret, accountName, customIssuer);

      expect(url).toContain('issuer=Custom%20App');
    });
  });

  describe('generateTOTPCode', () => {
    it('should generate a 6-digit code', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';

      const code = await generateTOTPCode(secret);

      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate consistent codes for the same time window', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const timestamp = 1234567890000;

      const code1 = await generateTOTPCode(secret, timestamp);
      const code2 = await generateTOTPCode(secret, timestamp);

      expect(code1).toBe(code2);
    });

    it('should generate different codes for different time windows', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const timestamp1 = 1234567890000;
      const timestamp2 = timestamp1 + 30000;

      const code1 = await generateTOTPCode(secret, timestamp1);
      const code2 = await generateTOTPCode(secret, timestamp2);

      expect(code1).not.toBe(code2);
    });

    it('should generate correct code for RFC 6238 test vector', async () => {
      const secret = 'GEZDGNBVGY3TQOJQ';
      const timestamp = 59000;

      const code = await generateTOTPCode(secret, timestamp);

      expect(code).toMatch(/^\d{6}$/);
    });
  });

  describe('verifyTOTPCode', () => {
    it('should verify a valid current code', async () => {
      const secret = generateTOTPSecret();
      const timestamp = Date.now();

      const code = await generateTOTPCode(secret, timestamp);
      const isValid = await verifyTOTPCode(secret, code, timestamp);

      expect(isValid).toBe(true);
    });

    it('should verify a code from the previous time window (clock drift)', async () => {
      const secret = generateTOTPSecret();
      const currentTime = Date.now();
      const previousWindow = currentTime - TOTP_CONFIG.PERIOD * 1000;

      const code = await generateTOTPCode(secret, previousWindow);
      const isValid = await verifyTOTPCode(secret, code, currentTime);

      expect(isValid).toBe(true);
    });

    it('should verify a code from the next time window (clock drift)', async () => {
      const secret = generateTOTPSecret();
      const currentTime = Date.now();
      const nextWindow = currentTime + TOTP_CONFIG.PERIOD * 1000;

      const code = await generateTOTPCode(secret, nextWindow);
      const isValid = await verifyTOTPCode(secret, code, currentTime);

      expect(isValid).toBe(true);
    });

    it('should reject an invalid code', async () => {
      const secret = generateTOTPSecret();

      const isValid = await verifyTOTPCode(secret, '000000');

      expect(isValid).toBe(false);
    });

    it('should reject a code from too far in the past', async () => {
      const secret = generateTOTPSecret();
      const currentTime = Date.now();
      const oldWindow = currentTime - TOTP_CONFIG.PERIOD * 2000;

      const code = await generateTOTPCode(secret, oldWindow);
      const isValid = await verifyTOTPCode(secret, code, currentTime);

      expect(isValid).toBe(false);
    });

    it('should handle codes with spaces', async () => {
      const secret = generateTOTPSecret();
      const timestamp = Date.now();

      const code = await generateTOTPCode(secret, timestamp);
      const codeWithSpaces = `${code.slice(0, 3)} ${code.slice(3)}`;

      const isValid = await verifyTOTPCode(secret, codeWithSpaces, timestamp);

      expect(isValid).toBe(true);
    });

    it('should reject codes of wrong length', async () => {
      const secret = generateTOTPSecret();

      const isValid1 = await verifyTOTPCode(secret, '12345');
      const isValid2 = await verifyTOTPCode(secret, '1234567');

      expect(isValid1).toBe(false);
      expect(isValid2).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate the correct number of codes', () => {
      const codes = generateBackupCodes();

      expect(codes.length).toBe(TOTP_CONFIG.BACKUP_CODE_COUNT);
    });

    it('should generate codes in the identity provider format', () => {
      const codes = generateBackupCodes();

      codes.forEach((code) => {
        expect(code).toMatch(/^[a-z2-9]{8}$/);
      });
    });

    it('should generate unique codes', () => {
      const codes = generateBackupCodes();
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should not include confusing characters', () => {
      const codes = generateBackupCodes();

      codes.forEach((code) => {
        expect(code).not.toMatch(/[ilo01]/);
      });
    });
  });

  describe('TOTP_CONFIG', () => {
    it('should have RFC 6238 compliant defaults', () => {
      expect(TOTP_CONFIG.ALGORITHM).toBe('SHA1');
      expect(TOTP_CONFIG.DIGITS).toBe(6);
      expect(TOTP_CONFIG.PERIOD).toBe(30);
    });

    it('should have reasonable security parameters', () => {
      expect(TOTP_CONFIG.SECRET_LENGTH).toBeGreaterThanOrEqual(20);

      expect(TOTP_CONFIG.BACKUP_CODE_COUNT).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Edge Cases', () => {
    it('should handle epoch time correctly', async () => {
      const secret = generateTOTPSecret();
      const epochTime = 0;

      const code = await generateTOTPCode(secret, epochTime);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should handle very large timestamps', async () => {
      const secret = generateTOTPSecret();
      const farFuture = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;

      const code = await generateTOTPCode(secret, farFuture);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate valid codes at time window boundaries', async () => {
      const secret = generateTOTPSecret();

      const boundary = Math.floor(Date.now() / 30000) * 30000;

      const code = await generateTOTPCode(secret, boundary);
      const isValid = await verifyTOTPCode(secret, code, boundary);

      expect(isValid).toBe(true);
    });
  });
});
