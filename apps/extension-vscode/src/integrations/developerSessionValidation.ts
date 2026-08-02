import path from 'node:path';
import type { ThreadSummary } from '@agiworkforce/types';

type VerifiedDeveloperSessionTrustMode = Exclude<ThreadSummary['trustMode'], 'unknown'>;

/**
 * Compare workspace ownership metadata without allowing process-relative host
 * values to inherit authority from the Extension Host's current directory.
 */
export function isSameWorkspacePath(ownerCwd: string, candidateCwd?: string): boolean {
  if (candidateCwd === undefined || !path.isAbsolute(ownerCwd) || !path.isAbsolute(candidateCwd)) {
    return false;
  }
  const owner = path.normalize(ownerCwd);
  const candidate = path.normalize(candidateCwd);
  return process.platform === 'win32'
    ? owner.toLowerCase() === candidate.toLowerCase()
    : owner === candidate;
}

/**
 * Validate the app-server's authoritative response before any prompt, editor
 * context, or attachment is sent to `turn/start`.
 */
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
