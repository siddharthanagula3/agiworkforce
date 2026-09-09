import { describe, expect, it } from 'vitest';

import { classifyCommandRisk } from '@/lib/services/cloud-code-agent-tools';
import { isProviderProxyPathAllowed } from '@/lib/e2b/provider-proxy';

/**
 * `env` was in the read-only set, and the classifier decides on the first token
 * alone. `env sh -c "..."` carries no shell metacharacter and matches no denied
 * pattern, so it ran in the sandbox with no approval while being reported as
 * "Read-only, workspace-scoped command."
 */
describe('a command that runs another program is never classified read-only', () => {
  it.each([
    'env',
    'env sh -c "cat /etc/environment"',
    'env PATH=/tmp sh',
    'printenv',
    'printenv AWS_SECRET_ACCESS_KEY',
    'nice cat /etc/passwd',
    'timeout 5 sh',
    'xargs cat',
    'nohup sh',
    'busybox sh',
  ])('%s needs approval', (command) => {
    expect(classifyCommandRisk(command).risk).not.toBe('safe');
  });

  it.each(['ls -la', 'cat src/index.ts', 'grep -rn TODO src', 'pwd', 'rg pattern'])(
    '%s stays read-only',
    (command) => {
      expect(classifyCommandRisk(command).risk).toBe('safe');
    },
  );
});

/**
 * The proxy attaches the platform's own provider key, so a path it forwards is
 * called with that credential. Relaying whatever the sandbox named made it a
 * general-purpose credential for the provider's whole API.
 */
describe('the session provider proxy forwards only the paths a harness needs', () => {
  it.each([
    ['anthropic', 'messages'],
    ['anthropic', 'v1/messages'],
    ['anthropic', 'models'],
    ['openai', 'responses'],
    ['openai', 'v1/responses'],
    ['openai', 'chat/completions'],
  ])('allows %s %s', (providerId, path) => {
    expect(isProviderProxyPathAllowed(providerId, path)).toBe(true);
  });

  it.each([
    ['anthropic', 'v1/organizations/me'],
    ['anthropic', 'v1/complete'],
    ['openai', 'v1/files'],
    ['openai', 'v1/fine_tuning/jobs'],
    ['openai', 'organization/invites'],
    ['google', 'v1/models'],
    ['openai', ''],
  ])('refuses %s %s', (providerId, path) => {
    expect(isProviderProxyPathAllowed(providerId, path)).toBe(false);
  });
});
