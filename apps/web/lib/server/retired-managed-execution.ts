import 'server-only';

import { NextResponse } from 'next/server';

const RETIRED_MANAGED_EXECUTION_RESPONSE = {
  error: 'This duplicate managed execution endpoint has been retired.',
  code: 'CANONICAL_COMPLETION_REQUIRED',
  completion_url: '/api/llm/v1/chat/completions',
} as const;

export function retiredManagedExecutionResponse(headers?: HeadersInit): NextResponse {
  return NextResponse.json(RETIRED_MANAGED_EXECUTION_RESPONSE, {
    status: 410,
    ...(headers ? { headers } : {}),
  });
}
