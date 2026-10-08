import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..', '..', '..');

const TRANSACTIONAL_SENDERS = [
  'app/api/copyright-notice/route.ts',
  'app/api/cron/enforce-billing-collection/route.ts',
  'app/api/cron/evaluate-model-rollout/route.ts',
  'app/api/cron/reconcile-billed-plans/route.ts',
  'app/api/cron/reconcile-credits/route.ts',
  'app/api/privacy/requests/route.ts',
  'app/api/settings/team/invitations/invitation-email.ts',
  'lib/authorization/escalation.ts',
  'lib/server/free-quota-renewal.ts',
  'lib/server/incident/dispatch.ts',
  'lib/services/auto-reload-service.ts',
  'lib/services/billing-notice-service.ts',
  'lib/services/notification-email-service.ts',
  'lib/services/video-incident-alert-service.ts',
  'lib/support/handoff/escalation-email.ts',
  'lib/support/handoff/resend-client.ts',
];

const DIRECT_SEND = /\b(sendTransactionalEmail|sendBulkTransactionalEmail|sendSupportEmail)\(/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(entry) && !/\.(test|spec)\.tsx?$/u.test(entry) ? [path] : [];
  });
}

describe('no marketing email leaves without the marketing email consent', () => {
  it('sends email only from the reviewed transactional senders, so a marketing sender cannot appear unreviewed', () => {
    const senders = ['app', 'lib', 'features', 'shared']
      .flatMap((dir) => sourceFiles(join(WEB_ROOT, dir)))
      .filter((file) => DIRECT_SEND.test(readFileSync(file, 'utf8')))
      .map((file) => relative(WEB_ROOT, file).split(sep).join('/'))
      .sort();

    expect(senders).toEqual(TRANSACTIONAL_SENDERS);
  });
});
