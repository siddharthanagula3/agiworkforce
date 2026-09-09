import 'server-only';

import type { NextRequest } from 'next/server';
import type { SecretHandlingMode } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { redactSecrets, scanForSecrets, type SecretDetection } from '@/lib/security/secrets-audit';
import { isHighConfidenceSecretName } from '@/lib/security/secret-patterns';
import { describeSecretRedactionNotice } from '@/lib/chat-secret-redaction-notice';
import type { ProcessedRequest } from './request-processor';

type ChatMessage = ProcessedRequest['llmRequest']['messages'][number];

const MESSAGE_SCAN_BOUNDARY = ' AGI-CHAT-SECRET-SCAN-BOUNDARY ';

interface MessageTextSpan {
  messageIndex: number;
  multimodalIndex: number | null;
  text: string;
}

function isTextPart(part: unknown): part is { type: 'text'; text: string } {
  return (
    !!part &&
    typeof part === 'object' &&
    (part as { type?: unknown }).type === 'text' &&
    typeof (part as { text?: unknown }).text === 'string'
  );
}

function collectMessageSpans(messages: readonly ChatMessage[]): MessageTextSpan[] {
  const spans: MessageTextSpan[] = [];
  messages.forEach((message, messageIndex) => {
    spans.push({ messageIndex, multimodalIndex: null, text: message.content });
    message.multimodal_content?.forEach((part, multimodalIndex) => {
      if (isTextPart(part)) {
        spans.push({ messageIndex, multimodalIndex, text: part.text });
      }
    });
  });
  return spans;
}

function applyRedactedSpans(
  messages: readonly ChatMessage[],
  spans: readonly MessageTextSpan[],
  redactedTexts: readonly string[],
): ChatMessage[] {
  const redacted = messages.map((message) => ({
    ...message,
    multimodal_content: message.multimodal_content ? [...message.multimodal_content] : undefined,
  }));

  spans.forEach((span, spanIndex) => {
    const text = redactedTexts[spanIndex]!;
    const target = redacted[span.messageIndex]!;
    if (span.multimodalIndex === null) {
      target.content = text;
      return;
    }
    const parts = target.multimodal_content!;
    parts[span.multimodalIndex] = { ...(parts[span.multimodalIndex] as object), text };
  });

  return redacted;
}

export interface SecretHandlingOutcome {
  action: 'clean' | 'warned' | 'redacted' | 'blocked';
  patternNames: string[];
  matchCount: number;
  notice: string | null;
}

function actionForMode(mode: SecretHandlingMode): 'warned' | 'redacted' | 'blocked' {
  if (mode === 'block') return 'blocked';
  if (mode === 'redact') return 'redacted';
  return 'warned';
}

export function buildSecretRedactionNotice(count: number): string {
  return describeSecretRedactionNotice(count) ?? '';
}

function partitionByConfidence(detections: readonly SecretDetection[]): {
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

/**
 * The same policy applied to loose strings a caller supplies outside the
 * message array: resume guidance and tool input responses reach the model on
 * the very next turn, so they cannot bypass the gate the messages go through.
 */
export async function applySecretHandlingToTexts(
  userId: string,
  texts: readonly string[],
): Promise<{ action: SecretHandlingOutcome['action']; texts: string[] }> {
  const present = texts.filter((text) => text.length > 0);
  if (present.length === 0) return { action: 'clean', texts: [...texts] };

  const detections = scanForSecrets(present.join(MESSAGE_SCAN_BOUNDARY));
  if (detections.length === 0) return { action: 'clean', texts: [...texts] };

  const { mode } = await resolveSecretHandlingPolicy(getNeonDb(), userId);
  const { high } = partitionByConfidence(detections);
  if (high.length === 0) return { action: 'warned', texts: [...texts] };

  const action = actionForMode(mode);
  if (action !== 'redacted') return { action, texts: [...texts] };

  const names = new Set(high.map((detection) => detection.name));
  const redacted = texts.map((text) => (text ? redactSecrets(text, names) : text));
  const residue = scanForSecrets(redacted.join(MESSAGE_SCAN_BOUNDARY)).filter((detection) =>
    names.has(detection.name),
  );
  if (residue.length > 0) return { action: 'blocked', texts: [...texts] };

  return { action: 'redacted', texts: redacted };
}

export async function applySecretHandlingToRequest(
  userId: string,
  request: NextRequest,
  processed: ProcessedRequest,
): Promise<SecretHandlingOutcome> {
  const spans = collectMessageSpans(processed.llmRequest.messages);
  const joined = spans.map((span) => span.text).join(MESSAGE_SCAN_BOUNDARY);
  const detections = scanForSecrets(joined);

  if (detections.length === 0) {
    return { action: 'clean', patternNames: [], matchCount: 0, notice: null };
  }

  const { mode, organizationId } = await resolveSecretHandlingPolicy(getNeonDb(), userId);
  const { high: highConfidenceDetections, low: lowConfidenceDetections } =
    partitionByConfidence(detections);
  const hasHighConfidence = highConfidenceDetections.length > 0;
  let action = hasHighConfidence ? actionForMode(mode) : 'warned';
  const relevantDetections = hasHighConfidence ? highConfidenceDetections : lowConfidenceDetections;
  const patternNames = [...new Set(relevantDetections.map((detection) => detection.name))];
  let notice: string | null = null;

  if (action === 'redacted') {
    const highConfidenceNames = new Set(
      highConfidenceDetections.map((detection) => detection.name),
    );

    // Redacted one span at a time. Joining the spans, redacting the join and
    // splitting it apart again loses the mapping whenever a replacement eats a
    // boundary, and the fallback for a short split was the caller's own
    // unredacted text.
    const redactedTexts = spans.map((span) => redactSecrets(span.text, highConfidenceNames));

    const residue = scanForSecrets(redactedTexts.join(MESSAGE_SCAN_BOUNDARY)).filter((detection) =>
      highConfidenceNames.has(detection.name),
    );

    if (residue.length > 0) {
      logger.error(
        { userId, organizationId, patternNames: [...new Set(residue.map((d) => d.name))] },
        '[secret-handling] redaction left a high-confidence match; refusing the turn',
      );
      action = 'blocked';
    } else {
      processed.llmRequest.messages = applyRedactedSpans(
        processed.llmRequest.messages,
        spans,
        redactedTexts,
      );
      notice = buildSecretRedactionNotice(highConfidenceDetections.length);
    }
  }

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
      count: relevantDetections.length,
      status: action,
    },
  }).catch((error) => {
    logger.error({ error, userId }, '[secret-handling] audit event could not be recorded');
  });

  return { action, patternNames, matchCount: relevantDetections.length, notice };
}
