import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_REFUSAL_TEXT_MAX_LENGTH,
  accountRefusalKind,
  accountRefusalMessage,
  parseRetryAfterMs,
  readAccountRefusal,
} from '../utils/accountRefusal';
import { describeConnectorFailure } from '../features/connectors/connectorPresentation';
import { describeProjectFailure } from '../features/projects/projectPresentation';
import { describeScheduleFailure } from '../features/schedules/schedulePresentation';
import { describeArtifactFailure } from '../features/artifacts/artifactPresentation';

function refusalResponse(
  status: number,
  error: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error }), { status, headers });
}

describe('readAccountRefusal', () => {
  it.each([
    [403, { code: 'FORBIDDEN', message: 'Locked down.' }, 'policy'],
    [
      403,
      { type: 'organization_policy', code: 'surface_sync_disabled', message: 'Sync is off.' },
      'policy',
    ],
    [403, { code: 'MFA_REQUIRED', message: 'Verify it is you.' }, 'account'],
    [403, { code: 'SUBSCRIPTION_REQUIRED', message: 'Upgrade to schedule.' }, 'plan'],
    [503, { code: 'SERVICE_UNAVAILABLE', message: 'Try again soon.' }, 'unavailable'],
    [
      503,
      {
        type: 'organization_policy',
        code: 'workspace_policy_unavailable',
        message: 'Not readable.',
      },
      'unavailable',
    ],
  ])('reads a %s refusal as it was worded', async (status, error, kind) => {
    const refusal = await readAccountRefusal(refusalResponse(status, error));

    expect(refusal).toMatchObject({ message: error.message, kind });
  });

  it('reads the stated wait of a temporary failure', async () => {
    const refusal = await readAccountRefusal(
      refusalResponse(
        503,
        { code: 'SERVICE_UNAVAILABLE', message: 'Try again soon.' },
        { 'retry-after': '5' },
      ),
    );

    expect(refusal?.retryAfterMs).toBe(5_000);
  });

  it.each([
    [401, { code: 'UNAUTHORIZED', message: 'Authentication required' }],
    [403, { code: 'CSRF_VALIDATION_FAILED', message: 'Token missing.' }],
    [403, { code: 'SERVICE_UNAVAILABLE', message: 'Wrong status for this code.' }],
    [429, { code: 'RATE_LIMIT_EXCEEDED', message: 'Slow down.' }],
  ])('leaves a %s answer to the caller', async (status, error) => {
    await expect(readAccountRefusal(refusalResponse(status, error))).resolves.toBeUndefined();
  });
});

describe('accountRefusalMessage', () => {
  it('uses the message of a coded refusal', () => {
    expect(accountRefusalMessage({ code: 'forbidden', message: ' Locked down. ' })).toBe(
      'Locked down.',
    );
  });

  it('uses the server text a shared client put behind its status prefix', () => {
    expect(
      accountRefusalMessage({ status: 403, message: 'HTTP 403: Your workspace blocks projects.' }),
    ).toBe('Your workspace blocks projects.');
  });

  it('has nothing to say about a bare status or a status that is not a refusal', () => {
    expect(accountRefusalMessage({ status: 403, message: 'HTTP 403' })).toBeUndefined();
    expect(accountRefusalMessage({ status: 403, message: 'HTTP 403: HTTP 403' })).toBeUndefined();
    expect(accountRefusalMessage({ status: 404, message: 'HTTP 404: Missing.' })).toBeUndefined();
    expect(accountRefusalMessage({ code: 'SOMETHING_ELSE', message: 'Nope.' })).toBeUndefined();
  });

  it('bounds server text to one line of a fixed length, whichever way it arrives', async () => {
    const long = `Blocked.\n${'x'.repeat(5_000)}`;
    const shown = [
      accountRefusalMessage({ status: 403, message: `HTTP 403: ${long}` }),
      accountRefusalMessage({ code: 'FORBIDDEN', message: long }),
      (await readAccountRefusal(refusalResponse(403, { code: 'FORBIDDEN', message: long })))
        ?.message,
    ];

    for (const text of shown) {
      expect(text?.startsWith('Blocked. x')).toBe(true);
      expect(text).not.toContain('\n');
      expect(text?.endsWith('\u2026')).toBe(true);
      expect(Array.from(text ?? '')).toHaveLength(ACCOUNT_REFUSAL_TEXT_MAX_LENGTH);
    }
  });
});

describe('failure sentences for the account lists', () => {
  const lockdown = {
    status: 403,
    message: 'HTTP 403: This workspace is locked down while an incident is investigated.',
  };

  it.each([
    ['connectors', describeConnectorFailure],
    ['projects', describeProjectFailure],
    ['schedules', describeScheduleFailure],
    ['artifacts', describeArtifactFailure],
  ])('shows the lockdown wording, not a plan sentence, for %s', (_list, describe) => {
    expect(describe(lockdown)).toBe(
      'This workspace is locked down while an incident is investigated.',
    );
  });

  it.each([
    ['connectors', describeConnectorFailure],
    ['projects', describeProjectFailure],
    ['schedules', describeScheduleFailure],
    ['artifacts', describeArtifactFailure],
  ])('shows the outage wording for %s', (_list, describe) => {
    expect(
      describe({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable',
      }),
    ).toBe('Service temporarily unavailable');
  });

  it('keeps the plan sentence for a refusal that carries no wording', () => {
    expect(describeProjectFailure({ status: 403, message: 'HTTP 403' })).toBe(
      'this account cannot manage projects on its current plan',
    );
  });
});

describe('refusal vocabulary', () => {
  it('groups codes case-insensitively', () => {
    expect(accountRefusalKind('Surface_Not_Allowed')).toBe('policy');
    expect(accountRefusalKind('nope')).toBeUndefined();
    expect(accountRefusalKind(undefined)).toBeUndefined();
  });

  it('reads a wait in seconds or as a date', () => {
    expect(parseRetryAfterMs('7')).toBe(7_000);
    expect(
      parseRetryAfterMs('Thu, 01 Jan 2026 00:00:10 GMT', Date.parse('2026-01-01T00:00:00Z')),
    ).toBe(10_000);
    expect(parseRetryAfterMs('soon')).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
  });
});
