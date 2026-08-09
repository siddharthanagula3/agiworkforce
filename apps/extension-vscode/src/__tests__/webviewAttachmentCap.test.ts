/**
 * webviewAttachmentCap.test.ts — the composer's client-side size bound must
 * never exceed the host's `attachFiles` Zod ceiling.
 *
 * `parseWebviewMessage` failing drops the WHOLE batch, not the one oversized
 * file, and the host then posts no `attachFilesAck` — so every chip in that
 * drop stays stuck on "uploading" and any well-sized file dropped alongside
 * the offender is silently lost. A webview bound above the schema's ceiling
 * therefore turns a per-file rejection into a dead composer, which is exactly
 * what a 10 MiB webview constant did against a 10,000,000-byte schema.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { parseWebviewMessage } from '../protocol/webviewMessages';

function renderWebview(): string {
  return getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({
        toString: () => uri.toString().replace(/^file:/, 'https://mock'),
      }),
    } as unknown as Parameters<typeof getWebviewContent>[0],
    {
      toString: () => 'file:///mock/extension',
      fsPath: '/mock/extension',
    } as unknown as Parameters<typeof getWebviewContent>[1],
    'NONCE',
    'auto',
    'medium',
    true,
    false,
  );
}

/**
 * Read the composer's own ceiling out of the shipped script, not a copy — a
 * duplicated constant here would keep passing after the webview drifted.
 * Accepts the `a * b` product form so the assertion survives either spelling.
 */
function webviewAttachmentCap(): number {
  const match = /var MAX_ATTACHMENT_BYTES = ([0-9_*\s]+);/.exec(renderWebview());
  if (!match) throw new Error('MAX_ATTACHMENT_BYTES not found in webview script');
  return match[1]!
    .split('*')
    .reduce((product, factor) => product * Number(factor.trim().replace(/_/g, '')), 1);
}

function attachFilesAt(sizeBytes: number): unknown {
  return {
    type: 'attachFiles',
    payload: {
      files: [
        {
          name: 'at-the-cap.bin',
          mimeType: 'text/plain',
          sizeBytes,
          dataUrl: 'data:text/plain;base64,eA==',
        },
      ],
    },
  };
}

describe('webview composer attachment ceiling', () => {
  it('accepts a file sized exactly at the webview ceiling', () => {
    expect(parseWebviewMessage(attachFilesAt(webviewAttachmentCap()))).toBeDefined();
  });

  it('rejects one byte above the webview ceiling', () => {
    expect(parseWebviewMessage(attachFilesAt(webviewAttachmentCap() + 1))).toBeUndefined();
  });
});
