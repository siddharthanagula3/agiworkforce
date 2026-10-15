import { describe, expect, it } from 'vitest';
import { receivedSecretsNotice } from '../receivedSecrets';

describe('the secrets a server is given, in plain words', () => {
  it('says nothing for a server that names none of the user secrets', () => {
    expect(receivedSecretsNotice(undefined, false)).toBeNull();
    expect(receivedSecretsNotice([], true)).toBeNull();
  });

  it('names a provider key before the user turns the server on', () => {
    expect(receivedSecretsNotice([{ kind: 'apiKey', provider: 'anthropic' }], false)).toBe(
      'Turning this on gives this server your Anthropic API key.',
    );
  });

  it('names every secret of a server that is already on', () => {
    expect(
      receivedSecretsNotice(
        [
          { kind: 'apiKey', provider: 'anthropic' },
          { kind: 'signIn', provider: 'github' },
        ],
        true,
      ),
    ).toBe(
      'This server is given your Anthropic API key and your GitHub sign-in token each time it connects.',
    );
  });

  it('falls back to the name the configuration used when it knows no better one', () => {
    expect(receivedSecretsNotice([{ kind: 'signIn', provider: 'acme_sso' }], false)).toBe(
      'Turning this on gives this server your acme_sso sign-in token.',
    );
  });
});
