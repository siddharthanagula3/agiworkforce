import {
  parseTrainingPreferenceReceipt,
  parseTrainingPreferences,
} from '@/src/features/settings/cloud-privacy/trainingPreferences';

const off = {
  keepOutOfProviderTraining: false,
  allowChatsForModelImprovement: false,
  allowVoiceForModelImprovement: false,
};

describe('training preference contracts', () => {
  it('accepts absent choices as off only inside an authoritative namespace response', () => {
    expect(parseTrainingPreferences({ settings: {}, version: null })).toEqual({
      values: off,
      version: null,
    });
    expect(
      parseTrainingPreferences({ settings: { other: true }, version: 'opaque revision' }),
    ).toEqual({ values: off, version: 'opaque revision' });
  });

  it.each([true, false])('reads explicit booleans %s with their opaque revision', (on) => {
    expect(
      parseTrainingPreferences({
        settings: {
          keepOutOfProviderTraining: on,
          allowChatsForModelImprovement: on,
          allowVoiceForModelImprovement: !on,
        },
        version: '2026-11-04 12:01:02.345678+00',
      }),
    ).toEqual({
      values: {
        keepOutOfProviderTraining: on,
        allowChatsForModelImprovement: on,
        allowVoiceForModelImprovement: !on,
      },
      version: '2026-11-04 12:01:02.345678+00',
    });
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
    { body: { settings: { allowChatsForModelImprovement: 'true' }, version: null } },
    { body: { settings: { allowVoiceForModelImprovement: 1 }, version: null } },
  ])('refuses a malformed read instead of inventing absence: $body', ({ body }) => {
    expect(() => parseTrainingPreferences(body)).toThrow();
  });

  it.each([
    'keepOutOfProviderTraining',
    'allowChatsForModelImprovement',
    'allowVoiceForModelImprovement',
  ] as const)('requires a full-document write receipt for %s', (key) => {
    expect(
      parseTrainingPreferenceReceipt(
        {
          settings: { privacy: { [key]: true }, general: { theme: 'dark' } },
          version: 'new revision',
        },
        key,
        true,
      ),
    ).toEqual({ values: { ...off, [key]: true }, version: 'new revision' });
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
    expect(() => parseTrainingPreferenceReceipt(body, 'keepOutOfProviderTraining', true)).toThrow();
  });

  it('does not acknowledge a choice the receipt stored for a different key', () => {
    expect(() =>
      parseTrainingPreferenceReceipt(
        { settings: { privacy: { keepOutOfProviderTraining: true } }, version: 'new' },
        'allowChatsForModelImprovement',
        true,
      ),
    ).toThrow();
  });
});
