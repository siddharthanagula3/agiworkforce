import type { E2BExecutor } from '@/lib/e2b/types';
import { logger } from '@/lib/logger';

const HARNESS_STATE_DIR = '/home/user/.agi-harness';
const STATE_FILE_SUFFIX = '.session';
const MAX_SESSION_ID_LENGTH = 200;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

function statePath(runtimeId: string): string {
  return `${HARNESS_STATE_DIR}/${runtimeId}${STATE_FILE_SUFFIX}`;
}

function validSessionId(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_SESSION_ID_LENGTH) return null;
  return SESSION_ID_PATTERN.test(candidate) ? candidate : null;
}

export async function readHarnessSessionId(
  executor: E2BExecutor,
  runtimeId: string,
): Promise<string | null> {
  if (!executor.readFileBytes) return null;
  try {
    const bytes = await executor.readFileBytes(statePath(runtimeId));
    if (!bytes) return null;
    return validSessionId(new TextDecoder().decode(bytes));
  } catch (error) {
    logger.warn({ error, runtimeId }, '[harness] could not read the stored harness session id');
    return null;
  }
}

export async function writeHarnessSessionId(
  executor: E2BExecutor,
  runtimeId: string,
  sessionId: string,
): Promise<void> {
  const validated = validSessionId(sessionId);
  if (!validated) return;
  try {
    await executor.createFolder({ path: HARNESS_STATE_DIR });
    await executor.writeFile({ path: statePath(runtimeId), content: validated });
  } catch (error) {
    logger.warn({ error, runtimeId }, '[harness] could not persist the harness session id');
  }
}
