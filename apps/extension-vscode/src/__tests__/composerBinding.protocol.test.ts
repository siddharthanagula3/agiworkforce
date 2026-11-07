import { describe, expect, it } from 'vitest';
import { parseBoundWebviewMessage, parseWebviewMessage } from '../protocol/webviewMessages';

describe('composer action binding protocol', () => {
  const composer = { instance: 'current-webview', revision: 3, attachments: 0 };
  const action = {
    type: 'messageAction',
    payload: { action: 'resend', text: 'original prompt', occurrence: 0, composer },
  };

  it('retains the exact composer snapshot on an action and state update', () => {
    expect(parseWebviewMessage(action)).toEqual(action);
    expect(parseWebviewMessage({ type: 'composerState', payload: composer })).toEqual({
      type: 'composerState',
      payload: composer,
    });
  });

  it.each([
    { ...composer, instance: '' },
    { ...composer, revision: -1 },
    { ...composer, revision: 0.5 },
    { ...composer, revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...composer, attachments: -1 },
    { ...composer, attachments: 0.5 },
  ])('rejects an invalid composer snapshot: %j', (invalid) => {
    expect(parseWebviewMessage({ type: 'composerState', payload: invalid })).toBeUndefined();
    expect(
      parseWebviewMessage({ ...action, payload: { ...action.payload, composer: invalid } }),
    ).toBeUndefined();
  });

  it('keeps missing legacy binding absent for the host to refuse conservatively', () => {
    const legacy = {
      type: 'messageAction',
      payload: { action: 'branch', text: 'original prompt', occurrence: 0 },
    };
    expect(parseWebviewMessage(legacy)).toEqual(legacy);
  });

  it('does not admit composer state from a replaced session or another surface', () => {
    const current = { origin: 'sidebar', epoch: 4 };
    const state = { type: 'composerState', payload: composer, ...current };
    expect(parseBoundWebviewMessage(state, current)).toEqual({
      type: 'composerState',
      payload: composer,
    });
    expect(parseBoundWebviewMessage({ ...state, epoch: 3 }, current)).toBeUndefined();
    expect(parseBoundWebviewMessage({ ...state, origin: 'editor' }, current)).toBeUndefined();
  });
});
