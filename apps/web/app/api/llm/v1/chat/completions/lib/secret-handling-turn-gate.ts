import 'server-only';

import type { NextRequest } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { scanForSecrets } from '@/lib/security/secrets-audit';
import {
  MESSAGE_SCAN_BOUNDARY,
  partitionByConfidence,
  recordSecretDetection,
  type SecretHandlingAction,
} from './secret-detection';
import { applySecretHandlingToTexts } from './secret-handling-gate';

// The decision stays `applySecretHandlingToTexts`'s own, so a turn gated here
// can never be redacted or blocked differently from one gated there.
export async function applySecretHandlingToTurnTexts(
  userId: string,
  request: NextRequest,
  texts: readonly string[],
): Promise<{ action: SecretHandlingAction; texts: string[]; matchCount: number }> {
  const outcome = await applySecretHandlingToTexts(userId, texts);
  if (outcome.action === 'clean') return { ...outcome, matchCount: 0 };

  const detections = scanForSecrets(
    texts.filter((text) => text.length > 0).join(MESSAGE_SCAN_BOUNDARY),
  );
  const { high, low } = partitionByConfidence(detections);
  const relevant = high.length > 0 ? high : low;
  const { organizationId } = await resolveSecretHandlingPolicy(getNeonDb(), userId);
  await recordSecretDetection({
    userId,
    organizationId,
    request,
    action: outcome.action,
    patternNames: [...new Set(relevant.map((detection) => detection.name))],
    matchCount: relevant.length,
  });
  return { ...outcome, matchCount: relevant.length };
}
