import { describe, expect, it } from 'vitest';

import { parseWebviewMessage } from '../protocol/webviewMessages';

describe('Browse the web message boundary', () => {
  it('accepts only a boolean one-turn browse request', () => {
    expect(
      parseWebviewMessage({
        type: 'sendMessage',
        payload: { text: 'Find current sources', browseWeb: true },
      }),
    ).toEqual({
      type: 'sendMessage',
      payload: { text: 'Find current sources', browseWeb: true },
    });
    expect(
      parseWebviewMessage({
        type: 'sendMessage',
        payload: { text: 'Find current sources', browseWeb: 'always' },
      }),
    ).toBeUndefined();
  });
});
