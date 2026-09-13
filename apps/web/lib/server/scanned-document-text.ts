import 'server-only';

import { estimateTokens } from '@agiworkforce/routing';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  buildServerProviderAdapter,
  listAvailableManagedProviderIds,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { resolveWebCloudModelRoute } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import {
  fingerprintManagedUsageRequest,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';

/**
 * The note a stored transcription carries.
 *
 * A scan has no text layer, so what lands in the knowledge store was read off
 * a picture by a model rather than lifted out of the file. Anything built on
 * it, an answer, a citation, an export, is downstream of a reading that can be
 * wrong, and the row has to say so where a reader will see it.
 */
export const SCANNED_DOCUMENT_OCR_NOTE =
  '[Recognised from page images. This document had no text layer, so the text below was read from the scan by a model and may contain mistakes.]';

const OCR_SYSTEM_PROMPT =
  'You transcribe scanned document pages. Return the text exactly as it appears, in reading order, preserving headings, lists and table rows as plain lines. Do not summarise, explain, translate, or add anything that is not printed on the page. If a page is blank or unreadable, return nothing for it.';
const OCR_USER_PROMPT =
  'Transcribe every page image below, in order. Return only the transcribed text.';

const MAX_OCR_OUTPUT_TOKENS = 4_000;
const OCR_TASK_TYPE = 'multimodal' as const;
const OCR_LEASE_SECONDS = 120;

export interface ScannedPageImage {
  mimeType: 'image/png';
  base64: string;
}

export interface TranscribeScannedPagesInput {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string;
  documentId: string;
  pageImages: readonly ScannedPageImage[];
}

/**
 * Reads a scan's page images back as text, on the same managed routes and the
 * same reservation discipline every other server-side model call uses.
 *
 * Returns null rather than throwing: a scan that could not be read is a
 * knowledge file with no text, which the store already handles, and failing the
 * upload over it would take away the file the reader can still open by hand.
 */
export async function transcribeScannedPages(
  input: TranscribeScannedPagesInput,
): Promise<string | null> {
  if (input.pageImages.length === 0) return null;

  const route = resolveWebCloudModelRoute(
    'auto',
    input.planTier,
    OCR_TASK_TYPE,
    undefined,
    undefined,
    undefined,
    listAvailableManagedProviderIds(),
  );
  if (route.status !== 'selected') {
    logger.warn(
      { documentId: input.documentId, routeCode: route.code },
      '[ocr] no managed vision route is available; the scan is stored without text',
    );
    return null;
  }

  const chatRequest = openAIWireRequestToChatRequest({
    model: route.providerModelId,
    messages: [
      { role: 'system', content: OCR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: OCR_USER_PROMPT },
          ...input.pageImages.map((page) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${page.mimeType};base64,${page.base64}` },
          })),
        ],
      },
    ],
    max_tokens: MAX_OCR_OUTPUT_TOKENS,
    temperature: 0,
    stream: false,
  });

  const estimatedPromptTokens =
    estimateTokens(`${OCR_SYSTEM_PROMPT}\n${OCR_USER_PROMPT}`, route.modelKey) +
    input.pageImages.reduce((total, page) => total + Math.ceil(page.base64.length / 4 / 3), 0);
  const reservation = await reserveManagedUsageRequest({
    db: input.db,
    userId: input.userId,
    organizationId: input.organizationId,
    idempotencyKey: `scanned-document-ocr:${input.documentId}`,
    requestHash: fingerprintManagedUsageRequest({
      kind: 'scanned_document_ocr',
      documentId: input.documentId,
      pageCount: input.pageImages.length,
      provider: route.provider,
      model: route.modelKey,
    }),
    provider: route.provider,
    model: route.modelKey,
    estimatedCostCents: LLMCostCalculator.estimateCost(
      route.provider,
      route.modelKey,
      estimatedPromptTokens,
      MAX_OCR_OUTPUT_TOKENS,
    ),
    leaseSeconds: OCR_LEASE_SECONDS,
    planTier: input.planTier,
    isFlagship: false,
  });

  let providerCompleted = false;
  try {
    await markManagedUsageProviderStarted(reservation);
    const response = await drainToLlmResponse(
      buildServerProviderAdapter(route.provider).stream(chatRequest, new AbortController().signal),
      route.modelKey,
      (chunk) => toGenericUpstreamError(route.provider, chunk),
      resolveWireMode(route.provider),
    );
    providerCompleted = true;

    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostCents: LLMCostCalculator.calculateCost(route.provider, response.model, {
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
      }),
      usage: {
        type: 'scanned_document_ocr',
        documentId: input.documentId,
        pageCount: input.pageImages.length,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
      },
    });

    const text = response.content.trim();
    return text.length > 0 ? text : null;
  } catch (error) {
    logger.warn(
      { err: error, documentId: input.documentId },
      '[ocr] scanned page transcription failed; the document is stored without text',
    );
    if (!providerCompleted) {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostCents: 0,
        usage: {
          type: 'scanned_document_ocr',
          documentId: input.documentId,
          reason: error instanceof Error ? error.message : String(error),
        },
      }).catch((releaseError: unknown) => {
        logger.error(
          { releaseError, documentId: input.documentId },
          '[ocr] reservation release failed',
        );
      });
    }
    return null;
  }
}
