import 'server-only';

import type { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import type { SecretDetection } from '@/lib/security/secrets-audit';
import { isHighConfidenceSecretName } from '@/lib/security/secret-patterns';

export const MESSAGE_SCAN_BOUNDARY = ' AGI-CHAT-SECRET-SCAN-BOUNDARY ';

export type SecretHandlingAction = 'clean' | 'warned' | 'redacted' | 'blocked';

export function partitionByConfidence(detections: readonly SecretDetection[]): {
  high: SecretDetection[];
  low: SecretDetection[];
} {
  const high: SecretDetection[] = [];
  const low: SecretDetection[] = [];
  for (const detection of detections) {
    (isHighConfidenceSecretName(detection.name) ? high : low).push(detection);
  }
  return { high, low };
}

export async function recordSecretDetection(detection: {
  userId: string;
  organizationId: string | null;
  request: NextRequest;
  action: Exclude<SecretHandlingAction, 'clean'>;
  patternNames: readonly string[];
  matchCount: number;
}): Promise<void> {
  const { userId, organizationId, request, action, patternNames, matchCount } = detection;
  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'secret_detected',
    request,
    outcome: action === 'blocked' ? 'denied' : 'success',
    severity: action === 'blocked' ? 'warning' : 'info',
    detail: {
      resourceType: 'chat_completion',
      source: patternNames.join(','),
      count: matchCount,
      status: action,
    },
  }).catch((error) => {
    logger.error({ error, userId }, '[secret-handling] audit event could not be recorded');
  });
}
