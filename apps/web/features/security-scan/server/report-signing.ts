import 'server-only';

import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { SecurityScanReportSchema, type SecurityScanReport } from '@agiworkforce/cloud-contracts';

const SIGNING_SECRET_ENV = 'CSRF_SECRET';
const MIN_SECRET_BYTES = 32;
const SIGNING_KEY_INFO = 'agi/security-scan-report/v1';
const SIGNING_KEY_BYTES = 32;
const ENVELOPE_VERSION = 1;

export class SecurityScanSigningUnavailableError extends Error {
  constructor() {
    super('Security scan reports cannot be signed on this deployment');
    this.name = 'SecurityScanSigningUnavailableError';
  }
}

function signingKey(): Buffer {
  const secret = process.env[SIGNING_SECRET_ENV];
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new SecurityScanSigningUnavailableError();
  }
  return Buffer.from(
    hkdfSync('sha256', secret, Buffer.alloc(0), SIGNING_KEY_INFO, SIGNING_KEY_BYTES),
  );
}

function signatureFor(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

const PayloadSchema = z
  .object({
    userId: z.string().min(1),
    sessionId: z.string().min(1),
    report: SecurityScanReportSchema,
  })
  .strict();

const EnvelopeSchema = z
  .object({
    v: z.literal(ENVELOPE_VERSION),
    payload: z.string().min(2),
    signature: z.string().min(1),
  })
  .strict();

export interface SecurityScanReportBinding {
  userId: string;
  sessionId: string;
}

export function sealSecurityScanReport(
  binding: SecurityScanReportBinding,
  report: SecurityScanReport,
): string {
  const payload = JSON.stringify(PayloadSchema.parse({ ...binding, report }));
  return JSON.stringify({ v: ENVELOPE_VERSION, payload, signature: signatureFor(payload) });
}

export function openSecurityScanReport(
  binding: SecurityScanReportBinding,
  sealed: string,
): SecurityScanReport | null {
  let envelopeValue: unknown;
  try {
    envelopeValue = JSON.parse(sealed);
  } catch {
    return null;
  }
  const envelope = EnvelopeSchema.safeParse(envelopeValue);
  if (!envelope.success) return null;
  const expected = Buffer.from(signatureFor(envelope.data.payload));
  const provided = Buffer.from(envelope.data.signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  let payloadValue: unknown;
  try {
    payloadValue = JSON.parse(envelope.data.payload);
  } catch {
    return null;
  }
  const payload = PayloadSchema.safeParse(payloadValue);
  if (!payload.success) return null;
  if (payload.data.userId !== binding.userId || payload.data.sessionId !== binding.sessionId) {
    return null;
  }
  return payload.data.report;
}
