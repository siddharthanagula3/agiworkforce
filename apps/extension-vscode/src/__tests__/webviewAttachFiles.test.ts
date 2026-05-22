/**
 * webviewAttachFiles.test.ts — schema coverage for the new `attachFiles`
 * webview→host message added on 2026-05-21 (round-2 audit P0 #3, vscode-ext
 * composer drag-drop + paste-image wire).
 *
 * The schema's job is to refuse hostile payloads: oversized data URLs,
 * path-separator filenames, non-`data:` URLs, and empty/too-many batches.
 * If any of these slip past, the host writes attacker-controlled bytes to
 * disk and then hands the path to addToContext. Hard to recover from once
 * that surface ships, so keep the test set tight.
 */

import { describe, it, expect } from 'vitest';
import { parseWebviewMessage } from '../protocol/webviewMessages';

function dataUrlFor(content: string): string {
  return 'data:text/plain;base64,' + Buffer.from(content, 'utf8').toString('base64');
}

describe('attachFiles webview→host schema', () => {
  it('accepts a well-formed batch of two small files', () => {
    const result = parseWebviewMessage({
      type: 'attachFiles',
      payload: {
        files: [
          { name: 'a.txt', mimeType: 'text/plain', sizeBytes: 5, dataUrl: dataUrlFor('hello') },
          { name: 'b.txt', mimeType: 'text/plain', sizeBytes: 5, dataUrl: dataUrlFor('world') },
        ],
      },
    });
    expect(result).toBeDefined();
    if (!result || result.type !== 'attachFiles') throw new Error('wrong shape');
    expect(result.payload.files).toHaveLength(2);
  });

  it('rejects filenames containing path separators', () => {
    const result = parseWebviewMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: '../../etc/passwd',
            mimeType: 'text/plain',
            sizeBytes: 5,
            dataUrl: dataUrlFor('x'),
          },
        ],
      },
    });
    expect(result).toBeUndefined();
  });

  it('rejects backslash path separators (Windows style)', () => {
    const result = parseWebviewMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: '..\\Windows\\System32\\hosts',
            mimeType: 'text/plain',
            sizeBytes: 5,
            dataUrl: dataUrlFor('x'),
          },
        ],
      },
    });
    expect(result).toBeUndefined();
  });

  it('rejects non-data: URLs', () => {
    const result = parseWebviewMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'a.txt',
            mimeType: 'text/plain',
            sizeBytes: 5,
            dataUrl: 'https://attacker.example.invalid/payload',
          },
        ],
      },
    });
    expect(result).toBeUndefined();
  });

  it('rejects empty batches', () => {
    const result = parseWebviewMessage({
      type: 'attachFiles',
      payload: { files: [] },
    });
    expect(result).toBeUndefined();
  });

  it('rejects batches larger than 8 files', () => {
    const files = Array.from({ length: 9 }, (_, i) => ({
      name: `file-${i}.txt`,
      mimeType: 'text/plain',
      sizeBytes: 5,
      dataUrl: dataUrlFor(`f${i}`),
    }));
    const result = parseWebviewMessage({ type: 'attachFiles', payload: { files } });
    expect(result).toBeUndefined();
  });

  it('rejects sizeBytes above the 10 MB ceiling', () => {
    const result = parseWebviewMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'big.bin',
            mimeType: 'application/octet-stream',
            sizeBytes: 10_000_001,
            dataUrl: dataUrlFor('x'),
          },
        ],
      },
    });
    expect(result).toBeUndefined();
  });

  it('rejects negative sizeBytes', () => {
    const result = parseWebviewMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'neg.bin',
            mimeType: 'application/octet-stream',
            sizeBytes: -1,
            dataUrl: dataUrlFor('x'),
          },
        ],
      },
    });
    expect(result).toBeUndefined();
  });
});
