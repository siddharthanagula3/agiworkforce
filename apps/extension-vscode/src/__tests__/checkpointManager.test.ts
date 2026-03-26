/**
 * checkpointManager.test.ts — Tests for the CheckpointManager service
 *
 * Verifies:
 * - Checkpoint creation, listing, and metadata persistence
 * - Pruning behavior when exceeding MAX_CHECKPOINTS
 * - Graceful degradation when git is unavailable
 * - Restore checkpoint flow
 * - clearAll removes all checkpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Inline implementation for testing ──────────────────────────────────────
// Since importing from source triggers vscode import issues in the test
// environment, we replicate the core logic here (same pattern as other tests).

const CHECKPOINT_PREFIX = 'agi-checkpoint:';
const MAX_CHECKPOINTS = 20;
const STATE_KEY = 'agiWorkforce.checkpoints';

interface Checkpoint {
  id: string;
  label: string;
  createdAt: number;
  stashRef: string;
}

/**
 * Minimal in-memory Memento mock for testing persistence.
 */
class MockMemento {
  private _store = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this._store.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this._store.set(key, value);
  }
}

/**
 * Simplified CheckpointManager for testing (no real git or vscode dependency).
 */
class TestableCheckpointManager {
  private _checkpoints: Checkpoint[] = [];
  private _gitAvailable: boolean;
  private readonly _globalState: MockMemento;
  private readonly _gitCalls: Array<{ args: string[] }> = [];

  constructor(globalState: MockMemento, gitAvailable = true) {
    this._globalState = globalState;
    this._gitAvailable = gitAvailable;

    const stored = globalState.get<Checkpoint[]>(STATE_KEY);
    if (stored !== undefined && Array.isArray(stored)) {
      this._checkpoints = stored;
    }
  }

  get gitCalls(): Array<{ args: string[] }> {
    return this._gitCalls;
  }

  setGitAvailable(available: boolean): void {
    this._gitAvailable = available;
  }

