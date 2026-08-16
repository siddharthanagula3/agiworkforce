import 'server-only';

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@shared/utils/env';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import { getModelMetadataById, getRoutingSlotModel, isModelLive } from '@agiworkforce/types';
import { providerApiUrl } from '@/lib/server/provider-endpoints';

function isLikelyAudio(head: Uint8Array): boolean {
  if (head.length < 4) return false;
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true;
  if (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) return true;
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x41 &&
    head[10] === 0x56 &&
    head[11] === 0x45
  )
    return true;
  if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return true;
  if (
    head.length >= 8 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  )
    return true;
  if (head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) return true;
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return true;
  return false;
}

async function handleTranscriptions(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'audio-transcription');
  if (rateLimitResponse) return rateLimitResponse;

  await getClerkAuthUser(request, { apiKeyScope: 'inference:write' });

  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    {
      provider: 'openai',
      model: 'audio-transcription',
      feature: 'audio_transcription',
    },
    {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  );
  if (managedGateResponse) return managedGateResponse;

  let formData: FormData;
  try {
    formData = (await request.formData()) as unknown as FormData;
  } catch (err) {
    logger.error({ err }, 'Failed to parse transcription form data');
    return NextResponse.json(
      {
        error: {
          message: 'Invalid multipart form data',
          type: 'invalid_request_error',
        },
      },
      {
        status: 400,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json(
      {
        error: {
          message: 'Missing audio file',
          type: 'invalid_request_error',
        },
      },
      {
        status: 400,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const ALLOWED_AUDIO_TYPES = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/flac',
  ]);
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        error: {
          message: `Audio file exceeds maximum size of ${MAX_AUDIO_BYTES} bytes`,
          type: 'invalid_request_error',
        },
      },
      {
        status: 413,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }
  if (!file.type || !ALLOWED_AUDIO_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: {
          message: `Unsupported or missing audio MIME type: ${file.type || '<missing>'}`,
          type: 'invalid_request_error',
        },
      },
      {
        status: 415,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }
  const headBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!isLikelyAudio(headBytes)) {
    return NextResponse.json(
      {
        error: {
          message: 'Audio file content does not match a supported audio format',
          type: 'invalid_request_error',
        },
      },
      {
        status: 415,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const defaultModelId = getRoutingSlotModel('voice_transcription');
  const defaultModel = getModelMetadataById(defaultModelId);
  if (
    !defaultModel ||
    defaultModel.provider !== 'openai' ||
    defaultModel.modelType !== 'stt' ||
    !isModelLive(defaultModel)
  ) {
    throw new Error('The canonical voice_transcription slot is not a live OpenAI STT model');
  }

  const modelValue = formData.get('model');
  const requestedModel = typeof modelValue === 'string' ? getModelMetadataById(modelValue) : null;
  const selectedModel =
    requestedModel?.provider === 'openai' &&
    requestedModel.modelType === 'stt' &&
    requestedModel.status !== 'deprecated' &&
    isModelLive(requestedModel)
      ? requestedModel
      : defaultModel;
  const model = selectedModel.apiModelId ?? selectedModel.id;

  const forwardForm = new FormData();
  forwardForm.append('file', file);
  forwardForm.append('model', model);

  const language = formData.get('language');
  if (typeof language === 'string' && language.trim()) {
    forwardForm.append('language', language);
  }

  const response = await fetch(providerApiUrl('openai', 'audio/transcriptions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
    },
    body: forwardForm,
    signal: AbortSignal.timeout(60_000),
  });

  const responseText = await response.text();

  if (!response.ok) {
    logger.warn({ status: response.status, body: responseText }, 'Transcription proxy failed');
    return NextResponse.json(
      {
        error: {
          message: responseText || 'Transcription failed',
          type: 'api_error',
        },
      },
      {
        status: response.status,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(responseText);
  } catch {
    return new NextResponse(responseText, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'text/plain',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    });
  }

  return NextResponse.json(json, {
    headers: {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  });
}

export const POST = withErrorHandler(handleTranscriptions);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
