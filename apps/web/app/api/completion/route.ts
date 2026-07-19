import { NextRequest, NextResponse } from 'next/server';

const RETIRED_BODY = {
  error: {
    code: 'prompt_completion_retired',
    message: 'Prompt autocomplete is not available.',
  },
} as const;

/**
 * Per-keystroke managed prompt completion was a second, unreserved provider
 * spend path. Keep a stable retirement response so old clients fail closed;
 * normal chat and AGI Work continue through the canonical completion route.
 */
export function POST(_request: NextRequest): NextResponse {
  return NextResponse.json(RETIRED_BODY, { status: 410 });
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
