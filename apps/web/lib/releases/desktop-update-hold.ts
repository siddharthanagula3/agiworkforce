import 'server-only';

import type { NextRequest } from 'next/server';

import { readKillSwitchGate } from '@/lib/feature-flags/capability-gate';
import {
  buildFlagSubject,
  normalizeClientVersion,
} from '@/lib/feature-flags/flag-evaluation-service';
import { DESKTOP_UPDATE_CAPABILITY } from '@/lib/feature-flags/kill-switches';

const UPDATE_FEED_SUBJECT_ID = 'anonymous';
const DESKTOP_SURFACE = 'desktop';

/**
 * Whether an operator is holding desktop updates back from the build asking.
 * The update feeds are anonymous, so the switch is asked for the reporting
 * version rather than for an account.
 */
export async function desktopUpdateHeld(
  request: NextRequest,
  reportedVersion?: string,
): Promise<boolean> {
  const subject = buildFlagSubject(request, {
    userId: UPDATE_FEED_SUBJECT_ID,
    workspaceId: null,
    role: null,
    plan: null,
    surface: DESKTOP_SURFACE,
  });
  const gate = await readKillSwitchGate(
    reportedVersion === undefined
      ? subject
      : { ...subject, clientVersion: normalizeClientVersion(reportedVersion) },
  );
  return !gate.capabilityAllowed(DESKTOP_UPDATE_CAPABILITY);
}
