import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';

/**
 * Video Generation Status API
 * Endpoint: GET /api/media/video/status?task_id=xxx
 *
 * Polls the status of a video generation task from Runway or Google Veo.
 * The frontend should poll this endpoint every 3–5 seconds until status
 * is "completed" or "failed". Maximum poll window: 5 minutes.
 */

// Each status check is a single outbound HTTP call and should complete quickly.
export const maxDuration = 30;
export const runtime = 'nodejs';

// Response types
interface VideoStatusResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';
  video_url?: string;
  thumbnail_url?: string;
  progress?: number;
  error?: string;
}

// Runway task status response
// Ref: GET https://api.dev.runwayml.com/v1/tasks/{id}
interface RunwayTaskStatusResponse {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  progress?: number;
  output?: string[];
  failure?: string;
  failureCode?: string;
  createdAt?: string;
  estimatedTimeToComplete?: number;
}

// Google long-running operation status response
// Ref: GET https://generativelanguage.googleapis.com/v1beta/{operation_name}
interface GoogleOperationResponse {
  name: string;
  metadata?: {
    '@type': string;
    state?: 'STATE_UNSPECIFIED' | 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
    progress?: number;
  };
  done?: boolean;
  error?: {
    code: number;
    message: string;
  };
  response?: {
    '@type': string;
    // Veo 3.x response format
    generatedSamples?: Array<{
      video?: {
        uri?: string;
        bytesBase64Encoded?: string;
      };
    }>;
    // Alternative format seen in some API versions
    videos?: Array<{
      video?: {
        uri?: string;
        bytesBase64Encoded?: string;
      };
    }>;
  };
}

/**
 * Extract provider and original task ID from our composite task ID.
 * Format: "{provider}_{originalId}" e.g. "runway_abc123" or "google_xyz789"
 */
function parseTaskId(taskId: string): { provider: 'runway' | 'google'; originalId: string } {
  if (taskId.startsWith('runway_')) {
    const originalId = taskId.substring(7);
    // Runway task IDs are UUIDs or alphanumeric strings
    if (!/^[a-zA-Z0-9_-]+$/.test(originalId)) {
      throw createError.validation('Invalid task_id: contains disallowed characters');
    }
    return { provider: 'runway', originalId };
  }
  if (taskId.startsWith('google_')) {
    const originalId = taskId.substring(7);
    // Google operation IDs are numeric or alphanumeric
    if (!/^[a-zA-Z0-9_-]+$/.test(originalId)) {
      throw createError.validation('Invalid task_id: contains disallowed characters');
    }
    return { provider: 'google', originalId };
  }
  throw createError.validation('Invalid task_id format. Expected "runway_..." or "google_..."');
}

/**
 * Get video status from Runway API
 * Endpoint: GET https://api.dev.runwayml.com/v1/tasks/{id}
 * Auth: Authorization: Bearer {RUNWAY_API_KEY}
 * Required header: X-Runway-Version: 2024-11-06
 */
async function getRunwayStatus(taskId: string): Promise<VideoStatusResponse> {
  const apiKey = process.env['RUNWAY_API_KEY'];
  if (!apiKey) {
    throw createError.serviceUnavailable('Runway API not configured');
  }

  const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Runway-Version': '2024-11-06',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw createError.notFound('Video generation task not found');
    }
    if (response.status === 401) {
      throw createError.serviceUnavailable('Video service authentication failed');
    }

    const errorText = await response.text();
    logger.error({ status: response.status, error: errorText }, 'Runway status API error');
    throw createError.internal('Failed to get video generation status');
  }

  const result = (await response.json()) as RunwayTaskStatusResponse;

  // Map Runway statuses to our unified status vocabulary
  let status: VideoStatusResponse['status'];
  switch (result.status) {
    case 'PENDING':
      status = 'queued';
      break;
    case 'RUNNING':
      status = 'processing';
      break;
    case 'SUCCEEDED':
      status = 'completed';
      break;
    case 'FAILED':
    case 'CANCELLED':
      status = 'failed';
      break;
    default:
      status = 'processing';
  }

  const statusResponse: VideoStatusResponse = {
    success: true,
    task_id: `runway_${taskId}`,
    status,
    progress: result.progress,
  };

  if (status === 'completed' && result.output && result.output.length > 0) {
    statusResponse.video_url = result.output[0];
  }

  if (status === 'failed' && result.failure) {
    statusResponse.error = result.failure;
  }

  return statusResponse;
}