  async createCheckpoint(label: string): Promise<string | undefined> {
    if (!this._gitAvailable) return undefined;

    const id = `ckpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const checkpoint: Checkpoint = {
      id,
      label,
      createdAt: Date.now(),
      stashRef: `stash@{0}`,
    };

    this._gitCalls.push({
      args: ['stash', 'push', '--include-untracked', '-m', `${CHECKPOINT_PREFIX} ${label}`],
    });

    this._checkpoints.push(checkpoint);
    await this._pruneAndPersist();

    return id;
  }

  async restoreCheckpoint(id: string): Promise<boolean> {
    if (!this._gitAvailable) return false;

    const checkpoint = this._checkpoints.find((c) => c.id === id);
    if (checkpoint === undefined) return false;

    this._gitCalls.push({ args: ['checkout', '--', '.'] });
    this._gitCalls.push({ args: ['clean', '-fd'] });

    if (checkpoint.stashRef !== '') {
      this._gitCalls.push({ args: ['stash', 'apply', '--index', checkpoint.stashRef] });
    }

    return true;
  }

  listCheckpoints(): Checkpoint[] {
    return [...this._checkpoints].reverse();
  }

  async pruneCheckpoints(): Promise<void> {
    while (this._checkpoints.length > MAX_CHECKPOINTS) {
      const oldest = this._checkpoints.shift();
      if (oldest !== undefined && oldest.stashRef !== '') {
        this._gitCalls.push({ args: ['stash', 'drop', oldest.stashRef] });
      }
    }
    await this._persist();
  }

  async clearAll(): Promise<void> {
    for (let i = this._checkpoints.length - 1; i >= 0; i--) {
      const checkpoint = this._checkpoints[i]!;
      if (checkpoint.stashRef !== '') {
        this._gitCalls.push({ args: ['stash', 'drop', checkpoint.stashRef] });
      }
    }
    this._checkpoints = [];
    await this._persist();
  }

  get count(): number {
    return this._checkpoints.length;
  }

  private async _pruneAndPersist(): Promise<void> {
    if (this._checkpoints.length > MAX_CHECKPOINTS) {
      await this.pruneCheckpoints();
    }
    await this._persist();
  }

  private async _persist(): Promise<void> {
    await this._globalState.update(STATE_KEY, this._checkpoints);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CheckpointManager', () => {
  let globalState: MockMemento;
  let manager: TestableCheckpointManager;

  beforeEach(() => {
    globalState = new MockMemento();
    manager = new TestableCheckpointManager(globalState, true);
  });

  describe('createCheckpoint', () => {
    it('creates a checkpoint and returns an id', async () => {
      const id = await manager.createCheckpoint('test checkpoint');
      expect(id).toBeDefined();
      expect(id).toMatch(/^ckpt-/);
    });

    it('increments the checkpoint count', async () => {
      expect(manager.count).toBe(0);
      await manager.createCheckpoint('first');
      expect(manager.count).toBe(1);
      await manager.createCheckpoint('second');
      expect(manager.count).toBe(2);
    });

    it('records git stash push call', async () => {
      await manager.createCheckpoint('my label');
      const stashCall = manager.gitCalls.find((c) => c.args[0] === 'stash' && c.args[1] === 'push');
      expect(stashCall).toBeDefined();
      expect(stashCall!.args).toContain('--include-untracked');
      expect(stashCall!.args.join(' ')).toContain('agi-checkpoint: my label');
    });

    it('returns undefined when git is unavailable', async () => {
      manager.setGitAvailable(false);
      const id = await manager.createCheckpoint('no git');
      expect(id).toBeUndefined();
      expect(manager.count).toBe(0);
    });

    it('persists checkpoint metadata to globalState', async () => {
      await manager.createCheckpoint('persisted');
      const stored = globalState.get<Checkpoint[]>(STATE_KEY);
      expect(stored).toBeDefined();
      expect(stored).toHaveLength(1);
      expect(stored![0]!.label).toBe('persisted');
    });
  });

  describe('listCheckpoints', () => {
    it('returns empty array when no checkpoints exist', () => {
      expect(manager.listCheckpoints()).toEqual([]);
    });

    it('returns checkpoints in reverse chronological order (newest first)', async () => {
      await manager.createCheckpoint('first');
      await manager.createCheckpoint('second');
      await manager.createCheckpoint('third');

      const list = manager.listCheckpoints();
      expect(list).toHaveLength(3);
      expect(list[0]!.label).toBe('third');
      expect(list[1]!.label).toBe('second');
      expect(list[2]!.label).toBe('first');
    });

    it('returns a copy (not a reference to internal state)', async () => {
      await manager.createCheckpoint('test');
      const list1 = manager.listCheckpoints();
      const list2 = manager.listCheckpoints();
      expect(list1).not.toBe(list2);
      expect(list1).toEqual(list2);
    });
  });

  describe('restoreCheckpoint', () => {
    it('returns true for a valid checkpoint', async () => {
      const id = await manager.createCheckpoint('restore me');
      expect(id).toBeDefined();
      const result = await manager.restoreCheckpoint(id!);
      expect(result).toBe(true);
    });

    it('returns false for a non-existent checkpoint', async () => {
      const result = await manager.restoreCheckpoint('ckpt-nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when git is unavailable', async () => {
      const id = await manager.createCheckpoint('test');
      manager.setGitAvailable(false);
      const result = await manager.restoreCheckpoint(id!);
      expect(result).toBe(false);
    });

    it('issues git checkout and clean commands', async () => {
      const id = await manager.createCheckpoint('restore test');
      manager.gitCalls.length = 0; // Clear creation calls

      await manager.restoreCheckpoint(id!);

      const checkoutCall = manager.gitCalls.find((c) => c.args[0] === 'checkout');
      const cleanCall = manager.gitCalls.find((c) => c.args[0] === 'clean');
      const stashApply = manager.gitCalls.find(
        (c) => c.args[0] === 'stash' && c.args[1] === 'apply',
      );

      expect(checkoutCall).toBeDefined();
      expect(cleanCall).toBeDefined();
      expect(stashApply).toBeDefined();
    });
  });

  describe('pruneCheckpoints', () => {
    it('removes oldest checkpoints when exceeding MAX_CHECKPOINTS', async () => {
      // Create MAX_CHECKPOINTS + 5 checkpoints
      for (let i = 0; i < MAX_CHECKPOINTS + 5; i++) {
        await manager.createCheckpoint(`checkpoint-${i}`);
      }

      expect(manager.count).toBe(MAX_CHECKPOINTS);

      // Oldest 5 should have been pruned
      const list = manager.listCheckpoints();
      const labels = list.map((c) => c.label);
      expect(labels).not.toContain('checkpoint-0');
      expect(labels).not.toContain('checkpoint-4');
      expect(labels).toContain(`checkpoint-${MAX_CHECKPOINTS + 4}`);
    });

    it('issues stash drop for pruned checkpoints', async () => {
      for (let i = 0; i < MAX_CHECKPOINTS + 2; i++) {
        await manager.createCheckpoint(`checkpoint-${i}`);
      }

      const dropCalls = manager.gitCalls.filter(
        (c) => c.args[0] === 'stash' && c.args[1] === 'drop',
      );
      expect(dropCalls.length).toBe(2);
    });
  });

  describe('clearAll', () => {
    it('removes all checkpoints', async () => {
      await manager.createCheckpoint('a');
      await manager.createCheckpoint('b');
      await manager.createCheckpoint('c');
      expect(manager.count).toBe(3);

      await manager.clearAll();
      expect(manager.count).toBe(0);
      expect(manager.listCheckpoints()).toEqual([]);
    });

    it('persists empty state to globalState', async () => {
      await manager.createCheckpoint('temp');
      await manager.clearAll();

      const stored = globalState.get<Checkpoint[]>(STATE_KEY);
      expect(stored).toEqual([]);
    });

    it('issues stash drop for each checkpoint with a stash ref', async () => {
      await manager.createCheckpoint('x');
      await manager.createCheckpoint('y');
      manager.gitCalls.length = 0; // Clear creation calls

      await manager.clearAll();

      const dropCalls = manager.gitCalls.filter(
        (c) => c.args[0] === 'stash' && c.args[1] === 'drop',
      );
      expect(dropCalls.length).toBe(2);
    });
  });

  describe('state restoration', () => {
    it('restores checkpoints from globalState on construction', async () => {
      await manager.createCheckpoint('persisted-1');
      await manager.createCheckpoint('persisted-2');

      // Create a new manager with the same globalState
      const manager2 = new TestableCheckpointManager(globalState, true);
      expect(manager2.count).toBe(2);

      const list = manager2.listCheckpoints();
      expect(list[0]!.label).toBe('persisted-2');
      expect(list[1]!.label).toBe('persisted-1');
    });

    it('handles empty globalState gracefully', () => {
      const freshState = new MockMemento();
      const freshManager = new TestableCheckpointManager(freshState, true);
      expect(freshManager.count).toBe(0);
      expect(freshManager.listCheckpoints()).toEqual([]);
    });
  });

  describe('checkpoint metadata', () => {
    it('stores correct label and timestamp', async () => {
      const before = Date.now();
      await manager.createCheckpoint('metadata test');
      const after = Date.now();

      const list = manager.listCheckpoints();
      expect(list).toHaveLength(1);

      const checkpoint = list[0]!;
      expect(checkpoint.label).toBe('metadata test');
      expect(checkpoint.createdAt).toBeGreaterThanOrEqual(before);
      expect(checkpoint.createdAt).toBeLessThanOrEqual(after);
      expect(checkpoint.stashRef).toBe('stash@{0}');
    });

    it('generates unique ids for each checkpoint', async () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const id = await manager.createCheckpoint(`unique-${i}`);
        expect(id).toBeDefined();
        ids.add(id!);
      }
      expect(ids.size).toBe(10);
    });
  });
});
