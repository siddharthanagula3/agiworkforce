/**
 * WebSocket Message Handling Tests
 *
 * Tests for WebSocket message validation and handling:
 * - Registration messages
 * - Signal messages (offer/answer/ice)
 * - Heartbeat messages
 * - Error handling
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Recreate the validation schemas from the server for testing
const PAIRING_CODE_LENGTH = 8;
const PAIRING_CODE_PATTERN = /^[A-Z0-9]{8}$/;
const MAX_SDP_SIZE = 65536;
const MAX_ICE_CANDIDATE_SIZE = 2048;
const MAX_SDP_MID_SIZE = 64;
const MAX_SDP_MLINE_INDEX = 100;
const MAX_USERNAME_FRAGMENT_SIZE = 256;

const pairingCodeSchema = z
  .string()
  .length(PAIRING_CODE_LENGTH)
  .refine((code) => PAIRING_CODE_PATTERN.test(code), {
    message: 'Invalid pairing code format',
  });

const registerMessageSchema = z.object({
  type: z.literal('register'),
  code: pairingCodeSchema,
  role: z.union([z.literal('desktop'), z.literal('mobile')]),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

const sdpPayloadSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().max(MAX_SDP_SIZE),
});

const icePayloadSchema = z.object({
  candidate: z.string().max(MAX_ICE_CANDIDATE_SIZE).nullable().optional(),
  sdpMid: z.string().max(MAX_SDP_MID_SIZE).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(MAX_SDP_MLINE_INDEX).nullable().optional(),
  usernameFragment: z.string().max(MAX_USERNAME_FRAGMENT_SIZE).nullable().optional(),
});

const signalMessageSchema = z.object({
  type: z.literal('signal'),
  kind: z.union([z.literal('offer'), z.literal('answer'), z.literal('ice'), z.literal('control')]),
  payload: z.unknown(),
});

const heartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
});

describe('WebSocket Message Validation', () => {
  describe('Register Message', () => {
    it('should validate valid register message', () => {
      const validMessage = {
        type: 'register',
        code: 'ABCD1234',
        role: 'desktop',
      };

      const result = registerMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should validate register message with metadata', () => {
      const validMessage = {
        type: 'register',
        code: 'ABCD1234',
        role: 'mobile',
        metadata: { deviceName: 'iPhone 15' },
      };

      const result = registerMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject invalid pairing code format', () => {
      const invalidMessage = {
        type: 'register',
        code: 'invalid', // Not 8 chars, not uppercase
        role: 'desktop',
      };

      const result = registerMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('should reject invalid role', () => {
      const invalidMessage = {
        type: 'register',
        code: 'ABCD1234',
        role: 'server', // Invalid role
      };

      const result = registerMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('should reject lowercase pairing code', () => {
      const invalidMessage = {
        type: 'register',
        code: 'abcd1234',
        role: 'desktop',
      };

      const result = registerMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });
  });

  describe('Signal Message', () => {
    it('should validate signal message with offer', () => {
      const validMessage = {
        type: 'signal',
        kind: 'offer',
        payload: { type: 'offer', sdp: 'v=0\r\n...' },
      };

      const result = signalMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should validate signal message with answer', () => {
      const validMessage = {
        type: 'signal',
        kind: 'answer',
        payload: { type: 'answer', sdp: 'v=0\r\n...' },
      };

      const result = signalMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should validate signal message with ICE candidate', () => {
      const validMessage = {
        type: 'signal',
        kind: 'ice',
        payload: {
          candidate: 'candidate:1 1 UDP 2122260223 192.168.1.1 51234 typ host',
          sdpMid: 'audio',
          sdpMLineIndex: 0,
        },
      };

      const result = signalMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject invalid signal kind', () => {
      const invalidMessage = {
        type: 'signal',
        kind: 'invalid',
        payload: {},
      };

      const result = signalMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });
  });

  describe('SDP Payload', () => {
    it('should validate valid SDP offer payload', () => {
      const validPayload = {
        type: 'offer',
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\n...',
      };

      const result = sdpPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should validate valid SDP answer payload', () => {
      const validPayload = {
        type: 'answer',
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\n...',
      };

      const result = sdpPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should reject SDP exceeding max size', () => {
      const invalidPayload = {
        type: 'offer',
        sdp: 'x'.repeat(MAX_SDP_SIZE + 1),
      };

      const result = sdpPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('ICE Candidate Payload', () => {
    it('should validate valid ICE candidate', () => {
      const validPayload = {
        candidate: 'candidate:1 1 UDP 2122260223 192.168.1.1 51234 typ host',
        sdpMid: 'audio',
        sdpMLineIndex: 0,
      };

      const result = icePayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should validate null ICE candidate (end of candidates)', () => {
      const validPayload = {
        candidate: null,
        sdpMid: 'audio',
        sdpMLineIndex: 0,
      };

      const result = icePayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should validate empty ICE payload', () => {
      const result = icePayloadSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject sdpMLineIndex out of range', () => {
      const invalidPayload = {
        candidate: 'candidate:...',
        sdpMLineIndex: MAX_SDP_MLINE_INDEX + 1,
      };

      const result = icePayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('Heartbeat Message', () => {
    it('should validate heartbeat message', () => {
      const validMessage = { type: 'heartbeat' };

      const result = heartbeatMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject heartbeat with extra fields', () => {
      // Zod by default allows extra fields, but we can test strict mode
      const messageWithExtra = { type: 'heartbeat', extra: 'field' };

      const strictSchema = heartbeatMessageSchema.strict();
      const result = strictSchema.safeParse(messageWithExtra);
      expect(result.success).toBe(false);
    });
  });
});

describe('Pairing Code Validation', () => {
  it('should accept valid 8-character uppercase alphanumeric code', () => {
    const validCodes = ['ABCD1234', 'A1B2C3D4', '12345678', 'XXXXXXXX'];

    validCodes.forEach((code) => {
      const result = pairingCodeSchema.safeParse(code);
      expect(result.success).toBe(true);
    });
  });

  it('should reject codes with invalid length', () => {
    const invalidCodes = ['SHORT', 'TOOLONGCODE123'];

    invalidCodes.forEach((code) => {
      const result = pairingCodeSchema.safeParse(code);
      expect(result.success).toBe(false);
    });
  });

  it('should reject codes with lowercase characters', () => {
    const invalidCode = 'abcd1234';
    const result = pairingCodeSchema.safeParse(invalidCode);
    expect(result.success).toBe(false);
  });

  it('should reject codes with special characters', () => {
    const invalidCodes = ['ABCD-123', 'ABCD_123', 'ABCD 123'];

    invalidCodes.forEach((code) => {
      const result = pairingCodeSchema.safeParse(code);
      expect(result.success).toBe(false);
    });
  });
});
