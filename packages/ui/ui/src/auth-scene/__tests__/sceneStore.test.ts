import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SCENE_MOTION } from '../sceneConfig';
import { createSceneStore } from '../sceneStore';

describe('the scene store keeps privacy as an override nothing else can undo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays private until every source that asked for it has let go', () => {
    const store = createSceneStore();

    store.setPrivacy('field', true);
    store.setPrivacy('reveal', true);
    expect(store.getSnapshot().privacy).toBe(true);

    store.setPrivacy('field', false);
    expect(store.getSnapshot().privacy).toBe(true);

    store.setPrivacy('reveal', false);
    expect(store.getSnapshot().privacy).toBe(false);
  });

  it('ignores a stale release from a source that never asked', () => {
    const store = createSceneStore();

    store.setPrivacy('field', true);
    store.setPrivacy('blink', false);
    store.setPrivacy('pointer', false);

    expect(store.getSnapshot().privacy).toBe(true);
  });

  it('lets mood, attention, the pointer and celebration change without touching privacy', () => {
    const store = createSceneStore();
    store.setPrivacy('field', true);

    store.setMood('pending');
    store.setMood('error');
    store.celebrate();
    store.setFocusTarget(document.createElement('input'));
    store.setFocusTarget(null);
    store.watchBox(() => null);
    store.watchBox(null);
    store.setPointer(true);
    vi.advanceTimersByTime(SCENE_MOTION.successHoldMs + 1);

    expect(store.getSnapshot().privacy).toBe(true);
  });

  it('notifies subscribers once per real change', () => {
    const store = createSceneStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setPrivacy('a', true);
    store.setPrivacy('b', true);
    store.setPrivacy('a', false);
    store.setPrivacy('b', false);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('marks the moment a secret is hidden again, then lets it pass', () => {
    const store = createSceneStore();

    store.setPrivacy('reveal', true);
    expect(store.getSnapshot().relief).toBe(false);

    store.setPrivacy('reveal', false);
    expect(store.getSnapshot().relief).toBe(true);

    vi.advanceTimersByTime(SCENE_MOTION.reliefHoldMs + 1);
    expect(store.getSnapshot().relief).toBe(false);
  });

  it('drops the relief the moment a secret is readable again', () => {
    const store = createSceneStore();
    store.setPrivacy('reveal', true);
    store.setPrivacy('reveal', false);
    expect(store.getSnapshot().relief).toBe(true);

    store.setPrivacy('reveal', true);
    expect(store.getSnapshot().relief).toBe(false);
    vi.advanceTimersByTime(SCENE_MOTION.reliefHoldMs + 1);
    expect(store.getSnapshot().relief).toBe(false);
  });
});

describe('the scene store holds a success for its moment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the success through the idle phase that follows it, then settles on the latest mood', () => {
    const store = createSceneStore();
    store.setMood('pending');

    store.celebrate();
    store.setMood('neutral');
    expect(store.getSnapshot().mood).toBe('success');

    vi.advanceTimersByTime(SCENE_MOTION.successHoldMs + 1);
    expect(store.getSnapshot().mood).toBe('neutral');
  });

  it('only counts a caret move on the field that holds attention', () => {
    const store = createSceneStore();
    const field = document.createElement('input');
    const other = document.createElement('input');

    store.setFocusTarget(field);
    const before = store.readCaretVersion();
    store.noteCaret(other);
    expect(store.readCaretVersion()).toBe(before);
    store.noteCaret(field);
    expect(store.readCaretVersion()).toBe(before + 1);
    expect(store.getSnapshot().attention).toBe('field');
  });
});

