import { describe, expect, it } from 'vitest';
import { createComposerDraftStorage } from './composer-draft-storage';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('per-document crash copies', () => {
  it('does not let one tab clear the other tab’s unsent text', () => {
    const sharedLocalStorage = memoryStorage();
    const firstTab = createComposerDraftStorage(sharedLocalStorage, 'first-tab', []);
    const secondTab = createComposerDraftStorage(sharedLocalStorage, 'second-tab', []);

    expect(firstTab.write('conv-1', 'first unsent text')).toBe(true);
    expect(secondTab.write('conv-1', 'second unsent text')).toBe(true);
    firstTab.clear('conv-1');

    expect(firstTab.read('conv-1')).toBe('');
    expect(secondTab.read('conv-1')).toBe('second unsent text');
  });

  it('copies a prior document’s crash text to a fresh owner on reload', () => {
    const sharedLocalStorage = memoryStorage();
    const beforeReload = createComposerDraftStorage(sharedLocalStorage, 'before-reload', []);
    expect(beforeReload.write('conv-1', 'recover me')).toBe(true);

    const afterReload = createComposerDraftStorage(sharedLocalStorage, 'after-reload', [
      'before-reload',
    ]);
    expect(afterReload.read('conv-1')).toBe('recover me');
    afterReload.clear('conv-1');

    const nextReload = createComposerDraftStorage(sharedLocalStorage, 'next-reload', [
      'after-reload',
    ]);
    expect(nextReload.read('conv-1')).toBe('');
  });

  it('carries drafts for conversations not opened during an intermediate reload', () => {
    const sharedLocalStorage = memoryStorage();
    const first = createComposerDraftStorage(sharedLocalStorage, 'first', []);
    expect(first.write('conv-1', 'first conversation')).toBe(true);
    expect(first.write('conv-2', 'second conversation')).toBe(true);

    const second = createComposerDraftStorage(sharedLocalStorage, 'second', ['first'], true);
    expect(second.read('conv-1')).toBe('first conversation');
    const third = createComposerDraftStorage(sharedLocalStorage, 'third', ['second'], true);

    expect(third.read('conv-2')).toBe('second conversation');
  });

  it('keeps a duplicated tab’s copy separate from later original-tab edits', () => {
    const sharedLocalStorage = memoryStorage();
    const original = createComposerDraftStorage(sharedLocalStorage, 'original', []);
    expect(original.write('conv-1', 'before duplicate')).toBe(true);

    const duplicate = createComposerDraftStorage(sharedLocalStorage, 'duplicate', ['original']);
    expect(duplicate.read('conv-1')).toBe('before duplicate');
    expect(original.write('conv-1', 'original later')).toBe(true);

    expect(duplicate.read('conv-1')).toBe('before duplicate');
    expect(original.read('conv-1')).toBe('original later');
  });

  it('retires the previous document’s key after a reload has copied it', () => {
    const sharedLocalStorage = memoryStorage();
    const beforeReload = createComposerDraftStorage(sharedLocalStorage, 'before', []);
    expect(beforeReload.write('conv-1', 'keep me')).toBe(true);

    const afterReload = createComposerDraftStorage(sharedLocalStorage, 'after', ['before'], true);

    expect(afterReload.read('conv-1')).toBe('keep me');
    expect(
      [...Array(sharedLocalStorage.length).keys()]
        .map((index) => sharedLocalStorage.key(index))
        .some((key) => key?.includes(':before:')),
    ).toBe(false);
  });

  it('migrates an earlier shared crash copy before removing its legacy key', () => {
    const sharedLocalStorage = memoryStorage();
    sharedLocalStorage.setItem(
      'agi-composer-draft:v1:conv-1',
      JSON.stringify({ version: 1, text: 'legacy unsent text' }),
    );
    const current = createComposerDraftStorage(sharedLocalStorage, 'current', []);

    expect(current.read('conv-1')).toBe('legacy unsent text');
    expect(sharedLocalStorage.getItem('agi-composer-draft:v1:conv-1')).toBeNull();
    expect(current.read('conv-1')).toBe('legacy unsent text');
  });

  it('does not resurrect an older copy when the current record is corrupt', () => {
    const sharedLocalStorage = memoryStorage();
    const previous = createComposerDraftStorage(sharedLocalStorage, 'previous', []);
    expect(previous.write('conv-1', 'stale text')).toBe(true);
    const current = createComposerDraftStorage(sharedLocalStorage, 'current', ['previous']);
    sharedLocalStorage.setItem('agi-composer-draft:v2:current:conv-1', '{not json');

    expect(current.read('conv-1')).toBe('');
  });
});
