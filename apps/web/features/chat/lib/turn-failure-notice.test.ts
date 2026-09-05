import { describe, expect, it } from 'vitest';
import { resolveTurnFailureNotice } from './turn-failure-notice';

const SEND_FAILURE = 'Could not start the conversation.';

describe('resolveTurnFailureNotice', () => {
  it('gives a failed send to the transcript, so the banner never repeats it', () => {
    expect(
      resolveTurnFailureNotice({
        error: SEND_FAILURE,
        transcriptMounted: true,
        paywallOwnsTurn: false,
      }),
    ).toEqual({ placement: 'inline', message: SEND_FAILURE });
  });

  it('falls back to the banner when no transcript is on screen to hold it', () => {
    expect(
      resolveTurnFailureNotice({
        error: SEND_FAILURE,
        transcriptMounted: false,
        paywallOwnsTurn: false,
      }),
    ).toEqual({ placement: 'banner', message: SEND_FAILURE });
  });

  it('stands aside when the paywall card already owns the turn', () => {
    expect(
      resolveTurnFailureNotice({
        error: SEND_FAILURE,
        transcriptMounted: true,
        paywallOwnsTurn: true,
      }).placement,
    ).toBe('none');
  });

  it('treats an absent or blank error as nothing to report', () => {
    for (const error of [null, undefined, '', '   ']) {
      expect(
        resolveTurnFailureNotice({ error, transcriptMounted: true, paywallOwnsTurn: false }),
      ).toEqual({ placement: 'none', message: null });
    }
  });

  it('trims the reported message so the notice never renders padded copy', () => {
    expect(
      resolveTurnFailureNotice({
        error: `  ${SEND_FAILURE}  `,
        transcriptMounted: false,
        paywallOwnsTurn: false,
      }).message,
    ).toBe(SEND_FAILURE);
  });
});
