import path from 'node:path';
import type * as vscode from 'vscode';

const WORKSPACE_CONSENT_KEY = 'agiWorkforce.workspaceConsentAtMs.v1';

type ConsentRecord = Readonly<Record<string, number>>;

function folderKey(folder: string): string {
  const resolved = path.resolve(folder);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * VS Code workspace trust is the user's review of a folder before AGI reads it,
 * runs commands or loads its project settings. The AGI CLI asks for the same
 * decision with a timestamp, so the first time a trusted folder is seen, and
 * again whenever trust is granted, that moment is recorded and forwarded as the
 * folder's consent. An untrusted folder forwards nothing and the CLI refuses it.
 */
export class WorkspaceConsentStore {
  constructor(
    private readonly state: vscode.Memento,
    private readonly isTrusted: () => boolean,
    private readonly now: () => number = Date.now,
  ) {}

  consentAtMs(folder: string): number | undefined {
    if (!this.isTrusted()) return undefined;
    const key = folderKey(folder);
    const recorded = this.records()[key];
    if (recorded !== undefined) return recorded;
    const decidedAt = this.now();
    void this.state.update(WORKSPACE_CONSENT_KEY, { ...this.records(), [key]: decidedAt });
    return decidedAt;
  }

  async recordGrant(folders: readonly string[]): Promise<void> {
    if (!this.isTrusted() || folders.length === 0) return;
    const decidedAt = this.now();
    const next: Record<string, number> = { ...this.records() };
    for (const folder of folders) next[folderKey(folder)] = decidedAt;
    await this.state.update(WORKSPACE_CONSENT_KEY, next);
  }

  private records(): ConsentRecord {
    const stored = this.state.get<unknown>(WORKSPACE_CONSENT_KEY);
    if (stored === null || typeof stored !== 'object') return {};
    const valid: Record<string, number> = {};
    for (const [key, value] of Object.entries(stored)) {
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
        valid[key] = value;
      }
    }
    return valid;
  }
}
