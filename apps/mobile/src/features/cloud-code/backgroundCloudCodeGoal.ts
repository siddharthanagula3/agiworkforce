import {
  CLOUD_CODE_SESSION_READY_POLL_INTERVAL_MS,
  CLOUD_CODE_SESSION_READY_POLLS,
  type CloudCodeSession,
} from '@agiworkforce/types';
import { beginCloudCodeRequest, isCloudCodeTurnStillRunning } from './cloudCodeRequests';
import {
  CLOUD_CODE_SEND_ERROR,
  cloudCodeApi,
  describeCloudCodeError,
  newCloudCodeIdempotencyKey,
} from './service';

export async function startBackgroundCloudCodeGoal(
  session: CloudCodeSession,
  goal: string,
  model: string,
): Promise<void> {
  const operation = beginCloudCodeRequest(session.id, { kind: 'send', goal, baseline: null });
  if (!operation) return;

  let refused: { goal: string; message: string } | undefined;
  try {
    let current = session;
    for (
      let attempt = 0;
      current.state === 'provisioning' && attempt < CLOUD_CODE_SESSION_READY_POLLS;
      attempt += 1
    ) {
      if (attempt > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, CLOUD_CODE_SESSION_READY_POLL_INTERVAL_MS),
        );
      }
      if (operation.signal.aborted) return;
      current = (await cloudCodeApi.get(session.id, operation.signal)).session;
    }
    if (operation.signal.aborted) return;
    if (current.state !== 'ready') {
      refused = { goal, message: current.lastError || 'The Cloud workspace is not ready.' };
      return;
    }
    await cloudCodeApi.startAgentTurn(
      session.id,
      { goal, model, idempotencyKey: newCloudCodeIdempotencyKey() },
      operation.signal,
    );
  } catch (error) {
    if (!operation.signal.aborted && !isCloudCodeTurnStillRunning(error)) {
      refused = { goal, message: describeCloudCodeError(error, CLOUD_CODE_SEND_ERROR) };
    }
  } finally {
    operation.finish(refused);
  }
}
