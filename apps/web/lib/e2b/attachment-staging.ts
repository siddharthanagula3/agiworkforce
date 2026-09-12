/**
 * Staging this turn's attachments into the execution sandbox workspace.
 *
 * Pure logic over an injected {@link E2BExecutor}: it never creates, resumes or
 * releases a sandbox, so it can only ever run against one the caller already
 * holds. That is deliberate, sandbox slots are a scarce, per-user quota.
 */
import type { E2BExecutor } from './types';

/** Matches WORKSPACE_ROOT in ./generated-files.ts, the cwd the sandbox starts in. */
export const SANDBOX_WORKSPACE_ROOT = '/home/user';

const MAX_STAGED_FILENAME_LENGTH = 96;

export interface TurnAttachment {
  readonly filename: string;
  readonly mimeType: string;
  /** The attachment's own bytes, base64 encoded. */
  readonly base64: string;
}

export interface StagedAttachment {
  readonly attachment: TurnAttachment;
  readonly name: string;
  readonly path: string;
}

export interface StagingOutcome {
  readonly staged: string[];
  readonly failed: string[];
}

/**
 * A user-supplied filename reaches a sandbox path here, so only a plain leaf
 * name survives: no directory segments, no leading dot (a dotfile is skipped by
 * the generated-file walker and would be invisible to the model), and nothing
 * outside a conservative character set.
 */
function sandboxFileName(rawFilename: string, index: number): string {
  const leaf = rawFilename.split(/[\\/]/).pop() ?? '';
  const cleaned = leaf
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, MAX_STAGED_FILENAME_LENGTH);
  return cleaned || `attachment-${index + 1}`;
}

function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let suffix = 2; suffix <= taken.size + 2; suffix += 1) {
    const candidate = `${stem}-${suffix}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${stem}-${taken.size + 3}${ext}`;
}

/**
 * The paths the attachments will occupy. The prompt and the writer both read
 * this, so the model is told the same path the bytes actually land on.
 */
export function resolveStagedAttachments(
  attachments: readonly TurnAttachment[],
): StagedAttachment[] {
  const taken = new Set<string>();
  const staged: StagedAttachment[] = [];
  attachments.forEach((attachment, index) => {
    if (!attachment.base64) return;
    const name = uniqueName(sandboxFileName(attachment.filename, index), taken);
    taken.add(name);
    staged.push({ attachment, name, path: `${SANDBOX_WORKSPACE_ROOT}/${name}` });
  });
  return staged;
}

export function stagedAttachmentPaths(attachments: readonly TurnAttachment[]): string[] {
  return resolveStagedAttachments(attachments).map((entry) => entry.path);
}

/**
 * Writes each attachment into the workspace. One failure is one file: the
 * remaining attachments still stage, and the caller reports what did not.
 */
export async function stageTurnAttachments(
  executor: E2BExecutor,
  attachments: readonly TurnAttachment[],
): Promise<StagingOutcome> {
  const staged: string[] = [];
  const failed: string[] = [];
  for (const entry of resolveStagedAttachments(attachments)) {
    try {
      const result = await executor.writeFile({
        path: entry.path,
        content: entry.attachment.base64,
        encoding: 'base64',
      });
      if (result.ok) staged.push(entry.path);
      else failed.push(entry.path);
    } catch {
      failed.push(entry.path);
    }
  }
  return { staged, failed };
}
