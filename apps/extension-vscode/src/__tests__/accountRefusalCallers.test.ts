import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { submitFeedback } from '../features/feedback/submitFeedback';
import { showApprovalHistory } from '../features/permissions/approvalHistory';
import { readAccountPreferences } from '../utils/accountPreferences';
import * as api from '../utils/api';

const SECRETS = {} as vscode.SecretStorage;

function refusal(status: number, error: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error }), { status });
}

describe('account requests that the server refuses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'getAccountToken').mockResolvedValue('account-token');
    vi.spyOn(api, 'getCloudWebOrigin').mockReturnValue('https://agiworkforce.example');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports feedback refused by a lockdown in the server wording', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      refusal(403, { code: 'FORBIDDEN', message: 'This workspace is locked down.' }),
    );

    await expect(submitFeedback(SECRETS, 'bug', 'It broke')).resolves.toEqual({
      status: 'failed',
      reason: 'This workspace is locked down.',
    });
  });

  it('reports feedback during an outage as a failure, not as a signed-out account', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      refusal(503, { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' }),
    );

    await expect(submitFeedback(SECRETS, 'bug', 'It broke')).resolves.toEqual({
      status: 'failed',
      reason: 'Service temporarily unavailable',
    });
  });

  it('keeps the status line when the server gave no wording', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));

    const outcome = await submitFeedback(SECRETS, 'bug', 'It broke');

    expect(outcome).toMatchObject({ status: 'failed' });
    expect(outcome).toMatchObject({ reason: expect.stringContaining('HTTP 500') });
  });

  it('names the policy that blocked the account preferences', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      refusal(403, {
        type: 'organization_policy',
        code: 'surface_sync_disabled',
        message: 'Your workspace turned off sync for this client.',
      }),
    );

    await expect(readAccountPreferences(SECRETS, 'vscode')).rejects.toThrow(
      'Your workspace turned off sync for this client.',
    );
  });

  it('shows an approval history outage in the server wording', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      refusal(503, { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' }),
    );

    await showApprovalHistory(SECRETS);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      `${PRODUCT_NAMES.code}: approval history could not be loaded, Service temporarily unavailable.`,
    );
  });
});
