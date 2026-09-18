import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(import.meta.dirname, '../../../..');
const SCANNED_DIRECTORIES = ['app', 'components', 'features', 'lib', 'shared'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const STRIPE_SDK_IMPORT = /(?:^|\n)\s*import\s[^;]*?from\s+['"]stripe['"]/;

/**
 * The files that still speak the Stripe SDK directly: the webhook, the routes
 * that create Stripe objects, and the adapter under lib/server/payments. This
 * list may shrink, never grow. Anything else reaches Stripe through the
 * PaymentProvider adapter and sees only normalized domain objects.
 */
const STRIPE_INTEGRATION_LAYER: ReadonlySet<string> = new Set([
  'app/api/billing/payment-methods/route.ts',
  'app/api/checkout/route.ts',
  'app/api/portal/route.ts',
  'app/api/stripe-webhook/lib/db.ts',
  'app/api/stripe-webhook/lib/handlers.ts',
  'app/api/stripe-webhook/lib/india-mandate.ts',
  'app/api/stripe-webhook/lib/seats.ts',
  'app/api/stripe-webhook/lib/subscription-status.ts',
  'app/api/stripe-webhook/lib/verify.ts',
  'app/api/upgrade/preview/route.ts',
  'app/api/upgrade/route.ts',
  'lib/billing/tax-policy.ts',
  'lib/billing/trial-policy.ts',
  'lib/server/payments/stripe-provider.ts',
  'lib/server/stripe-client.ts',
  'lib/server/stripe-plan-change.ts',
  'lib/server/stripe-upgrade-subscription.ts',
  'lib/services/enterprise-billing-service.ts',
  'lib/services/enterprise-usage-metering.ts',
  'lib/services/stripe-settlement-reconciliation-service.ts',
  'lib/services/subscription-service.ts',
  'lib/stripe-config.ts',
  'lib/stripe-types.ts',
]);

const RENDERED_SURFACE =
  /(^|\/)(app\/.*\/(page|layout|template)\.tsx|features\/|components\/|shared\/components\/)/;

function isTestFile(relativePath: string): boolean {
  return /(^|\/)__tests__\//.test(relativePath) || /\.(test|spec)\.tsx?$/.test(relativePath);
}

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (absolute: string) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) {
        walk(child);
        continue;
      }
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
      const relative = path.relative(WEB_ROOT, child);
      if (isTestFile(relative)) continue;
      found.push(relative);
    }
  };
  for (const directory of SCANNED_DIRECTORIES) {
    const absolute = path.join(WEB_ROOT, directory);
    if (fs.existsSync(absolute)) walk(absolute);
  }
  return found.sort();
}

const stripeImporters = sourceFiles().filter((relative) =>
  STRIPE_SDK_IMPORT.test(fs.readFileSync(path.join(WEB_ROOT, relative), 'utf8')),
);

describe('Stripe SDK import boundary', () => {
  it('keeps the raw Stripe SDK inside the integration layer', () => {
    const outside = stripeImporters.filter((file) => !STRIPE_INTEGRATION_LAYER.has(file));
    expect(outside).toEqual([]);
  });

  it('never lets a rendered surface import a Stripe SDK type', () => {
    expect(stripeImporters.filter((file) => RENDERED_SURFACE.test(file))).toEqual([]);
  });

  it('is a ratchet: every allowed file still exists and still imports Stripe', () => {
    const stale = [...STRIPE_INTEGRATION_LAYER].filter((file) => !stripeImporters.includes(file));
    expect(stale).toEqual([]);
  });
});
