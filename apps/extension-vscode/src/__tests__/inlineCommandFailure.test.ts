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
import { isCredentialFailure } from '../core/runInlineCommand';

const here = dirname(fileURLToPath(import.meta.url));
const inline = readFileSync(resolve(here, '..', 'core/runInlineCommand.ts'), 'utf8');

describe('isCredentialFailure', () => {
  it.each([
    'Invalid API key provided',
    'Request failed: 401 Unauthorized',
    'HTTP 403',
    'authentication_error: check your credentials',
    'invalid_api_key',
  ])('treats %s as a credential problem', (message) => {
    expect(isCredentialFailure(message)).toBe(true);
  });

  it.each([
    'fetch failed: ECONNRESET',
    'Rate limit exceeded, retry in 20s',
    'Request timed out after 60000ms',
    'HTTP 500 Internal Server Error',
    'The model returned no content',
  ])('does not send %s to the key dialog', (message) => {
    // Each of these previously surfaced "Set API Key" as the only way forward.
    expect(isCredentialFailure(message)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isCredentialFailure('INVALID API KEY')).toBe(true);
  });
});

describe('inline command failure handling', () => {
  it('offers a retry for non-credential failures', () => {
    expect(inline).toContain("showErrorMessage(`AGI Workforce error: ${message}`, 'Retry')");
    expect(inline).toContain('void runInlineCommand(context, command, targetRange)');
  });

  it('still offers the key dialog when a key is the actual problem', () => {
    expect(inline).toContain('if (isCredentialFailure(message))');
    expect(inline).toContain("'agi-workforce.setApiKey'");
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
