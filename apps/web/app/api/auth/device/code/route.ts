import 'server-only';

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, withCorsAndSecurityHeaders } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { pseudonymizeIdentifier } from '@/lib/server/pseudonymize';

export const runtime = 'nodejs';

const DEVICE_CODE_EXPIRES_SECONDS = 900;
const POLL_INTERVAL_SECONDS = 5;
const DEVICE_SURFACES = {
  cli: { name: 'AGI CLI', type: 'cli' },
  desktop: { name: 'AGI Desktop', type: 'desktop' },
  vscode: { name: 'AGI for VS Code', type: 'vscode' },
  chrome: { name: 'AGI Browser Extension', type: 'chrome' },
} as const;

type DeviceSurface = keyof typeof DEVICE_SURFACES;

interface DeviceAuthorizationLookupRow {
  device_type: string;
  status: string;
  expires_at: string;
}

const DEVICE_AUTHORIZATION_SCOPES = [
  {
    id: 'account:read',
    label: 'Account identity and plan',
    description: 'Read the account name, email, plan, and usage shown in this client.',
  },
  {
    id: 'managed-cloud:use',
    label: 'AGI Managed Cloud',
    description:
      'Use account-backed AGI Cloud features on this device, subject to plan and workspace permissions.',
  },
] as const;

// XXXX-XXXX user code; excludes ambiguous 0/O/1/I/L for readability.
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const USER_CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function generateUserCode(): string {
  const len = USER_CODE_ALPHABET.length;
  const limit = 256 - (256 % len);
  let code = '';
  while (code.length < 8) {
    const bytes = crypto.randomBytes(8 - code.length + 4);
    for (let i = 0; i < bytes.length && code.length < 8; i++) {
      const b = bytes[i]!;
      if (b < limit) code += USER_CODE_ALPHABET[b % len];
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

async function handleDeviceCodeStart(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  const rawBody = (await request.json().catch(() => ({}))) as unknown;
  const surfaceValue =
    rawBody !== null && typeof rawBody === 'object' && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>)['surface']
      : undefined;
  if (
    surfaceValue !== undefined &&
    (typeof surfaceValue !== 'string' || !(surfaceValue in DEVICE_SURFACES))
  ) {
    return NextResponse.json({ error: 'Invalid device surface' }, { status: 400 });
  }
  const surface = (surfaceValue ?? 'cli') as DeviceSurface;
  const device = DEVICE_SURFACES[surface];

  const deviceCode = crypto.randomUUID();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRES_SECONDS * 1000).toISOString();

  const db = getNeonDb();
  await db.execute(
    `INSERT INTO device_authorization_codes
       (device_id, device_name, device_type, user_code, status, expires_at)
     VALUES ($1, $2, $3, $4, 'pending', $5)`,
    [deviceCode, device.name, device.type, userCode, expiresAt],
  );

  const verificationUri = `${new URL(request.url).origin}/auth/device`;
  const verificationParams = new URLSearchParams({
    user_code: userCode,
    surface,
  });
  const deviceRef = pseudonymizeIdentifier(deviceCode, 'device-code', 12);
  logger.info({ deviceRef, surface }, 'Device code issued');

  return NextResponse.json(
    {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?${verificationParams.toString()}`,
      interval: POLL_INTERVAL_SECONDS,
      expires_in: DEVICE_CODE_EXPIRES_SECONDS,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

async function handleDeviceCodeLookup(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  await getClerkAuthUser(request);

  const userCode = new URL(request.url).searchParams.get('user_code')?.trim().toUpperCase() ?? '';
  if (!USER_CODE_PATTERN.test(userCode)) {
    return NextResponse.json({ error: 'Invalid device code format' }, { status: 400 });
  }

  const db = getNeonDb();
  const records = await db.query<DeviceAuthorizationLookupRow>(
    `SELECT device_type, status, expires_at
       FROM device_authorization_codes
      WHERE user_code = $1`,
    [userCode],
  );
  const record = records[0];
  if (!record) {
    return NextResponse.json(
      { error: 'Code not found or expired. Check the requesting app and try again.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (record.status !== 'pending') {
    return NextResponse.json(
      { error: 'This device code has already been processed' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (new Date(record.expires_at) < new Date()) {
    await db.execute(
      `UPDATE device_authorization_codes
          SET status = 'expired', updated_at = $1
        WHERE user_code = $2
          AND status = 'pending'`,
      [new Date().toISOString(), userCode],
    );
    return NextResponse.json(
      { error: 'Code has expired. Start sign-in again from the requesting app.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const registeredDevice = Object.values(DEVICE_SURFACES).find(
    (device) => device.type === record.device_type,
  );
  const client = registeredDevice ?? {
    name: 'Unknown AGI client',
    type: 'unknown',
  };

  return NextResponse.json(
    {
      user_code: userCode,
      client,
      scopes: DEVICE_AUTHORIZATION_SCOPES,
      expires_at: record.expires_at,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const postDeviceCodeStart = withErrorHandler(handleDeviceCodeStart);
const getDeviceCodeLookup = withErrorHandler(handleDeviceCodeLookup);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const response = await getDeviceCodeLookup(request);
  return withCorsAndSecurityHeaders(response as NextResponse, request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = await postDeviceCodeStart(request);
  return withCorsAndSecurityHeaders(response as NextResponse, request);
}

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
