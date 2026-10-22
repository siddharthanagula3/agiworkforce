import 'server-only';

import { posix } from 'node:path';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { CloudCodeSession } from '@agiworkforce/types';
import { getE2BExecutor } from '@/lib/e2b/runtime';
import { managedCloudCodeSessionScope } from '@/lib/e2b/session-store';
import type { CommandExecutionResult, E2BExecutor } from '@/lib/e2b/types';
import { logger } from '@/lib/logger';
import {
  CloudCodeConflictError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
  claimCloudCodeSessionForRun,
  getCloudCodeSession,
  releaseCloudCodeSessionAfterRun,
  type CloudCodeOwner,
} from '@/lib/services/cloud-code-session-service';

import type { SecurityScanReport } from '../contract';
import { openSecurityScanReport, sealSecurityScanReport } from './report-signing';

const SCAN_STATE_DIRECTORY = '.agi-security-scan';
const REPORT_FILE = 'report.json';
const COMMAND_TIMEOUT_MS = 30_000;
const PATCH_FILE_ID_RE = /^[0-9a-f]{16}$/;

type RequiredExecutor = E2BExecutor &
  Required<Pick<E2BExecutor, 'runCommand' | 'readFileBytes' | 'createFolder'>>;

export interface SecurityScanWorkspace {
  session: CloudCodeSession;
  run(command: string): Promise<CommandExecutionResult>;
  readText(relativePath: string): Promise<string | null>;
  readReport(): Promise<SecurityScanReport | null>;
  writeReport(report: SecurityScanReport): Promise<void>;
  writePatch(id: string, patch: string): Promise<string>;
}

export function assertSessionScannable(session: CloudCodeSession): void {
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('This Code session is closed, so it has no files to scan');
  }
  if (session.archivedAt) {
    throw new CloudCodeConflictError('This Code session is archived. Unarchive it to scan it.');
  }
  if (session.state === 'failed') {
    throw new CloudCodeConflictError('Failed Code sessions must be closed and recreated');
  }
  if (session.state === 'provisioning') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  if (!session.repositoryUrl) {
    throw new CloudCodeValidationError('Security scans need a session opened on a repository');
  }
}

function stateDirectory(session: CloudCodeSession): string {
  const workspace = session.workspacePath.replace(/\/+$/, '');
  const directory = posix.join(posix.dirname(workspace), SCAN_STATE_DIRECTORY);
  if (directory === workspace || directory.startsWith(`${workspace}/`)) {
    throw new CloudCodeValidationError('This session keeps its repository at the sandbox root');
  }
  return directory;
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return UTF8.decode(bytes);
  } catch {
    return null;
  }
}

function hasWorkspaceTools(executor: E2BExecutor | null): executor is RequiredExecutor {
  return Boolean(executor?.runCommand && executor.readFileBytes && executor.createFolder);
}

export async function withSecurityScanWorkspace<T>(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  planTier: string,
  work: (workspace: SecurityScanWorkspace) => Promise<T>,
): Promise<T> {
  const session = await getCloudCodeSession(db, owner, sessionId);
  assertSessionScannable(session);
  const directory = stateDirectory(session);

  const claim = await claimCloudCodeSessionForRun(db, owner, sessionId);
  if (!claim) throw new CloudCodeConflictError('Code session is busy; wait and try again');

  let executor: E2BExecutor | null = null;
  try {
    executor = await getE2BExecutor(
      managedCloudCodeSessionScope(
        owner.userId,
        sessionId,
        claim.session.networkAccess,
        planTier,
        claim.session.runtimeId,
        null,
        claim.session.extraHosts,
      ),
    );
    if (!hasWorkspaceTools(executor)) {
      throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
    }
    const tools = executor;
    const workspacePath = claim.session.workspacePath;
    const binding = { userId: owner.userId, sessionId };
    const reportPath = posix.join(directory, REPORT_FILE);

    const workspace: SecurityScanWorkspace = {
      session: claim.session,
      run: (command) =>
        tools.runCommand({ command, cwd: workspacePath, timeoutMs: COMMAND_TIMEOUT_MS }),
      async readText(relativePath) {
        const bytes = await tools.readFileBytes(posix.join(workspacePath, relativePath));
        return bytes ? decodeText(bytes) : null;
      },
      async readReport() {
        const bytes = await tools.readFileBytes(reportPath);
        const sealed = bytes ? decodeText(bytes) : null;
        if (sealed === null) return null;
        const report = openSecurityScanReport(binding, sealed);
        if (!report) {
          logger.warn({ sessionId }, '[security-scan] stored report failed verification');
        }
        return report;
      },
      async writeReport(report) {
        const folder = await tools.createFolder({ path: directory });
        if (!folder.ok) throw new CloudCodeUnavailableError('The scan report could not be saved');
        const written = await tools.writeFile({
          path: reportPath,
          content: sealSecurityScanReport(binding, report),
        });
        if (!written.ok) throw new CloudCodeUnavailableError('The scan report could not be saved');
      },
      async writePatch(id, patch) {
        if (!PATCH_FILE_ID_RE.test(id)) throw new CloudCodeValidationError('Unknown finding');
        const folder = await tools.createFolder({ path: directory });
        if (!folder.ok) throw new CloudCodeUnavailableError('The fix could not be staged');
        const patchPath = posix.join(directory, `${id}.patch`);
        const written = await tools.writeFile({ path: patchPath, content: patch });
        if (!written.ok) throw new CloudCodeUnavailableError('The fix could not be staged');
        return patchPath;
      },
    };
    return await work(workspace);
  } finally {
    const released = await releaseCloudCodeSessionAfterRun(
      db,
      owner,
      sessionId,
      claim.leaseToken,
    ).catch((error: unknown) => {
      logger.error({ error, sessionId }, '[security-scan] session release failed');
      return null;
    });
    if (!released) logger.warn({ sessionId }, '[security-scan] session lease was already gone');
    if (executor) {
      await executor.pause?.().catch((error: unknown) => {
        logger.warn({ error, sessionId }, '[security-scan] sandbox pause failed');
      });
      await executor.dispose().catch((error: unknown) => {
        logger.warn({ error, sessionId }, '[security-scan] sandbox dispose failed');
      });
    }
  }
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
