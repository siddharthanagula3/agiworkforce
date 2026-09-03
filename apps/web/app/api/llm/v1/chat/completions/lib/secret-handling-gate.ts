import 'server-only';

import type { NextRequest } from 'next/server';
import type { SecretHandlingMode } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { redactSecrets, scanForSecrets } from '@/lib/security/secrets-audit';
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
    const text = redactedTexts[spanIndex] ?? span.text;
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
}

function actionForMode(mode: SecretHandlingMode): 'warned' | 'redacted' | 'blocked' {
  if (mode === 'block') return 'blocked';
  if (mode === 'redact') return 'redacted';
  return 'warned';
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
    return { action: 'clean', patternNames: [], matchCount: 0 };
  }

  const { mode, organizationId } = await resolveSecretHandlingPolicy(getNeonDb(), userId, request);
  const action = actionForMode(mode);
  const patternNames = [...new Set(detections.map((detection) => detection.name))];

  if (action === 'redacted') {
    const redactedTexts = redactSecrets(joined).split(MESSAGE_SCAN_BOUNDARY);
    processed.llmRequest.messages = applyRedactedSpans(
      processed.llmRequest.messages,
      spans,
      redactedTexts,
    );
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
      count: detections.length,
      status: action,
    },
  }).catch((error) => {
    logger.error({ error, userId }, '[secret-handling] audit event could not be recorded');
  });

  return { action, patternNames, matchCount: detections.length };
}
