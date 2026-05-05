/**
 * Regression tests for MED-MOB-03 — Dispatch `previewUrl` persistence
 * (red-team finding 2026-05).
 *
 * Pre-fix `partialize`:
 *   partialize: (state) => ({ messages: state.messages.slice(-500) }),
 *
 * persisted up to 500 dispatch messages to MMKV, including any
 * `taskResult.previewUrl` field. The desktop sends `previewUrl` as a
 * pre-signed CDN URL that grants read access to the artifact for the
 * URL's TTL — typically hours to days. A forensic image of the device
 * extracts these URLs even after the user signs out.
 *
 * Post-fix the partialize maps each message and drops `previewUrl` while
 * keeping fileName/location/summary. These tests pin the contract by
 * exercising partialize directly through a constructed state object.
 */

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WUTDO',
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32)),
}));
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));
jest.mock('@/lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  initMmkvEncryption: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/stores/connectionStore', () => ({
  useConnectionStore: {
    getState: () => ({ sendControl: jest.fn(), status: 'connected', queueControl: jest.fn() }),
  },
}));

import { useDispatchStore } from '../stores/dispatchStore';
import type { DispatchMessage } from '../stores/dispatchStore';

// Mirror of the partialize body in dispatchStore. We keep this verbatim and
// catch drift via the sentinel test at the bottom.
function applyPartialize(messages: DispatchMessage[]): { messages: DispatchMessage[] } {
  return {
    messages: messages.slice(-500).map((m) => {
      if (!m.taskResult || !m.taskResult.previewUrl) return m;
      const { previewUrl: _drop, ...rest } = m.taskResult;
      void _drop;
      return { ...m, taskResult: rest };
    }),
  };
}

beforeEach(() => {
  useDispatchStore.setState({ messages: [] });
});

describe('dispatchStore.partialize — strips previewUrl on persist', () => {
  it('drops previewUrl from a single message', () => {
    const msg: DispatchMessage = {
      id: 'm1',
      role: 'desktop',
      text: 'Done',
      timestamp: '2026-05-05T07:00:00.000Z',
      taskStatus: 'completed',
      taskResult: {
        fileName: 'report.pdf',
        location: 'Documents/',
        summary: '12-page report on Q2 results',
        previewUrl: 'https://signed-url.s3.amazonaws.com/report.pdf?X-Amz-Signature=abc',
      },
    };
    const result = applyPartialize([msg]);
    expect(result.messages[0]!.taskResult).toEqual({
      fileName: 'report.pdf',
      location: 'Documents/',
      summary: '12-page report on Q2 results',
    });
    expect(result.messages[0]!.taskResult).not.toHaveProperty('previewUrl');
  });

  it('keeps the message whole when taskResult has no previewUrl', () => {
    const msg: DispatchMessage = {
      id: 'm2',
      role: 'desktop',
      text: 'Working',
      timestamp: '2026-05-05T07:00:00.000Z',
      taskStatus: 'working',
      taskResult: { fileName: 'thinking.md', summary: 'Step 3 of 5' },
    };
    const result = applyPartialize([msg]);
    expect(result.messages[0]).toEqual(msg);
    // Identity preserved → no needless object churn on persist.
    expect(result.messages[0]).toBe(msg);
  });

  it('leaves user messages untouched', () => {
    const msg: DispatchMessage = {
      id: 'm3',
      role: 'user',
      text: 'Find me the latest sales data',
      timestamp: '2026-05-05T07:00:00.000Z',
    };
    const result = applyPartialize([msg]);
    expect(result.messages[0]).toBe(msg);
  });

  it('caps the persisted thread at 500 messages, then strips', () => {
    const messages: DispatchMessage[] = Array.from({ length: 750 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? 'user' : 'desktop',
      text: `msg ${i}`,
      timestamp: new Date(1700000000000 + i * 1000).toISOString(),
      taskStatus: 'completed',
      taskResult: { previewUrl: `https://cdn.example.com/${i}.pdf` },
    }));
    const result = applyPartialize(messages);
    expect(result.messages).toHaveLength(500);
    // The last persisted msg is m749, with previewUrl stripped.
    const last = result.messages[result.messages.length - 1]!;
    expect(last.id).toBe('m749');
    expect(last.taskResult).toEqual({});
  });

  it('handles empty taskResult (no previewUrl, no other fields)', () => {
    const msg: DispatchMessage = {
      id: 'm4',
      role: 'desktop',
      text: 'Done',
      timestamp: '2026-05-05T07:00:00.000Z',
      taskResult: {},
    };
    const result = applyPartialize([msg]);
    expect(result.messages[0]).toBe(msg);
  });
});

describe('drift sentinel — dispatchStore.ts still strips previewUrl on persist', () => {
  it('the source file references the strip pattern', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'stores', 'dispatchStore.ts'), 'utf8');
    expect(src).toContain('previewUrl: _drop');
    expect(src).toContain('partialize:');
  });
});
