import { describe, expect, it, vi } from 'vitest';
import { createChatRequestSettlements } from './chat-request-settlement';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe('chat request settlement ownership', () => {
  it('retains stopped partial settlement until a successor claims the conversation', () => {
    const controllers = new Map<string, AbortController>();
    const requests = createChatRequestSettlements(controllers);
    const stopped = requests.begin('conversation', 'assistant');
    controllers.delete('conversation');
    stopped.controller.abort();

    expect(stopped.isCurrent()).toBe(true);
    expect(() => stopped.assertCurrent()).not.toThrow();

    const successor = requests.begin('conversation', 'assistant');
    expect(stopped.isCurrent()).toBe(false);
    expect(() => stopped.assertCurrent()).toThrow(expect.objectContaining({ name: 'AbortError' }));
    stopped.finish();
    expect(controllers.get('conversation')).toBe(successor.controller);
    expect(successor.isCurrent()).toBe(true);
    successor.finish();
  });

  it('retains ownership through the complete asynchronous receipt reconciliation chain', async () => {
    const controllers = new Map<string, AbortController>();
    const request = createChatRequestSettlements(controllers).begin('conversation', 'assistant');
    const receipt = deferred<string>();
    const reconciliation = deferred<void>();
    const reconcileStarted = deferred<void>();
    const released = vi.fn();
    request.onRelease(released);
    const work = request.track(receipt.promise.then(async () => {
      expect(request.isCurrent()).toBe(true);
      reconcileStarted.resolve();
      await reconciliation.promise;
      expect(request.isCurrent()).toBe(true);
    }));

    request.finish();
    expect(controllers.has('conversation')).toBe(false);
    expect(request.isCurrent()).toBe(true);
    receipt.resolve('saved-message');
    await reconcileStarted.promise;
    expect(released).not.toHaveBeenCalled();
    reconciliation.resolve();
    await work;
    expect(released).toHaveBeenCalledTimes(1);
    expect(request.isCurrent()).toBe(false);
  });

  it('releases an old save without releasing the replacement request', async () => {
    const controllers = new Map<string, AbortController>();
    const requests = createChatRequestSettlements(controllers);
    const first = requests.begin('conversation', 'assistant');
    const receipt = deferred<void>();
    const work = first.track(receipt.promise);
    first.finish();
    const next = requests.begin('conversation', 'assistant');
    receipt.resolve();
    await work;

    expect(first.isCurrent()).toBe(false);
    expect(next.isCurrent()).toBe(true);
    expect(controllers.get('conversation')).toBe(next.controller);
    next.finish();
  });

  it('moves pending ownership to a persisted conversation without owning another conversation', () => {
    const controllers = new Map<string, AbortController>();
    const requests = createChatRequestSettlements(controllers);
    const other = requests.begin('other', 'assistant');
    const request = requests.begin('draft', 'assistant');
    request.move('persisted');

    expect(request.conversationId).toBe('persisted');
    expect(controllers.has('draft')).toBe(false);
    expect(controllers.get('persisted')).toBe(request.controller);
    expect(other.isCurrent()).toBe(true);
    const next = requests.begin('persisted', 'assistant');
    request.finish();
    expect(controllers.get('persisted')).toBe(next.controller);
    expect(other.isCurrent()).toBe(true);
    next.finish();
    other.finish();
  });

  it('invalidates active requests on runtime disposal', () => {
    const controllers = new Map<string, AbortController>();
    const requests = createChatRequestSettlements(controllers);
    const first = requests.begin('first', 'assistant');
    const second = requests.begin('second', 'assistant');
    requests.dispose();

    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(false);
    expect(first.controller.signal.aborted).toBe(true);
    expect(second.controller.signal.aborted).toBe(true);
    first.finish();
    second.finish();
    expect(controllers.size).toBe(0);
  });

  it('preserves different-row writers and never reacquires a superseded row', () => {
    const requests = createChatRequestSettlements(new Map());
    const first = requests.begin('conversation', 'assistant');
    const writeAssistant = first.claimMessageWrite('assistant');
    const writeUser = first.claimMessageWrite('user');
    const different = requests.begin('conversation', 'different-assistant');
    expect(first.isCurrent()).toBe(false);
    expect(writeAssistant).not.toThrow();
    expect(writeUser).not.toThrow();

    const replacement = requests.begin('conversation', 'assistant');
    expect(writeAssistant).toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(writeUser).not.toThrow();
    replacement.finish();
    expect(first.claimMessageWrite('assistant')).toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(() => first.claimMessageWrite('unowned-user')).toThrow(expect.objectContaining({ name: 'AbortError' }));
    first.finish();
    different.finish();
  });

  it('invalidates observation leases without letting observation claim transport', () => {
    const controllers = new Map<string, AbortController>();
    const onBegin = vi.fn();
    const requests = createChatRequestSettlements(controllers, onBegin);
    const observation = requests.observe('conversation');
    expect(controllers.size).toBe(0);
    expect(onBegin).not.toHaveBeenCalled();
    const request = requests.begin('conversation', 'assistant');
    expect(observation.isCurrent()).toBe(false);
    observation.release();
    expect(controllers.get('conversation')).toBe(request.controller);

    const origin = requests.observe('conversation');
    const destination = requests.observe('persisted');
    request.move('persisted');
    expect(origin.isCurrent()).toBe(false);
    expect(destination.isCurrent()).toBe(false);
    const latest = requests.observe('persisted');
    origin.release();
    destination.release();
    expect(latest.isCurrent()).toBe(true);
    requests.dispose();
    expect(latest.isCurrent()).toBe(false);
    latest.release();
    request.finish();
  });
});
