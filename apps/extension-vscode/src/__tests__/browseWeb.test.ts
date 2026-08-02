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

  it('validates active-turn behavior, client identity, and structured references together', () => {
    expect(
      parseWebviewMessage({
        type: 'sendMessage',
        payload: {
          text: 'Queue this review',
          followUpBehavior: 'queue',
          clientMessageId: 'msg-123.abc',
          references: [
            {
              path: 'src/app.ts',
              range: { startLine: 1, startCharacter: 0, endLine: 2, endCharacter: 4 },
            },
          ],
        },
      }),
    ).toEqual({
      type: 'sendMessage',
      payload: {
        text: 'Queue this review',
        followUpBehavior: 'queue',
        clientMessageId: 'msg-123.abc',
        references: [
          {
            path: 'src/app.ts',
            range: { startLine: 1, startCharacter: 0, endLine: 2, endCharacter: 4 },
          },
        ],
      },
    });
    expect(
      parseWebviewMessage({
        type: 'sendMessage',
        payload: {
          text: 'Malformed behavior',
          followUpBehavior: 'interrupt',
          clientMessageId: 'contains spaces',
        },
      }),
    ).toBeUndefined();
  });
});
