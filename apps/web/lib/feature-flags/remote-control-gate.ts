import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { isAppError } from '@/lib/errors';
import { readSurfaceHint } from '@/lib/free-chat-surface-policy';

import { assertCapabilityAvailable } from './capability-gate';
import { buildFlagSubject } from './flag-evaluation-service';
import { SCREEN_SHARE_CAPABILITY } from './kill-switches';

const REMOTE_CONTROL_LABEL = 'Remote Control';

/**
 * Remote Control is governed by the screen share switch
 * (packages/contracts/types/src/feature-registry.json), so a pairing is refused
 * while it is closed and the refusal says why, in the shape pairing answers in.
 */
export async function remoteControlRefusal(
  request: NextRequest,
  userId: string,
): Promise<NextResponse | null> {
  const subject = buildFlagSubject(request, {
    userId,
    workspaceId: null,
    role: null,
    plan: null,
    surface: readSurfaceHint(request),
  });
  try {
    await assertCapabilityAvailable(subject, SCREEN_SHARE_CAPABILITY, REMOTE_CONTROL_LABEL);
    return null;
  } catch (error) {
    if (!isAppError(error)) throw error;
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
}
