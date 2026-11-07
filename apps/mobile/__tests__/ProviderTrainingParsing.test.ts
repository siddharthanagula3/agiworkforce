import {
  parseProviderTrainingChoice,
  parseProviderTrainingReceipt,
} from '@/src/features/settings/cloud-privacy/providerTrainingPreference';

describe('provider training preference contracts', () => {
  it('accepts an absent opt-out key as off only inside an authoritative namespace response', () => {
    expect(parseProviderTrainingChoice({ settings: {}, version: null })).toEqual({
      optedOut: false,
      version: null,
    });
    expect(
      parseProviderTrainingChoice({ settings: { other: true }, version: 'opaque revision' }),
    ).toEqual({
      optedOut: false,
      version: 'opaque revision',
    });
  });

  it.each([true, false])('reads an explicit boolean %s with its opaque revision', (optedOut) => {
    expect(
      parseProviderTrainingChoice({
        settings: { keepOutOfProviderTraining: optedOut },
        version: '2026-11-04 12:01:02.345678+00',
      }),
    ).toEqual({ optedOut, version: '2026-11-04 12:01:02.345678+00' });
  });

  it.each([
    { body: null },
    { body: [] },
    { body: {} },
    { body: { settings: {} } },
    { body: { settings: {}, version: '' } },
    { body: { settings: {}, version: ' ' } },
    { body: { settings: {}, version: 1 } },
    { body: { settings: null, version: null } },
    { body: { settings: [], version: null } },
    { body: { settings: false, version: null } },
    { body: { settings: { keepOutOfProviderTraining: null }, version: null } },
    { body: { settings: { keepOutOfProviderTraining: 'true' }, version: null } },
  ])('refuses a malformed read instead of inventing absence: $body', ({ body }) => {
    expect(() => parseProviderTrainingChoice(body)).toThrow();
  });

  it.each([true, false])('requires a full-document write receipt for %s', (optedOut) => {
    expect(
      parseProviderTrainingReceipt(
        {
          settings: {
            privacy: { keepOutOfProviderTraining: optedOut },
            general: { theme: 'dark' },
          },
          version: 'new revision',
        },
        optedOut,
      ),
    ).toEqual({ optedOut, version: 'new revision' });
  });

  it.each([
    { body: {} },
    { body: { settings: { keepOutOfProviderTraining: true }, version: 'new' } },
    { body: { settings: {}, version: 'new' } },
    { body: { settings: { privacy: {} }, version: 'new' } },
    { body: { settings: { privacy: { keepOutOfProviderTraining: false } }, version: 'new' } },
    { body: { settings: { privacy: { keepOutOfProviderTraining: true } }, version: null } },
    { body: { settings: { privacy: { keepOutOfProviderTraining: true } } } },
  ])('does not acknowledge malformed or contradictory receipt: $body', ({ body }) => {
    expect(() => parseProviderTrainingReceipt(body, true)).toThrow();
  });

  it('does not acknowledge an opt-out when the submitted choice was off', () => {
    expect(() =>
      parseProviderTrainingReceipt(
        {
          settings: { privacy: { keepOutOfProviderTraining: true } },
          version: 'new',
        },
        false,
      ),
    ).toThrow();
  });
});
