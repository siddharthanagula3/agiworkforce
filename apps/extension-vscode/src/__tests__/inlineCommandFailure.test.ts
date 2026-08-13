/**
 * inlineCommandFailure.test.ts — VSCX-03.
 *
 * Every inline-command failure offered one button: "Set API Key". A dropped
 * connection, a rate limit or a server error therefore told the user their
 * credentials were wrong — the action contradicted the message beside it, and
 * following it would have them change working credentials.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyCloudUtilityFailure } from '../core/cloudUtilityErrorActions';
import { AgiWorkforceApiError, AgiWorkforcePaywallError } from '../utils/api';

const here = dirname(fileURLToPath(import.meta.url));
const inline = readFileSync(resolve(here, '..', 'core/runInlineCommand.ts'), 'utf8');

describe('cloud utility failure classification', () => {
  it('keeps AGI Cloud sign-in separate from saved API-key recovery', () => {
    expect(
      classifyCloudUtilityFailure(
        new AgiWorkforceApiError('Session expired', 401, 'ACCOUNT_AUTH_REQUIRED'),
      ),
    ).toBe('account-auth');
    expect(
      classifyCloudUtilityFailure(new AgiWorkforceApiError('Invalid key', 401, 'INVALID_API_KEY')),
    ).toBe('api-key');
  });

  it.each(['fetch failed: ECONNRESET', 'Request timed out after 60000ms'])(
    'classifies %s as retryable without changing credentials',
    (message) => {
      expect(classifyCloudUtilityFailure(new Error(message))).toBe('retryable');
    },
  );

  it('classifies structured HTTP throttling and server failures as retryable', () => {
    expect(
      classifyCloudUtilityFailure(new AgiWorkforceApiError('Slow down', 429, 'RATE_LIMITED')),
    ).toBe('retryable');
    expect(
      classifyCloudUtilityFailure(new AgiWorkforceApiError('Unavailable', 503, 'HTTP_ERROR')),
    ).toBe('retryable');
  });

  it('classifies paywalls without mistaking them for auth failures', () => {
    expect(
      classifyCloudUtilityFailure(new AgiWorkforcePaywallError('chat', 'pro', 'Upgrade required.')),
    ).toBe('paywall');
  });
});

describe('inline command failure handling', () => {
  it('offers a retry for non-credential failures', () => {
    expect(inline).toContain('showCloudUtilityErrorActions(err');
    expect(inline).toContain('retry: () => runInlineCommand(context, command, targetRange)');
  });

  it('does not implement a second, message-regex credential classifier', () => {
    expect(inline).not.toContain('isCredentialFailure');
    expect(inline).not.toContain("'Set API Key'");
  });

  it('applies the edit to the range the prompt was built from', () => {
    // A CodeLens supplies a range without selecting anything, so collapsing an
    // empty selection to 0,0 would have applied the result at the top of the
    // file rather than at the declaration it describes.
    expect(inline).not.toContain(
      'selection.isEmpty ? new vscode.Selection(0, 0, 0, 0) : selection',
    );
    expect(inline).toContain('new vscode.Selection(explicitRange.start, explicitRange.end)');
  });
});
