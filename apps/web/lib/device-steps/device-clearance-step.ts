import 'server-only';

import { logger } from '@/lib/logger';
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
    { runId: input.runId, reason: clearance.reason },
    '[cloud-agent] device withdrawn from the run; its tools are not offered',
  );
  return {
    decision: 'withdrawn',
    reason: clearance.reason,
    retryInMs: 0,
    input: withoutDeviceHost(input),
  };
}
