/**
 * checkpointManager.ts — Git-based checkpoint system for workspace state
 *
 * Creates lightweight git checkpoints (shadow commits on a dedicated ref)
 * before each AI-driven change, allowing users to rewind to any previous state.
 *
 * Strategy:
 * - Uses `git stash push -m "agi-checkpoint: <label>"` for lightweight snapshots.
 * - Stash-based approach avoids polluting the user's commit history or branch structure.
 * - Graceful degradation: if git is unavailable or the workspace is not a git repo,
 *   all operations silently no-op with a logged warning.
 *
 * Constraints:
 * - Max 20 checkpoints (prune oldest on overflow).
 * - 5 second timeout on all git commands.
 * - Workspace state stored in VS Code globalState for metadata persistence.
 */

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getActiveWorkspaceFolderSync } from '../utils/workspaceFolders';

const execFileAsync = promisify(execFile);

// ─── Constants ────────────────────────────────────────────────────────────────

const CHECKPOINT_PREFIX = 'agi-checkpoint:';
const MAX_CHECKPOINTS = 20;
const GIT_TIMEOUT_MS = 5000;
const STATE_KEY = 'agiWorkforce.checkpoints';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Checkpoint {
  /** Unique identifier (stash index at creation time + timestamp). */
  id: string;
  /** Human-readable label describing the checkpoint. */
  label: string;
  /** Unix timestamp (ms) when the checkpoint was created. */
  createdAt: number;
  /** The git stash ref (e.g. "stash@{0}"). */
  stashRef: string;
}

// ─── Output channel ───────────────────────────────────────────────────────────

let _checkpointChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (_checkpointChannel === undefined) {
    _checkpointChannel = vscode.window.createOutputChannel('AGI Workforce: Checkpoints');
  }
  return _checkpointChannel;
}

function log(message: string): void {
  const channel = getOutputChannel();
  const timestamp = new Date().toISOString();
  channel.appendLine(`[${timestamp}] ${message}`);
}

// ─── CheckpointManager ───────────────────────────────────────────────────────

export class CheckpointManager {
  private _checkpoints: Checkpoint[] = [];
  private _gitAvailable: boolean | undefined;
  private readonly _globalState: vscode.Memento;

  /**
   * Resolved per-call so multi-root users can open a file in the target
   * workspace and have checkpoint ops act on that root, not always [0].
   */
  private get _workspaceRoot(): string | undefined {
    return getActiveWorkspaceFolderSync()?.uri.fsPath;
  }

