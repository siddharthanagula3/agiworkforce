import { FALLBACK_REASON_HEADER, RESOLVED_MODEL_HEADER, listChatModels } from '@agiworkforce/types';
import {
  messageFallbackNotice,
  readModelSubstitution,
} from '@/src/features/chat/utils/fallbackNotice';

function headers(values: Record<string, string>): Pick<Headers, 'get'> {
  return { get: (name: string) => values[name] ?? null };
}

describe('model substitution disclosure', () => {
  it('reads the reason and the served model from the response', () => {
    expect(
      readModelSubstitution(
        headers({ [FALLBACK_REASON_HEADER]: ' managed_failover ', [RESOLVED_MODEL_HEADER]: 'm-1' }),
      ),
    ).toEqual({ fallbackReason: 'managed_failover', servedModel: 'm-1' });
    expect(
      readModelSubstitution(headers({ [FALLBACK_REASON_HEADER]: 'free_limit_reached' })),
    ).toEqual({ fallbackReason: 'free_limit_reached' });
  });

  it('says nothing when the server reported no substitution', () => {
    expect(readModelSubstitution(headers({ [RESOLVED_MODEL_HEADER]: 'm-1' }))).toBeNull();
    expect(messageFallbackNotice(undefined)).toBeNull();
    expect(messageFallbackNotice({ servedModel: 'm-1' })).toBeNull();
  });

  it('names the model that answered when the catalog knows it', () => {
    const [served] = listChatModels();
    expect(served?.name).toBeTruthy();
    expect(
      messageFallbackNotice({ fallbackReason: 'managed_failover', servedModel: served?.id }),
    ).toBe(`The model you picked was unavailable, so this reply came from ${served?.name}.`);
  });

  it('falls back to wording without a name for an unknown model', () => {
    expect(
      messageFallbackNotice({
        fallbackReason: 'insufficient_credits',
        servedModel: 'unknown-model',
      }),
    ).toBe('You were out of credits for the model you picked, so a cheaper model answered.');
  });
});