/**
 * Get video status from Google Veo via long-running operation polling
 * Endpoint: GET https://generativelanguage.googleapis.com/v1beta/operations/{id}
 * Auth: x-goog-api-key header
 *
 * The operation name returned by /predictLongRunning is "operations/{id}".
 * We store only the numeric/alphanumeric ID portion and reconstruct the path here.
 */
async function getGoogleVeoStatus(operationId: string): Promise<VideoStatusResponse> {
  const apiKey = process.env['GOOGLE_API_KEY'];
  if (!apiKey) {
    throw createError.serviceUnavailable('Google Veo API not configured');
  }

  // Full operation name: "operations/{operationId}"
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/operations/${operationId}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw createError.notFound('Video generation task not found');
    }
    if (response.status === 401 || response.status === 403) {
      throw createError.serviceUnavailable('Video service authentication failed');
    }

    const errorText = await response.text();
    logger.error({ status: response.status, error: errorText }, 'Google Veo status API error');
    throw createError.internal('Failed to get video generation status');
  }

  const result = (await response.json()) as GoogleOperationResponse;

  // Determine our unified status from the operation response
  let status: VideoStatusResponse['status'];
  if (result.error) {
    status = 'failed';
  } else if (result.done) {
    status = 'completed';
  } else if (result.metadata?.state) {
    switch (result.metadata.state) {
      case 'PENDING':
        status = 'queued';
        break;
      case 'RUNNING':
        status = 'processing';
        break;
      case 'SUCCEEDED':
        status = 'completed';
        break;
      case 'FAILED':
      case 'CANCELLED':
        status = 'failed';
        break;
      default:
        status = 'processing';
    }
  } else {
    status = 'processing';
  }

  const statusResponse: VideoStatusResponse = {
    success: true,
    task_id: `google_${operationId}`,
    status,
    progress: result.metadata?.progress,
  };

  // Extract video URL when completed — handle both response shapes Veo may return
  if (status === 'completed' && result.response) {
    const samples = result.response.generatedSamples ?? result.response.videos ?? [];
    if (samples.length > 0) {
      const firstVideo = samples[0]?.video;
      if (firstVideo?.uri) {
        statusResponse.video_url = firstVideo.uri;
      } else if (firstVideo?.bytesBase64Encoded) {
        // Embed as data URI if the provider returns inline base64
        statusResponse.video_url = `data:video/mp4;base64,${firstVideo.bytesBase64Encoded}`;
      }
    }
  }

  if (status === 'failed' && result.error) {
    statusResponse.error = result.error.message || 'Video generation failed';
  }

  return statusResponse;
}

/**
 * Main handler for video status polling
 */
async function handleVideoStatus(request: NextRequest): Promise<NextResponse> {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Rate limiting: Allow frequent polling (status checks are cheap)
  const rateLimitResponse = await withRateLimit(request, 'video-status');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Authentication via Bearer token
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createError.unauthorized('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);

  // Verify user with Supabase
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, flowType: 'pkce' },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    logger.warn({ error: authError }, 'Video status auth failed');
    throw createError.unauthorized('Invalid authentication token');
  }

  // Get task_id from query params
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('task_id');

  if (!taskId) {
    throw createError.validation('Missing required parameter: task_id');
  }

  // Parse task ID to determine provider and get the original provider-side ID
  const { provider, originalId } = parseTaskId(taskId);

  // TODO: [H33] task ownership verification — requires storing task_id → user_id mapping at creation time
  // A proper fix: at creation time (generate/route.ts), store { task_id, user_id } in Redis/Supabase,
  // then here look up the mapping and reject if user.id !== storedUserId.
  logger.warn(
    { hasTaskId: !!taskId, hasUserId: !!user?.id },
    'Video task status called without ownership verification',
  );

  logger.info(
    {
      userId: user.id,
      taskId,
      provider,
    },
    'Checking video generation status',
  );

  // Fetch status from the appropriate provider
  let statusResponse: VideoStatusResponse;

  try {
    if (provider === 'runway') {
      statusResponse = await getRunwayStatus(originalId);
    } else {
      statusResponse = await getGoogleVeoStatus(originalId);
    }
  } catch (error) {
    // Re-throw AppError instances (from createError.*)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    logger.error({ error, provider, taskId }, 'Failed to get video status');
    throw createError.internal('Failed to get video generation status');
  }

  logger.info(
    {
      userId: user.id,
      taskId,
      status: statusResponse.status,
      hasVideoUrl: !!statusResponse.video_url,
    },
    'Video status retrieved',
  );

  return NextResponse.json(statusResponse, {
    headers: {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  });
}

export const GET = withErrorHandler(handleVideoStatus);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
