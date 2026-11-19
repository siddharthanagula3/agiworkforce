import 'server-only';

import { deviceOperatingSystem } from '@agiworkforce/cloud-contracts';
import { PRODUCT_COPYRIGHT_NAME, PRODUCT_NAMES } from '@agiworkforce/types';
import { createAgentEventStreamEmitter } from '@/app/api/llm/v1/chat/completions/lib/agent-event-stream';
import { logger } from '@/lib/logger';
import { appendCloudAgentEvent, getCloudAgentRun } from '@/lib/services/cloud-agent-run-service';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  clearDeviceForRemoteSteps,
  readRegisteredDevice,
  type DeviceStepClearance,
} from '@/lib/device-steps/device-registry';
import {
  parseCloudAgentWorkflowInput,
  type CloudAgentWorkflowInput,
} from '@/lib/workflows/cloud-agent-workflow-input';
import { writeDurableFrames } from '@/lib/workflows/steps/durable-stream-frames';

export interface CloudAgentDeviceClearance {
  decision: DeviceStepClearance['decision'] | 'none';
  reason: string | null;
  retryInMs: number;
  input: CloudAgentWorkflowInput;
}

function withoutDeviceHost(input: CloudAgentWorkflowInput): CloudAgentWorkflowInput {
  const processed = { ...input.processed };
  delete processed.deviceHost;
  return parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify({ ...input, processed })));
}

/**
 * Consults the device registry before a durable invocation may offer device
 * tools. A run outlives the request that declared the device, so pairing,
 * presence, capability and credential are read again here rather than trusted
 * from the header the turn started with.
 */
export async function clearCloudAgentDevice(
  rawInput: CloudAgentWorkflowInput,
  waitExhausted = false,
): Promise<CloudAgentDeviceClearance> {
  'use step';

  const input = parseCloudAgentWorkflowInput(rawInput);
  const declaration = input.processed.deviceHost;
  if (!declaration) return { decision: 'none', reason: null, retryInMs: 0, input };

  let clearance: DeviceStepClearance;
  try {
    // No surface is named: the install id identifies the device on its own, and
    // pinning 'desktop' here would refuse a step any other registered surface
    // could carry out.
    const device = await readRegisteredDevice(getNeonDb(), {
      userId: input.userId,
      installId: declaration.deviceId,
    });
    clearance = clearDeviceForRemoteSteps(declaration, device);
  } catch (error) {
    logger.warn(
      { error, runId: input.runId },
      '[cloud-agent] device registry unreadable; withdrawing device tools for this invocation',
    );
    return {
      decision: 'withdrawn',
      reason: 'This device could not be confirmed, so no step was sent to it.',
      retryInMs: 0,
      input: withoutDeviceHost(input),
    };
  }

  if (clearance.decision === 'ready') {
    return { decision: 'ready', reason: null, retryInMs: 0, input };
  }
  if (clearance.decision === 'wait' && !waitExhausted) {
    return {
      decision: 'wait',
      reason: clearance.reason,
      retryInMs: clearance.retryInMs,
      input,
    };
  }
  logger.warn(
    {
      runId: input.runId,
      reason: clearance.reason,
      capabilitySource: clearance.decision === 'withdrawn' ? clearance.capabilitySource : undefined,
    },
    '[cloud-agent] device withdrawn from the run; its tools are not offered',
  );
  return {
    decision: 'withdrawn',
    reason: clearance.reason,
    retryInMs: 0,
    input: withoutDeviceHost(input),
  };
}

export type DeviceClearanceNotice = 'waiting' | 'back' | 'withdrawn';

const MOBILE_APP_NAME = `${PRODUCT_COPYRIGHT_NAME} ${PRODUCT_NAMES.mobile}`;
const DESKTOP_APP_NAME = `${PRODUCT_COPYRIGHT_NAME} ${PRODUCT_NAMES.desktop}`;

function wakeInstruction(platform: string): string {
  const os = deviceOperatingSystem(platform);
  return os === 'ios' || os === 'android'
    ? `Open ${MOBILE_APP_NAME} on that device`
    : `Open ${DESKTOP_APP_NAME} on that computer`;
}

export function deviceClearanceCopy(
  notice: DeviceClearanceNotice,
  device: { deviceName: string; platform: string },
  reason: string | null,
  waitMinutes: number,
): { summary: string; detail?: string; status: 'running' | 'completed' | 'failed' } {
  const { deviceName } = device;
  switch (notice) {
    case 'waiting':
      return {
        summary: `Waiting for ${deviceName} to come online`,
        detail: `${reason ? `${reason} ` : ''}${wakeInstruction(device.platform)} to let the task carry on. If it is still offline after ${waitMinutes} minutes, the task continues without it.`,
        status: 'running',
      };
    case 'back':
      return { summary: `${deviceName} is online again`, status: 'completed' };
    case 'withdrawn':
      return {
        summary: `Continuing without ${deviceName}`,
        ...(reason ? { detail: reason } : {}),
        status: 'failed',
      };
  }
}

export async function reportCloudAgentDeviceClearance(
  rawInput: CloudAgentWorkflowInput,
  notice: DeviceClearanceNotice,
  reason: string | null,
  waitMinutes: number,
): Promise<void> {
  'use step';

  const input = parseCloudAgentWorkflowInput(rawInput);
  const declaration = input.processed.deviceHost;
  if (!declaration) return;
  const db = getNeonDb();
  const snapshot = await getCloudAgentRun(db, {
    userId: input.userId,
    runId: input.runId,
    afterSequence: Number.MAX_SAFE_INTEGER,
    limit: 1,
  });
  const turnId = input.continuation?.eventTurnId ?? input.processed.requestId;
  const emitter = createAgentEventStreamEmitter({
    sessionId: input.continuation?.eventSessionId ?? input.processed.conversationId ?? turnId,
    turnId,
    responseModel: input.processed.requestedModel,
    initialSequence: (snapshot?.run.lastEventSequence ?? -1) + 1,
  });
  const emitted = emitter.emitWithEnvelope({
    type: 'progress-update',
    progressId: `device-clearance:${input.runId}:${declaration.deviceId}`,
    ...deviceClearanceCopy(notice, declaration, reason, waitMinutes),
  });
  await appendCloudAgentEvent(db, {
    userId: input.userId,
    runId: input.runId,
    envelope: emitted.envelope,
  });
  await writeDurableFrames(input.runId, 'device-clearance', [emitted.sse]);
}