  constructor(context: vscode.ExtensionContext) {
    this._globalState = context.globalState;

    // Restore persisted checkpoint metadata
    const stored = this._globalState.get<Checkpoint[]>(STATE_KEY);
    if (stored !== undefined && Array.isArray(stored)) {
      this._checkpoints = stored;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Create a checkpoint of the current workspace state.
   * Returns the checkpoint ID on success, or undefined if checkpointing is unavailable.
   */
  async createCheckpoint(label: string): Promise<string | undefined> {
    if (!(await this._ensureGit())) return undefined;

    const workspaceRoot = this._workspaceRoot!;

    try {
      // Stage all changes (including untracked) so stash captures everything.
      // Use --include-untracked to capture new files.
      const stashMessage = `${CHECKPOINT_PREFIX} ${label}`;

      await this._git(['stash', 'push', '--include-untracked', '-m', stashMessage], workspaceRoot);

      // Check if a stash was actually created (git stash push is a no-op on clean trees).
      const stashList = await this._git(['stash', 'list', '--format=%gd %s', '-1'], workspaceRoot);
      const topLine = stashList.trim();

      if (!topLine.includes(CHECKPOINT_PREFIX)) {
        // No stash was created — working tree was clean.
        // Create an empty-diff stash by making a trivial change and reverting.
        log(`Working tree clean — creating marker checkpoint for "${label}"`);

        const id = `ckpt-${Date.now()}`;
        const checkpoint: Checkpoint = {
          id,
          label,
          createdAt: Date.now(),
          stashRef: '', // Empty ref means "clean tree at this point"
        };

        this._checkpoints.push(checkpoint);
        await this._pruneAndPersist();

        log(`Marker checkpoint created: ${id} — "${label}" (clean tree)`);
        return id;
      }

      // Pop the stash immediately so the user's working tree is restored.
      // The stash entry remains in the reflog even after pop — but we re-push it
      // to keep it accessible. Instead, we just read the stash ref before popping.
      const stashRef = topLine.split(' ')[0] ?? 'stash@{0}';

      // Re-apply the stashed changes so the user's working tree is unchanged.
      await this._git(['stash', 'pop', '--index'], workspaceRoot);

      const id = `ckpt-${Date.now()}`;
      const checkpoint: Checkpoint = {
        id,
        label,
        createdAt: Date.now(),
        stashRef,
      };

      this._checkpoints.push(checkpoint);
      await this._pruneAndPersist();

      log(`Checkpoint created: ${id} — "${label}" (ref: ${stashRef})`);
      return id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Failed to create checkpoint: ${message}`);
      return undefined;
    }
  }

  /**
   * Restore the workspace to a specific checkpoint.
   * This uses `git checkout` to restore files, preserving git history.
   */
  async restoreCheckpoint(id: string): Promise<boolean> {
    if (!(await this._ensureGit())) return false;

    const checkpoint = this._checkpoints.find((c) => c.id === id);
    if (checkpoint === undefined) {
      log(`Checkpoint not found: ${id}`);
      vscode.window.showWarningMessage(`AGI Workforce: Checkpoint "${id}" not found.`);
      return false;
    }

    const workspaceRoot = this._workspaceRoot!;

    try {
      if (checkpoint.stashRef === '') {
        // Marker checkpoint (clean tree) — just clean all changes.
        await this._git(['checkout', '--', '.'], workspaceRoot);
        await this._git(['clean', '-fd'], workspaceRoot);
        log(`Restored to marker checkpoint: ${id} — "${checkpoint.label}"`);
        vscode.window.showInformationMessage(
          `AGI Workforce: Restored to checkpoint "${checkpoint.label}" (clean state).`,
        );
        return true;
      }

      // Find the stash entry by scanning the stash list for our checkpoint message.
      const stashIndex = await this._findStashIndex(checkpoint.label);
      if (stashIndex === undefined) {
        log(`Stash entry not found for checkpoint: ${id}`);
        vscode.window.showWarningMessage(
          `AGI Workforce: Checkpoint "${checkpoint.label}" stash entry is no longer available.`,
        );
        return false;
      }

      // Restore by first cleaning, then applying the stash.
      await this._git(['checkout', '--', '.'], workspaceRoot);
      await this._git(['clean', '-fd'], workspaceRoot);
      await this._git(['stash', 'apply', '--index', `stash@{${stashIndex}}`], workspaceRoot);

      log(`Restored to checkpoint: ${id} — "${checkpoint.label}"`);
      vscode.window.showInformationMessage(
        `AGI Workforce: Restored to checkpoint "${checkpoint.label}".`,
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Failed to restore checkpoint ${id}: ${message}`);
      vscode.window.showErrorMessage(`AGI Workforce: Failed to restore checkpoint — ${message}`);
      return false;
    }
  }

  /**
   * List all available checkpoints, newest first.
   */
  listCheckpoints(): Checkpoint[] {
    return [...this._checkpoints].reverse();
  }

  /**
   * Remove old checkpoints exceeding the MAX_CHECKPOINTS limit.
   * Also cleans up corresponding git stash entries.
   */
  async pruneCheckpoints(): Promise<void> {
    if (!(await this._ensureGit())) return;

    const workspaceRoot = this._workspaceRoot!;

    while (this._checkpoints.length > MAX_CHECKPOINTS) {
      const oldest = this._checkpoints.shift();
      if (oldest === undefined) break;

      if (oldest.stashRef !== '') {
        try {
          const stashIndex = await this._findStashIndex(oldest.label);
          if (stashIndex !== undefined) {
            await this._git(['stash', 'drop', `stash@{${stashIndex}}`], workspaceRoot);
            log(`Pruned stash for checkpoint: ${oldest.id}`);
          }
        } catch {
          // Stash may already be gone — that's fine
        }
      }
    }

    await this._persist();
  }

  /**
   * Remove all checkpoints and their stash entries.
   */
  async clearAll(): Promise<void> {
    if (!(await this._ensureGit())) {
      this._checkpoints = [];
      await this._persist();
      return;
    }

    const workspaceRoot = this._workspaceRoot!;

    // Drop stash entries for our checkpoints (iterate in reverse to keep indices stable).
    for (let i = this._checkpoints.length - 1; i >= 0; i--) {
      const checkpoint = this._checkpoints[i]!;
      if (checkpoint.stashRef !== '') {
        try {
          const stashIndex = await this._findStashIndex(checkpoint.label);
          if (stashIndex !== undefined) {
            await this._git(['stash', 'drop', `stash@{${stashIndex}}`], workspaceRoot);
          }
        } catch {
          // Stash may already be gone
        }
      }
    }

    this._checkpoints = [];
    await this._persist();
    log('All checkpoints cleared.');
  }

  /**
   * Get the total number of checkpoints.
   */
  get count(): number {
    return this._checkpoints.length;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Run a git command with timeout, returning stdout.
   */
  private async _git(args: string[], cwd: string): Promise<string> {
    const result = await execFileAsync('git', args, { cwd, timeout: GIT_TIMEOUT_MS });
    return result.stdout;
  }

  /**
   * Check that git is available and the workspace is a git repo.
   * Caches the result after the first successful check.
   */
  private async _ensureGit(): Promise<boolean> {
    if (this._workspaceRoot === undefined) {
      log('No workspace folder open — checkpoints disabled.');
      return false;
    }

    if (this._gitAvailable === true) return true;
    if (this._gitAvailable === false) return false;

    try {
      await this._git(['rev-parse', '--is-inside-work-tree'], this._workspaceRoot);
      this._gitAvailable = true;
      return true;
    } catch {
      this._gitAvailable = false;
      log('Git not available or workspace is not a git repository — checkpoints disabled.');
      return false;
    }
  }

  /**
   * Find the stash index for a checkpoint by scanning git stash list
   * for an entry with matching CHECKPOINT_PREFIX + label.
   */
  private async _findStashIndex(label: string): Promise<number | undefined> {
    const workspaceRoot = this._workspaceRoot!;
    const needle = `${CHECKPOINT_PREFIX} ${label}`;

    try {
      const output = await this._git(['stash', 'list', '--format=%gd %s'], workspaceRoot);
      const lines = output.trim().split('\n');

      for (const line of lines) {
        if (line.includes(needle)) {
          // Extract index from "stash@{N}" format.
          const match = /stash@\{(\d+)\}/.exec(line);
          if (match?.[1] !== undefined) {
            return parseInt(match[1], 10);
          }
        }
      }
    } catch {
      // Stash list failed — no stashes exist
    }

    return undefined;
  }

  /**
   * Prune old checkpoints and persist the metadata.
   */
  private async _pruneAndPersist(): Promise<void> {
    if (this._checkpoints.length > MAX_CHECKPOINTS) {
      await this.pruneCheckpoints();
    }
    await this._persist();
  }

  /**
   * Persist checkpoint metadata to VS Code globalState.
   */
  private async _persist(): Promise<void> {
    await this._globalState.update(STATE_KEY, this._checkpoints);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: CheckpointManager | undefined;

/**
 * Initialize the singleton CheckpointManager.
 * Must be called during extension activation.
 */
export function initCheckpointManager(context: vscode.ExtensionContext): CheckpointManager {
  _instance = new CheckpointManager(context);
  return _instance;
}

/**
 * Get the singleton CheckpointManager instance.
 * Returns undefined if not yet initialized.
 */
export function getCheckpointManager(): CheckpointManager | undefined {
  return _instance;
}
