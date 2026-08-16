import { NextRequest, NextResponse } from 'next/server';

const RETIRED_BODY = {
  error: {
    code: 'prompt_completion_retired',
    message: 'Prompt autocomplete is not available.',
  },
} as const;

export function POST(_request: NextRequest): NextResponse {
  return NextResponse.json(RETIRED_BODY, { status: 410 });
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
