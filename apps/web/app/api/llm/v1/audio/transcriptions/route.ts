import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';

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
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, flowType: 'pkce' },
  });

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
