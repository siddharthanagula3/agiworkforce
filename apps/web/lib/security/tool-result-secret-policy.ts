import 'server-only';

import { SECRET_HANDLING_MODE_DEFAULT } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { isHighConfidenceSecretName } from './secret-patterns';
import { redactAuditedSecrets, scanForSecrets } from './secrets-audit';

export interface ToolResultSecretPolicyResult {
  content: string;
  action: 'allowed' | 'warned' | 'redacted' | 'blocked';
}

export async function evaluateToolResultSecretPolicy(
  userId: string | undefined,
  toolName: string,
  content: string,
): Promise<ToolResultSecretPolicyResult> {
  const detections = scanForSecrets(content);
  if (detections.length === 0) return { content, action: 'allowed' };

  const highConfidence = detections.filter((detection) =>
    isHighConfidenceSecretName(detection.name),
  );
  const lowConfidence = detections.filter(
    (detection) => !isHighConfidenceSecretName(detection.name),
  );
  const hasHighConfidence = highConfidence.length > 0;

  const { mode, organizationId } = userId
    ? await resolveSecretHandlingPolicy(getNeonDb(), userId)
    : { mode: SECRET_HANDLING_MODE_DEFAULT.personal, organizationId: null as string | null };

  const action = !hasHighConfidence
    ? 'warned'
    : mode === 'block'
      ? 'blocked'
      : mode === 'redact'
        ? 'redacted'
        : 'warned';

  const relevantDetections = hasHighConfidence ? highConfidence : lowConfidence;
  const patternNames = [...new Set(relevantDetections.map((detection) => detection.name))];
  let nextContent = content;
  if (action === 'redacted') {
    nextContent = redactAuditedSecrets(
      content,
      new Set(highConfidence.map((detection) => detection.name)),
    );
  } else if (action === 'blocked') {
    nextContent = `The result from "${toolName}" was blocked because it contained a secret. This organization's policy blocks sensitive values before they reach the model.`;
  }

  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'secret_detected',
    outcome: action === 'blocked' ? 'denied' : 'success',
    severity: action === 'blocked' ? 'warning' : 'info',
    detail: {
      resourceType: 'tool_result',
      resourceId: toolName,
      source: patternNames.join(','),
      count: relevantDetections.length,
      status: action,
    },
  }).catch((error) => {
    logger.error({ error, userId }, '[tool-loop] secret audit event could not be recorded');
  });

  return { content: nextContent, action };
}

export async function applyToolResultSecretPolicy(
  userId: string | undefined,
  toolName: string,
  content: string,
): Promise<string> {
  return (await evaluateToolResultSecretPolicy(userId, toolName, content)).content;
}
