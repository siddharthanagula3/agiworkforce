import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { CallerToolResumeRequestSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withCorsRoute } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  claimCloudAgentCallerCheckpoint,
  releaseCloudAgentCallerCheckpoint,
  CloudAgentCallerResultError,
  CloudAgentRunNotFoundError,
  CloudAgentApprovalCheckpointConflictError,
  CloudAgentApprovalCheckpointExpiredError,
  CloudAgentApprovalCheckpointNotFoundError,
} from '@/lib/services/cloud-agent-run-service';
import type { AuthGateSuccess } from '../lib/auth-gate';
import { applySecretHandlingToTexts } from '../lib/secret-handling-gate';
import {
  admitToolResultResume,
  continueToolResultResume,
  toolResultResumeError,
} from '../lib/tool-result-resume';
export { toolResultResumeOptions as OPTIONS } from '../lib/tool-result-resume';

export const maxDuration = 300;

function checkpointError(error: unknown): NextResponse | null {
  if (error instanceof CloudAgentCallerResultError)
    return toolResultResumeError(
      'Caller results do not match the paused actions.',
      400,
      'caller_tool_invalid',
    );
  if (error instanceof CloudAgentApprovalCheckpointExpiredError)
    return toolResultResumeError(
      'These caller actions expired. Start a new task.',
      410,
      'caller_tool_expired',
    );
  if (
    error instanceof CloudAgentRunNotFoundError ||
    error instanceof CloudAgentApprovalCheckpointNotFoundError
  )
    return toolResultResumeError('Pending caller actions not found.', 404, 'caller_tool_not_found');
  if (error instanceof CloudAgentApprovalCheckpointConflictError)
    return toolResultResumeError(
      'These caller actions are already being resumed.',
      409,
      'caller_tool_conflict',
    );
  if (error instanceof DOMException && error.name === 'AbortError')
    return toolResultResumeError('This task was cancelled.', 409, 'caller_tool_cancelled');
  return null;
}

async function handleCallerResume(request: NextRequest, authResult: AuthGateSuccess) {
  const { userId } = authResult;
  const fields = await readValidatedJsonBody(
    request,
    CallerToolResumeRequestSchema,
    'Invalid caller-tool resume request.',
  );
  const observations = fields.observations ?? [];
  const texts = [
    ...fields.tool_results.map((entry) => entry.content),
    ...observations.map((entry) => entry.text),
  ];
  const gate = await applySecretHandlingToTexts(userId, texts);
  if (gate.action === 'blocked') {
    return toolResultResumeError(
      'The caller results contain a secret blocked by your policy.',
      400,
      'caller_tool_secret_blocked',
    );
  }
  if (gate.texts.length !== texts.length)
    throw new Error('Caller result inspection returned an incomplete result.');
  const callerResults = fields.tool_results.map((entry, index) => ({
    ...entry,
    content: gate.texts[index]!,
  }));
  const callerObservations = observations.map((entry, index) => ({
    ...entry,
    text: gate.texts[fields.tool_results.length + index]!,
  }));
  const { db, organizationId } = await getUserScopedDb(request);
  let claim;
  try {
    claim = await claimCloudAgentCallerCheckpoint(db, { userId, resume: fields });
  } catch (error) {
    const response = checkpointError(error);
    if (response) return response;
    throw error;
  }
  return continueToolResultResume({
    request,
    authResult,
    db,
    organizationId,
    claim,
    kind: 'caller',
    resume: { callerResults, ...(fields.observations !== undefined ? { callerObservations } : {}) },
    release: async () => {
      await releaseCloudAgentCallerCheckpoint(db, {
        userId,
        runId: claim.checkpoint.runId,
        checkpointId: claim.checkpoint.id,
        leaseToken: claim.leaseToken,
      }).catch((error) => {
        logger.error(
          { error, userId, runId: claim.checkpoint.runId },
          'Caller-result lease could not be released',
        );
      });
    },
  });
}

export const POST = withCorsRoute(
  withErrorHandler((request: NextRequest) =>
    admitToolResultResume(request, (authResult) => handleCallerResume(request, authResult)),
  ),
);
