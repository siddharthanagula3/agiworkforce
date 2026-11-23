import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { ThreadSummary } from '@agiworkforce/types';

type VerifiedDeveloperSessionTrustMode = Exclude<ThreadSummary['trustMode'], 'unknown'>;

export function workspaceRealpath(cwd: string): string | undefined {
  if (!path.isAbsolute(cwd)) return undefined;
  try {
    return realpathSync.native(cwd);
  } catch {
    return undefined;
  }
}

export function isSameWorkspacePath(ownerCwd: string, candidateCwd?: string): boolean {
  if (candidateCwd === undefined || !path.isAbsolute(ownerCwd) || !path.isAbsolute(candidateCwd)) {
    return false;
  }
  if (ownerCwd === candidateCwd) return true;
  const ownerPath = workspaceRealpath(ownerCwd);
  const candidatePath = workspaceRealpath(candidateCwd);
  if ((ownerPath === undefined) !== (candidatePath === undefined)) return false;
  const owner = ownerPath ?? path.normalize(ownerCwd);
  const candidate = candidatePath ?? path.normalize(candidateCwd);
  return process.platform === 'win32'
    ? owner.toLowerCase() === candidate.toLowerCase()
    : owner === candidate;
}

export function assertRunnableStartedThread(
  thread: ThreadSummary,
  requestedCwd: string,
  expectedTrustMode?: VerifiedDeveloperSessionTrustMode,
): asserts thread is ThreadSummary & { trustMode: VerifiedDeveloperSessionTrustMode } {
  if (!path.isAbsolute(requestedCwd)) {
    throw new Error('The requested developer-session workspace path is not absolute.');
  }
  if (!isSameWorkspacePath(requestedCwd, thread.cwd)) {
    throw new Error(
      'The local runtime returned developer-session workspace metadata that does not match the requested workspace.',
    );
  }
  if (thread.status !== 'idle') {
    throw new Error(
      `The local runtime returned a new developer session in non-runnable status "${thread.status}".`,
    );
  }
  if (thread.trustMode === 'unknown') {
    throw new Error(
      'The local runtime did not establish a verified Local, BYOK, or Managed boundary for this new developer session.',
    );
  }
  if (expectedTrustMode !== undefined && thread.trustMode !== expectedTrustMode) {
    throw new Error(
      `The local runtime returned a ${thread.trustMode} developer session when ${expectedTrustMode} was requested.`,
    );
  }
}