describe('the scene store knows a masked secret only by its box', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1000 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a watched box as masked attention, read fresh each time', () => {
    const store = createSceneStore();
    const box = { left: 10, top: 20, width: 30, height: 40 } as DOMRect;
    const read = vi.fn(() => box);

    store.watchBox(read);
    expect(store.getSnapshot().attention).toBe('masked');
    expect(store.readWatchedBox()).toBe(box);
    expect(store.readWatchedBox()).toBe(box);
    expect(read).toHaveBeenCalledTimes(2);

    store.watchBox(null);
    expect(store.getSnapshot().attention).toBe('free');
    expect(store.readWatchedBox()).toBeNull();
  });

  it('lets a masked field outrank a field whose caret it would otherwise follow', () => {
    const store = createSceneStore();

    store.setFocusTarget(document.createElement('input'));
    store.watchBox(() => null);
    expect(store.getSnapshot().attention).toBe('masked');

    store.watchBox(null);
    expect(store.getSnapshot().attention).toBe('field');
  });
});

describe('the scene store leans in only when a person comes to a masked field', () => {
  const read = () => null;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('leans in for its hold when focus enters the field, then straightens while still watching', () => {
    const store = createSceneStore();

    store.watchBox(read, true);
    expect(store.readLeaningIn()).toBe(true);

    vi.advanceTimersByTime(SCENE_MOTION.leanInHoldMs - 1);
    expect(store.readLeaningIn()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(store.readLeaningIn()).toBe(false);
    expect(store.getSnapshot().attention).toBe('masked');
  });

  it('does not lean in for a watch nobody entered, as when a shown secret is hidden again', () => {
    const store = createSceneStore();
    store.watchBox(read, true);
    vi.advanceTimersByTime(SCENE_MOTION.leanInHoldMs);

    store.watchBox(null);
    store.setPrivacy('reveal', true);
    store.setPrivacy('reveal', false);
    store.watchBox(read);

    expect(store.getSnapshot().attention).toBe('masked');
    expect(store.readLeaningIn()).toBe(false);
  });

  it('straightens the moment the secret is about to be readable, and does not lean back in after', () => {
    const store = createSceneStore();
    store.watchBox(read, true);

    store.setPrivacy('toggle', true);
    expect(store.readLeaningIn()).toBe(false);

    store.setPrivacy('toggle', false);
    expect(store.readLeaningIn()).toBe(false);
  });

  it('does not lean in for an entry made while a secret is readable', () => {
    const store = createSceneStore();
    store.setPrivacy('toggle', true);

    store.watchBox(read, true);

    expect(store.readLeaningIn()).toBe(false);
  });

  it('does not lean in while an attempt stands refused', () => {
    const store = createSceneStore();
    store.setMood('error');

    store.watchBox(read, true);

    expect(store.readLeaningIn()).toBe(false);
  });

  it('straightens when an attempt is refused in the middle of leaning in', () => {
    const store = createSceneStore();
    store.watchBox(read, true);

    store.setMood('error');

    expect(store.readLeaningIn()).toBe(false);
  });

  it('straightens when the field is left, with nothing late to undo', () => {
    const store = createSceneStore();
    store.watchBox(read, true);

    store.watchBox(null);
    expect(store.readLeaningIn()).toBe(false);

    store.watchBox(read);
    vi.advanceTimersByTime(SCENE_MOTION.leanInHoldMs + 1);
    expect(store.readLeaningIn()).toBe(false);
  });

  it('is not cut short by the same field reporting its watch again', () => {
    const store = createSceneStore();
    store.watchBox(read, true);

    store.watchBox(read);

    expect(store.readLeaningIn()).toBe(true);
  });

  it('tells subscribers when the lean-in starts and once when it ends', () => {
    const store = createSceneStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.watchBox(read, true);
    expect(listener).toHaveBeenCalled();
    listener.mockClear();

    vi.advanceTimersByTime(SCENE_MOTION.leanInHoldMs);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('leaves privacy alone', () => {
    const store = createSceneStore();
    store.setPrivacy('reveal', true);

    store.watchBox(read, true);
    store.watchBox(null);
    vi.advanceTimersByTime(SCENE_MOTION.leanInHoldMs + 1);

    expect(store.getSnapshot().privacy).toBe(true);
  });
});
