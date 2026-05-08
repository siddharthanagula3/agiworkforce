import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * B4 fix: validate that the first 12 bytes of an upload look like a known
 * audio container/codec. MIME type from `multipart/form-data` is
 * client-supplied and trivially forgeable; magic-byte sniffing makes the
 * MIME allowlist a check on actual content rather than the client's claim.
 *
 * Signatures covered:
 *   - ID3 / 0xFFFB / 0xFFF3 / 0xFFF2 — MP3
 *   - "RIFF" ... "WAVE" — WAV
 *   - "OggS" — Ogg (Vorbis/Opus)
 *   - "ftyp" at offset 4 — MP4 / M4A
 *   - "fLaC" — FLAC
 *   - 0x1A 0x45 0xDF 0xA3 — Matroska/WebM (EBML)
 */
function isLikelyAudio(head: Uint8Array): boolean {
  if (head.length < 4) return false;
  // ID3v2 (most MP3s)
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true;
  // MP3 frame sync (0xFFE0..0xFFFF mask)
  if (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) return true;
  // RIFF .... WAVE
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
  // OggS
  if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return true;
  // ftyp at offset 4 (MP4 / M4A)
  if (
    head.length >= 8 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  )
    return true;
  // fLaC
  if (head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) return true;
  // EBML (Matroska / WebM)
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return true;
  return false;
}

async function handleTranscriptions(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;

  const rateLimitResponse = await withRateLimit(request, 'audio-transcription');
  if (rateLimitResponse) return rateLimitResponse;

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      {
        error: {
          message: 'Missing or invalid authorization header',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const token = authHeader.substring(7);
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabase = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return NextResponse.json(
      {
        error: {
          message: 'Authentication failed',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
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

  // SEV-WEB-04 fix: cap upload size and validate MIME type before forwarding
  // to OpenAI. Without this, an authenticated user can send /dev/zero to
  // exhaust serverless function memory or upload arbitrary file types
  // (PDFs, executables) that bypass the proxy's content-type policy.
  // OpenAI's Whisper API has its own 25 MB limit; rejecting earlier saves
  // bandwidth and prevents per-request OOM on Vercel functions.
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
  // B4 fix: default-reject when MIME is missing OR not in the allowlist.
  // Previously `if (file.type && ...)` short-circuited on falsy `file.type`,
  // letting an attacker upload arbitrary content with no Content-Type and
  // bypass the proxy's MIME policy.
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
  // B4 fix: MIME is client-supplied and forgeable. Sniff the first 12 bytes
  // and confirm at least one of the major audio container/codec signatures
  // matches before forwarding to OpenAI.
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

  const ALLOWED_MODELS = ['whisper-1', 'whisper-large-v3'];
  const modelValue = formData.get('model');
  const model =
    typeof modelValue === 'string' && ALLOWED_MODELS.includes(modelValue)
      ? modelValue
      : 'whisper-1';

  const forwardForm = new FormData();
  forwardForm.append('file', file);
  forwardForm.append('model', model);

  const language = formData.get('language');
  if (typeof language === 'string' && language.trim()) {
    forwardForm.append('language', language);
  }

  const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
    },
    body: forwardForm,
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
