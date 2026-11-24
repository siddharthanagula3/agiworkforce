import type { Memento } from 'vscode';
import { describe, expect, it } from 'vitest';
import {
  rememberTypedText,
  sentContextFor,
  typedTextFor,
} from '../features/sidebar-webview/typedMessages';

describe('saved message context', () => {
  it('reads the admitted excerpt from its exact transcript message', async () => {
    const data = new Map<string, unknown>();
    const memento = {
      get: (key: string) => data.get(key),
      update: async (key: string, value: unknown) => {
        data.set(key, value);
      },
      keys: () => [...data.keys()],
    } as Memento;
    const typed = 'Review this selection';
    const selection = 'Example source line, as it was when sent';
    const message = `${typed}\n\n${selection}`;
    await rememberTypedText(memento, 'thread-1', 3, message, typed, [
      { label: 'notes.txt selection', kind: 'selection', text: selection },
    ]);

    expect(typedTextFor(memento, 'thread-1', 3, message)).toBe(typed);
    expect(sentContextFor(memento, 'thread-1', 3, message)).toEqual([
      { label: 'notes.txt selection', kind: 'selection', text: selection },
    ]);
    expect(sentContextFor(memento, 'thread-1', 3, `${typed}\n\nA later file edit`)).toBeUndefined();
    expect(sentContextFor(memento, 'thread-2', 3, message)).toBeUndefined();
    expect(JSON.stringify([...data.values()])).not.toContain(selection);
  });
});
