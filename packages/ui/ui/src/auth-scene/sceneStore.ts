import { SCENE_MOTION } from './sceneConfig';
import type { SceneAttention } from './scenePose';

export type SceneMood = 'neutral' | 'pending' | 'error' | 'success';

export interface SceneSnapshot {
  /** True while any privacy source is active. Nothing but the sources can clear it. */
  privacy: boolean;
  attention: SceneAttention;
  mood: SceneMood;
  pointer: boolean;
  relief: boolean;
}

/** What the form publishes: booleans, element references and a box, never field contents. */
export interface SceneBridge {
  setPrivacy(source: string, active: boolean): void;
  setFocusTarget(element: HTMLInputElement | null): void;
  /** A masked secret is being entered: only its box is known, never its caret. */
  watchBox(read: (() => DOMRect | null) | null, entered?: boolean): void;
  noteCaret(element: HTMLInputElement): void;
  setMood(mood: Exclude<SceneMood, 'success'>): void;
  celebrate(): void;
}

export interface SceneStore extends SceneBridge {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SceneSnapshot;
  readFocusTarget(): HTMLInputElement | null;
  readWatchedBox(): DOMRect | null;
  readLeaningIn(): boolean;
  readCaretVersion(): number;
  setPointer(active: boolean): void;
  dispose(): void;
}

const INITIAL: SceneSnapshot = {
  privacy: false,
  attention: 'free',
  mood: 'neutral',
  pointer: false,
  relief: false,
};

export const SCENE_SERVER_SNAPSHOT: SceneSnapshot = INITIAL;

export const NOOP_SCENE_BRIDGE: SceneBridge = {
  setPrivacy() {},
  setFocusTarget() {},
  watchBox() {},
  noteCaret() {},
  setMood() {},
  celebrate() {},
};

export function createSceneStore(): SceneStore {
  const sources = new Set<string>();
  const listeners = new Set<() => void>();
  let snapshot = INITIAL;
  let focusTarget: HTMLInputElement | null = null;
  let watched: (() => DOMRect | null) | null = null;
  let caretVersion = 0;
  let heldMood: Exclude<SceneMood, 'success'> = 'neutral';
  let successTimer: ReturnType<typeof setTimeout> | null = null;
  let reliefTimer: ReturnType<typeof setTimeout> | null = null;
  let leanInTimer: ReturnType<typeof setTimeout> | null = null;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const publish = (next: Partial<SceneSnapshot>) => {
    const merged = { ...snapshot, ...next };
    if (
      merged.privacy === snapshot.privacy &&
      merged.attention === snapshot.attention &&
      merged.mood === snapshot.mood &&
      merged.pointer === snapshot.pointer &&
      merged.relief === snapshot.relief
    ) {
      return;
    }
    snapshot = merged;
    notify();
  };

  const attention = (): SceneAttention => (watched ? 'masked' : focusTarget ? 'field' : 'free');

  const clearRelief = () => {
    if (reliefTimer !== null) clearTimeout(reliefTimer);
    reliefTimer = null;
  };

  const straightenUp = () => {
    if (leanInTimer === null) return;
    clearTimeout(leanInTimer);
    leanInTimer = null;
    notify();
  };

  const leanIn = () => {
    if (leanInTimer !== null) clearTimeout(leanInTimer);
    leanInTimer = setTimeout(() => {
      leanInTimer = null;
      notify();
    }, SCENE_MOTION.leanInHoldMs);
    notify();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    readFocusTarget() {
      return focusTarget;
    },
    readWatchedBox() {
      return watched ? watched() : null;
    },
    readLeaningIn() {
      return leanInTimer !== null;
    },
    readCaretVersion() {
      return caretVersion;
    },
    setPrivacy(source, active) {
      if (active) sources.add(source);
      else sources.delete(source);
      const privacy = sources.size > 0;
      if (privacy === snapshot.privacy) return;
      clearRelief();
      if (privacy) {
        straightenUp();
        publish({ privacy, relief: false });
        return;
      }
      publish({ privacy, relief: true });
      reliefTimer = setTimeout(() => {
        reliefTimer = null;
        publish({ relief: false });
      }, SCENE_MOTION.reliefHoldMs);
    },
    setFocusTarget(element) {
      focusTarget = element;
      caretVersion += 1;
      publish({ attention: attention() });
    },
    watchBox(read, entered = false) {
      watched = read;
      publish({ attention: attention() });
      if (!read) straightenUp();
      else if (entered && heldMood !== 'error' && !snapshot.privacy) leanIn();
    },
    noteCaret(element) {
      if (element !== focusTarget) return;
      caretVersion += 1;
      notify();
    },
    setMood(mood) {
      heldMood = mood;
      if (mood === 'error') straightenUp();
      if (successTimer !== null) return;
      publish({ mood });
    },
    celebrate() {
      if (successTimer !== null) clearTimeout(successTimer);
      publish({ mood: 'success' });
      successTimer = setTimeout(() => {
        successTimer = null;
        publish({ mood: heldMood });
      }, SCENE_MOTION.successHoldMs);
    },
    setPointer(active) {
      publish({ pointer: active });
    },
    dispose() {
      if (successTimer !== null) clearTimeout(successTimer);
      successTimer = null;
      clearRelief();
      if (leanInTimer !== null) clearTimeout(leanInTimer);
      leanInTimer = null;
      listeners.clear();
    },
  };
}
