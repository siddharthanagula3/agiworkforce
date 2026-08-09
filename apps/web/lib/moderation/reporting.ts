import 'server-only';

import { logger } from '@/lib/logger';
import { sha256Hex } from './hash-denylist';
import type { ModerationCategory } from './text-classifier';

/**
 * Where a moderation decision goes after it is made.
 *
 * Refusing a request is only half of the obligation; the other half is that
 * somebody can find out it happened. Every block and every flag lands in the
 * structured log under a single stable `[moderation]` prefix, at error level
 * for a block and warn for a flag, so alerting and retention pick it up the
 * same way they pick up every other server event.
 *
 * The record carries a SHA-256 of the offending text and never the text
 * itself. The digest is enough to correlate repeat offenders and to prove two
 * requests were identical, whereas putting prompt bodies in the application
 * log is a privacy commitment nobody made when they signed up. There is no
 * flag to turn that around, because the flag would be the whole risk.
 *
 * This is a log, not an escalation pipeline: nothing here opens a case or
 * files a jurisdictional report. Routing `[moderation]` records to a review
 * queue is real work with a recipient behind it, and it is not done.
 */

export type ModerationSurface = 'managed-chat' | 'upload';

export interface ModerationEvent {
  surface: ModerationSurface;
  action: 'block' | 'flag';
  categories: readonly ModerationCategory[] | readonly string[];
  ruleIds: readonly string[];
  userId: string;
  /** Prompt text for a chat event. Hashed; never recorded verbatim. */
  text?: string;
  /** SHA-256 of uploaded bytes, for an upload event. */
  contentSha256?: string;
  /** Provenance of the denylist that matched, when one did. */
  listLabel?: string;
  storageKey?: string;
}

function buildReport(event: ModerationEvent): Record<string, unknown> {
  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
    surface: event.surface,
    action: event.action,
    categories: [...event.categories],
    ruleIds: [...event.ruleIds],
    userId: event.userId,
  };
  if (event.text !== undefined) report['textSha256'] = sha256Hex(Buffer.from(event.text, 'utf8'));
  if (event.contentSha256 !== undefined) report['contentSha256'] = event.contentSha256;
  if (event.listLabel !== undefined) report['listLabel'] = event.listLabel;
  if (event.storageKey !== undefined) report['storageKey'] = event.storageKey;
  return report;
}

export function recordModerationEvent(event: ModerationEvent): void {
  const report = buildReport(event);
  if (event.action === 'block') {
    logger.error(report, '[moderation] blocked content');
  } else {
    logger.warn(report, '[moderation] flagged content for review');
  }
}
