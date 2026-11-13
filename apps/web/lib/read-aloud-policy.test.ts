import { describe, expect, it } from 'vitest';
import { LOCAL_MODEL_SERVERS, localModelId } from '@agiworkforce/local-runtime-contract';
import {
  codeReadAloudUnavailable,
  currentReadAloudMessage,
  messageReadAloudUnavailable,
  READ_ALOUD_PRIVACY_UNAVAILABLE,
  READ_ALOUD_UNVERIFIED,
} from './read-aloud-policy';

const row = { id: 'clicked', content: 'Current text' };

describe('read-aloud trust policy', () => {
  it.each(['local', 'byok'])('refuses explicit %s origin', (privacyMode) => {
    expect(messageReadAloudUnavailable({ ...row, metadata: { privacyMode } })).toBe(
      READ_ALOUD_PRIVACY_UNAVAILABLE,
    );
  });
  it.each(['Local', 'DirectByok'])(
    'lets restrictive %s evidence outrank managed labels',
    (providerMode) => {
      expect(
        messageReadAloudUnavailable({ ...row, metadata: { privacyMode: 'managed', providerMode } }),
      ).toBe(READ_ALOUD_PRIVACY_UNAVAILABLE);
    },
  );
  it('recognizes a canonical Local model before streaming completion stamps metadata', () => {
    expect(
      messageReadAloudUnavailable({
        ...row,
        model: localModelId(LOCAL_MODEL_SERVERS[0], 'test-fixture'),
      }),
    ).toBe(READ_ALOUD_PRIVACY_UNAVAILABLE);
  });
  it('does not invent a boundary for legacy Chat or unknown display models', () => {
    expect(messageReadAloudUnavailable(row)).toBeNull();
    expect(messageReadAloudUnavailable({ ...row, model: 'legacy-model' })).toBeNull();
  });
  it('returns latest clicked text and refuses missing or now-restricted rows', () => {
    expect(currentReadAloudMessage([{ ...row, content: 'Newest' }], row.id)?.content).toBe(
      'Newest',
    );
    expect(currentReadAloudMessage([row], 'gone')).toBeNull();
    expect(
      currentReadAloudMessage([{ ...row, metadata: { privacyMode: 'local' } }], row.id),
    ).toBeNull();
  });
  it('does not use an unrelated restrictive message to classify the clicked legacy row', () => {
    const other = { id: 'other', content: 'Local', metadata: { privacyMode: 'local' } };
    expect(currentReadAloudMessage([other, row], row.id)).toBe(row);
  });
  it('refuses unknown Local-runtime Code but preserves its durable managed mode', () => {
    expect(codeReadAloudUnavailable('unknown')).toBe(READ_ALOUD_UNVERIFIED);
    expect(codeReadAloudUnavailable('local')).toBe(READ_ALOUD_PRIVACY_UNAVAILABLE);
    expect(codeReadAloudUnavailable('byok')).toBe(READ_ALOUD_PRIVACY_UNAVAILABLE);
    expect(codeReadAloudUnavailable('managed')).toBeNull();
  });
});
