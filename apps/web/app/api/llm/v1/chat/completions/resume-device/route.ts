import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { DeviceStepResumeRequestSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withCorsRoute } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { AuthGateSuccess } from '../lib/auth-gate';
import { applySecretHandlingToTexts } from '../lib/secret-handling-gate';
import {
  claimCloudAgentDeviceCheckpoint,
  releaseCloudAgentDeviceCheckpoint,
  CloudAgentApprovalCheckpointConflictError,
  CloudAgentApprovalCheckpointExpiredError,
  CloudAgentApprovalCheckpointNotFoundError,
  CloudAgentDeviceMismatchError,
  CloudAgentDeviceStepResultError,
  type ClaimedCloudAgentDeviceCheckpoint,
} from '@/lib/services/cloud-agent-run-service';
import {
  admitToolResultResume,
  continueToolResultResume,
  toolResultResumeError,
} from '../lib/tool-result-resume';
export { toolResultResumeOptions as OPTIONS } from '../lib/tool-result-resume';

export const maxDuration = 300;

const SECRET_IN_RESULT_MESSAGE =
  'This device result was blocked because it appears to contain a secret, such as an API key or access token.';
function jsonError(message: string, status: number, code = 'device_step_invalid'): NextResponse {
  return toolResultResumeError(message, status, code);
}

async function releaseClaim(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  userId: string,
  claim: ClaimedCloudAgentDeviceCheckpoint,
): Promise<void> {
  await releaseCloudAgentDeviceCheckpoint(db, {
    userId,
    runId: claim.checkpoint.runId,
    checkpointId: claim.checkpoint.id,
    leaseToken: claim.leaseToken,
  }).catch((error) => {
    logger.error(
      { error, userId, runId: claim.checkpoint.runId },
      'Cloud agent device lease could not be released',
    );
  });
}

function checkpointError(error: unknown): NextResponse | null {
  if (error instanceof CloudAgentDeviceStepResultError) {
    return jsonError('Device results do not match the paused device step.', 400);
  }
  if (error instanceof CloudAgentDeviceMismatchError) {
    return jsonError('This step is waiting on a different device.', 409);
  }
  if (error instanceof CloudAgentApprovalCheckpointExpiredError) {
    return jsonError('This device step expired. Ask again on that device.', 410);
  }
  if (error instanceof CloudAgentApprovalCheckpointNotFoundError) {
    return jsonError('Pending device step not found.', 404);
  }
  if (error instanceof CloudAgentApprovalCheckpointConflictError) {
    return jsonError('This device step is already being resumed.', 409);
  }
  return null;
}

async function handleDeviceStepResume(request: NextRequest, authResult: AuthGateSuccess) {
  const { userId } = authResult;
  let resumeFields;
  try {
    const parsed = DeviceStepResumeRequestSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError('Invalid device step resume request.', 400);
    resumeFields = parsed.data;
  } catch {
    return jsonError('Invalid JSON in device step resume request.', 400);
  }

  // What the device read becomes the model's next tool result, so it goes
  // through the same secret gate the message array does rather than around it.
  const resultGate = await applySecretHandlingToTexts(
    userId,
    resumeFields.device_results.map((entry) => entry.content),
  );
  if (resultGate.action === 'blocked') {
    return jsonError(SECRET_IN_RESULT_MESSAGE, 400);
  }
  const gatedResults = resumeFields.device_results.map((entry, index) => ({
    toolCallId: entry.tool_call_id,
    content: resultGate.texts[index] ?? entry.content,
    isError: entry.is_error,
    ...(entry.image
      ? { image: { base64: entry.image.base64, mimeType: entry.image.mime_type } }
      : {}),
  }));

  const { db, organizationId } = await getUserScopedDb(request);
  let claim: ClaimedCloudAgentDeviceCheckpoint;
  try {
    claim = await claimCloudAgentDeviceCheckpoint(db, {
      userId,
      runId: resumeFields.run_id,
      deviceId: resumeFields.device_id,
      results: gatedResults,
    });
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
    kind: 'device',
    resume: { deviceResults: claim.results },
    release: () => releaseClaim(db, userId, claim),
  });
}

export const POST = withCorsRoute(
  withErrorHandler((request: NextRequest) =>
    admitToolResultResume(request, (authResult) => handleDeviceStepResume(request, authResult)),
  ),
);
