import 'server-only';

import { logger } from '@/lib/logger';
import { sha256Hex } from './hash-denylist';
import type { ModerationCategory } from './text-classifier';

export type ModerationSurface = 'managed-chat' | 'managed-video' | 'upload';

export interface ModerationEvent {
  surface: ModerationSurface;
  action: 'block' | 'flag';
  categories: readonly ModerationCategory[] | readonly string[];
  ruleIds: readonly string[];
  userId: string;
  text?: string;
  contentSha256?: string;
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
