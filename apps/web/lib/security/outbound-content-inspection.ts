import 'server-only';

import type { SecretHandlingMode } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  SecretRedactionIncompleteError,
  redactSecretsFromValue,
  scanValueForSecrets,
} from '@/lib/security/secrets-audit';

export type OutboundChannel = 'connector_write' | 'share' | 'artifact_publish' | 'upload';

export interface OutboundFinding {
  scanner: string;
  name: string;
  severity: string;
  count: number;
}

export interface OutboundContentScanner {
  id: string;
  channels?: readonly OutboundChannel[];
  scan(input: { channel: OutboundChannel; value: unknown }): Promise<OutboundFinding[]>;
  redact?<T>(value: T): T;
}

export const secretPatternScanner: OutboundContentScanner = {
  id: 'secret_patterns',
  // The upload channel runs this scanner in its own gate, with confidence
  // rules this one does not have; a second pass would double-block.
  channels: ['connector_write', 'share', 'artifact_publish'],
  async scan({ value }) {
    const counts = new Map<string, OutboundFinding>();
    for (const detection of scanValueForSecrets(value)) {
      const existing = counts.get(detection.name);
      if (existing) existing.count += 1;
      else {
        counts.set(detection.name, {
          scanner: 'secret_patterns',
          name: detection.name,
          severity: detection.severity,
          count: 1,
        });
      }
    }
    return [...counts.values()];
  },
  redact<T>(value: T): T {
    return redactSecretsFromValue(value).value;
  },
};

const scanners: OutboundContentScanner[] = [secretPatternScanner];

export function registerOutboundContentScanner(scanner: OutboundContentScanner): () => void {
  if (!scanners.some((existing) => existing.id === scanner.id)) scanners.push(scanner);
  return () => {
    const index = scanners.findIndex((existing) => existing.id === scanner.id);
    if (index > 0) scanners.splice(index, 1);
  };
}

export type OutboundVerdict<T> =
  | { action: 'allowed'; value: T; findings: OutboundFinding[] }
  | { action: 'redacted'; value: T; findings: OutboundFinding[] }
  | { action: 'blocked'; findings: OutboundFinding[]; message: string };

export const OUTBOUND_BLOCKED_MESSAGE =
  'This was not sent because it appears to contain sensitive data, such as an API key or access token. Remove it and try again.';

export interface InspectOutboundInput<T> {
  channel: OutboundChannel;
  value: T;
  userId: string;
  organizationId: string | null;
  resourceId?: string;
  auditUnblocked?: boolean;
  priorFindings?: readonly OutboundFinding[];
  resolveMode: () => Promise<{ mode: SecretHandlingMode; organizationId: string | null }>;
}

function scannersForChannel(channel: OutboundChannel): OutboundContentScanner[] {
  return scanners.filter((scanner) => !scanner.channels || scanner.channels.includes(channel));
}

export async function inspectOutboundContent<T>(
  input: InspectOutboundInput<T>,
): Promise<OutboundVerdict<T>> {
  const applicable = scannersForChannel(input.channel);
  const findings: OutboundFinding[] = [...(input.priorFindings ?? [])];
  let scannerFailed = false;
  for (const scanner of applicable) {
    try {
      findings.push(...(await scanner.scan({ channel: input.channel, value: input.value })));
    } catch (error) {
      scannerFailed = true;
      logger.error(
        { error, scanner: scanner.id, channel: input.channel },
        'Outbound scanner failed',
      );
    }
  }

  if (findings.length === 0 && !scannerFailed) {
    return { action: 'allowed', value: input.value, findings };
  }

  let policy: { mode: SecretHandlingMode; organizationId: string | null };
  try {
    policy = await input.resolveMode();
  } catch (error) {
    logger.error({ error, channel: input.channel }, 'Outbound policy unreadable; blocking');
    policy = { mode: 'block', organizationId: input.organizationId };
  }
  const organizationId = policy.organizationId ?? input.organizationId;

  // A finding no applicable scanner can redact would leave the match in place,
  // so the strict mode of the two is the only honest answer.
  const redactable = findings.every((finding) =>
    applicable.some((scanner) => scanner.id === finding.scanner && scanner.redact),
  );
  const requested: SecretHandlingMode =
    policy.mode === 'redact' && !redactable ? 'block' : policy.mode;
  const mode: SecretHandlingMode = scannerFailed && requested !== 'warn' ? 'block' : requested;
  let verdict: OutboundVerdict<T>;
  if (mode === 'block') {
    verdict = { action: 'blocked', findings, message: OUTBOUND_BLOCKED_MESSAGE };
  } else if (mode === 'redact') {
    try {
      let value = input.value;
      for (const scanner of applicable) {
        if (scanner.redact) value = scanner.redact(value);
      }
      verdict = { action: 'redacted', value, findings };
    } catch (error) {
      if (!(error instanceof SecretRedactionIncompleteError)) throw error;
      verdict = { action: 'blocked', findings, message: OUTBOUND_BLOCKED_MESSAGE };
    }
  } else {
    verdict = { action: 'allowed', value: input.value, findings };
  }

  if (verdict.action !== 'blocked' && input.auditUnblocked === false) return verdict;

  const total = findings.reduce((sum, finding) => sum + finding.count, 0);
  await recordAuditEvent({
    userId: input.userId,
    organizationId,
    eventType: verdict.action === 'blocked' ? 'dlp_content_blocked' : 'secret_detected',
    outcome: verdict.action === 'blocked' ? 'denied' : 'success',
    severity: verdict.action === 'blocked' ? 'warning' : 'info',
    detail: {
      resourceType: input.channel,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      source: [...new Set(findings.map((finding) => `${finding.scanner}:${finding.name}`))].join(
        ',',
      ),
      count: total,
      status: verdict.action,
    },
  }).catch((error: unknown) => {
    logger.error({ error, channel: input.channel }, 'Outbound inspection audit write failed');
  });

  return verdict;
}
