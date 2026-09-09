import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { DeviceLinkRequestSchema } from '@/lib/validations/device';

const repoRoot = path.resolve(__dirname, '../..');

function source(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

/**
 * The takeover this file exists for: the pairing identity used to arrive from
 * the caller. An attacker chose `device_id` and `device_fingerprint`, put them
 * in a `/connect` link, and the victim's browser wrote them into the pairing
 * row and approved it. `/api/device/poll` then handed the attacker a 7-day
 * developer token for the victim's account, because the fingerprint it checks
 * was the attacker's own.
 */
describe('the pairing identity is minted by the server, never supplied by the caller', () => {
  it('refuses a device_id in the link request body', () => {
    const parsed = DeviceLinkRequestSchema.safeParse({
      device_id: 'attacker-chosen-device',
      device_type: 'desktop',
    });

    expect(parsed.success).toBe(false);
  });

  it('refuses a device_fingerprint in the link request body', () => {
    const parsed = DeviceLinkRequestSchema.safeParse({
      device_fingerprint: 'deadbeef',
      device_type: 'desktop',
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts only the descriptive fields a device may name for itself', () => {
    const parsed = DeviceLinkRequestSchema.safeParse({
      device_name: 'Работа MacBook',
      device_type: 'desktop',
    });

    expect(parsed.success).toBe(true);
  });

  it('mints the device id server side', () => {
    const route = source('app/api/device/link/route.ts');

    expect(route).toContain('device_id = randomUUID()');

    const destructured = /const \{([^}]*)\} = validationResult\.data;/.exec(route)?.[1] ?? '';
    expect(destructured, 'device_id must not come from the request body').not.toContain(
      'device_id',
    );
  });

  it('never rewrites a pairing row that already exists', () => {
    const route = source('app/api/device/link/route.ts');

    expect(
      route.includes('ON CONFLICT'),
      'an upsert on a globally unique device_id lets any caller reset another account row',
    ).toBe(false);
  });
});

describe('the approving browser cannot be handed a device identity by a link', () => {
  it('the connect page reads no device identity from the url', () => {
    const page = source('app/connect/[deviceType]/page.tsx');

    expect(page).not.toContain('device_id');
    expect(page).not.toContain('device_fingerprint');
  });

  it('the connect page no longer creates or approves a pairing row', () => {
    const page = source('app/connect/[deviceType]/page.tsx');
    const client = source('app/connect/[deviceType]/connect-client.tsx');

    expect(page).not.toContain('/api/device/link');
    expect(client).not.toContain('/api/device/link');
    expect(client).not.toContain('/api/device/approve');
  });
});

describe('the pairing routes run the same gates as every other authenticated route', () => {
  it('device approval resolves its caller through the auth boundary', () => {
    const route = source('app/api/device/approve/route.ts');

    expect(route).toContain('getClerkAuthUser');
    expect(route).not.toContain('getRequestIdentity');
  });

  it('pair initiation resolves its caller through the auth boundary', () => {
    const route = source('app/api/pair/initiate/route.ts');

    expect(route).toContain('getClerkAuthUser');
    expect(route).not.toContain('getRequestIdentity');
  });
});

describe('the stored fingerprint is treated as an authenticator', () => {
  it('is compared in constant time', () => {
    const route = source('app/api/device/poll/route.ts');

    expect(route).toContain('timingSafeEqual');
    expect(route).not.toContain('data.device_fingerprint !== device_fingerprint');
  });

  it('never reaches a log line', () => {
    const route = source('app/api/device/poll/route.ts');

    expect(route).not.toContain('expectedFingerprint');
    expect(route).not.toContain('providedFingerprint');
  });

  it('is denied by the log redactor as a backstop', () => {
    expect(source('lib/observability/redact.ts')).toContain("'fingerprint'");
  });
});
