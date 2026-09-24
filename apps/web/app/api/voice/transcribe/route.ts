import 'server-only';

import type { NextRequest } from 'next/server';

import { assertCapabilityAvailable } from '@/lib/feature-flags/capability-gate';
import { buildFlagSubject } from '@/lib/feature-flags/flag-evaluation-service';
import { DICTATION_CAPABILITY } from '@/lib/feature-flags/kill-switches';
import { readSurfaceHint } from '@/lib/free-chat-surface-policy';

import { transcriptionsHandler } from '../../llm/v1/audio/transcriptions/route';

export { OPTIONS } from '../../llm/v1/audio/transcriptions/route';

export const runtime = 'nodejs';

const DICTATION_LABEL = 'Dictation';

async function admitDictation(request: NextRequest, userId: string): Promise<void> {
  const subject = buildFlagSubject(request, {
    userId,
    workspaceId: null,
    role: null,
    plan: null,
    surface: readSurfaceHint(request),
  });
  await assertCapabilityAvailable(subject, DICTATION_CAPABILITY, DICTATION_LABEL);
}

export const POST = transcriptionsHandler(admitDictation);
