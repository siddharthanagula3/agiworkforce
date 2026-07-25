/**
 * Next.js Instrumentation File
 *
 * This file runs once when the Node.js server starts.
 * Perfect for environment validation and initialization tasks.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import * as Sentry from '@sentry/nextjs';

import { commonInitOptions, isSentryConfigured } from './lib/sentry-shared';

export async function register() {
  // Only run on server-side (Node.js runtime)
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    try {
      // Import validation module (dynamic import to avoid bundling in edge runtime)
      const { validateEnvironment, logValidationResults } = await import('./lib/validate-env');
      const result = validateEnvironment();
      logValidationResults(result);

      if (result.valid) {
        console.debug('✅ Server initialization complete - environment validated');
      } else {
        // AUDIT-FIX STB-3: fail closed in production. validate-env.ts documents
        // its critical list as "Missing these will cause server startup to fail
        // in production" — that was the stated intent and the code did the
        // opposite, so a deploy missing DATABASE_URL or STRIPE_SECRET_KEY booted
        // green and 500'd on the first user request. `errors` only ever contains
        // critical vars and required Stripe price IDs; everything softer is
        // already routed to `warnings`, which stays non-fatal.
        //
        // AGI_ALLOW_INVALID_ENV=1 is a deliberate operator escape hatch for
        // incident response (e.g. bringing the site up with billing degraded).
        const message =
          `Environment validation failed with ${result.errors.length} error(s):\n` +
          result.errors.map((e) => `  - ${e}`).join('\n');

        const allowInvalid = process.env['AGI_ALLOW_INVALID_ENV'] === '1';
        if (process.env['NODE_ENV'] === 'production' && !allowInvalid) {
          console.error(`❌ ${message}`);
          throw new Error(
            `${message}\nSet AGI_ALLOW_INVALID_ENV=1 to boot anyway (degraded).`,
          );
        }

        console.error(
          `⚠️ ${message}\nContinuing — some features will not work until these are configured.`,
        );
      }
    } catch (error) {
      // A genuine validation failure above must propagate; only swallow the case
      // where the validation module itself could not be loaded or crashed.
      if (error instanceof Error && error.message.startsWith('Environment validation failed')) {
        throw error;
      }
      console.error('⚠️ Environment validation could not run:', error);
    }
  }

  // OBSERVABILITY-WEB-SENTRY-01: initialize Sentry on the server runtimes when
  // configured (production + DSN). PII-safe options live in lib/sentry-shared.
  // No-op otherwise — default-disabled.
  if (
    isSentryConfigured() &&
    (process.env['NEXT_RUNTIME'] === 'nodejs' || process.env['NEXT_RUNTIME'] === 'edge')
  ) {
    Sentry.init(commonInitOptions());
  }
}

// Capture server-side (App Router) request errors. A no-op when Sentry is
// disabled; Next.js calls this for errors thrown in server components/route
// handlers. The PII scrub in beforeSend applies before anything is sent.
export const onRequestError = Sentry.captureRequestError;
