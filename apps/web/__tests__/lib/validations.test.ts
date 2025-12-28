import { describe, it, expect } from 'vitest';
import { CheckoutRequestSchema } from '@/lib/validations/checkout';
import { DeviceLinkRequestSchema, DevicePollRequestSchema } from '@/lib/validations/device';
import { ClaimOfferRequestSchema } from '@/lib/validations/claim-offer';

describe('Validation Schemas', () => {
  describe('CheckoutRequestSchema', () => {
    it('should validate valid checkout request', () => {
      const result = CheckoutRequestSchema.safeParse({
        plan: 'pro',
        billingInterval: 'monthly',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.plan).toBe('pro');
        expect(result.data.billingInterval).toBe('monthly');
      }
    });

    it('should reject invalid plan', () => {
      const result = CheckoutRequestSchema.safeParse({
        plan: 'invalid',
        billingInterval: 'monthly',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid billing interval', () => {
      const result = CheckoutRequestSchema.safeParse({
        plan: 'pro',
        billingInterval: 'invalid',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('DeviceLinkRequestSchema', () => {
    it('should validate valid device link request', () => {
      const result = DeviceLinkRequestSchema.safeParse({
        device_id: 'test-device-123',
        device_name: 'My Device',
        device_type: 'desktop',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid device_id format', () => {
      const result = DeviceLinkRequestSchema.safeParse({
        device_id: 'invalid device id!',
        device_name: 'My Device',
      });

      expect(result.success).toBe(false);
    });

    it('should accept optional fields', () => {
      const result = DeviceLinkRequestSchema.safeParse({
        device_id: 'test-device-123',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('DevicePollRequestSchema', () => {
    it('should validate valid device poll request', () => {
      const result = DevicePollRequestSchema.safeParse({
        device_id: 'test-device-123',
        device_fingerprint: 'abcdef1234567890',
      });

      expect(result.success).toBe(true);
    });

    it('should require device_id', () => {
      const result = DevicePollRequestSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('ClaimOfferRequestSchema', () => {
    it('should validate and transform invite code', () => {
      const result = ClaimOfferRequestSchema.safeParse({
        code: 'abc123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toBe('ABC123');
      }
    });

    it('should reject invalid code format', () => {
      const result = ClaimOfferRequestSchema.safeParse({
        code: 'invalid-code!',
      });

      expect(result.success).toBe(false);
    });

    it('should reject code that is too long', () => {
      const result = ClaimOfferRequestSchema.safeParse({
        code: 'A'.repeat(51),
      });

      expect(result.success).toBe(false);
    });
  });
});
