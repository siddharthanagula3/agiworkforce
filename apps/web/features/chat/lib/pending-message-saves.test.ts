import { describe, expect, it } from 'vitest';

import { savedMessageId, trackMessageSave } from './pending-message-saves';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('pending message saves', () => {
  it('answers at once for a message with no save in flight', async () => {
    await expect(savedMessageId('message-idle')).resolves.toBe('message-idle');
  });

  it('settles only once the save has, with the id the server kept', async () => {
    const save = deferred<{ id: string } | null>();
    trackMessageSave('message-local', save.promise);
    let settledWith: string | null = null;
    void savedMessageId('message-local').then((id) => {
      settledWith = id;
    });

    await Promise.resolve();
    expect(settledWith).toBeNull();

    save.resolve({ id: 'message-server' });
    await expect(savedMessageId('message-local')).resolves.toBe('message-server');
    expect(settledWith).toBe('message-server');
  });

  it('settles with the message id when the save failed', async () => {
    const save = deferred<{ id: string } | null>();
    trackMessageSave('message-failed', save.promise);

    save.reject(new Error('Failed to save message to DB: 503'));

    await expect(savedMessageId('message-failed')).resolves.toBe('message-failed');
  });

  it('forgets a save once it has settled', async () => {
    const save = deferred<{ id: string } | null>();
    trackMessageSave('message-done', save.promise);
    save.resolve({ id: 'message-done-server' });
    await savedMessageId('message-done');
    await Promise.resolve();

    await expect(savedMessageId('message-done')).resolves.toBe('message-done');
  });
});
