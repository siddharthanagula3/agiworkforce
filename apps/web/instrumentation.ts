/**
 * Next.js Instrumentation File
 *
 * This file runs once when the Node.js server starts.
 * Perfect for environment validation and initialization tasks.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import * as Sentry from '@sentry/nextjs';

import {
  commonInitOptions,
  isSentryConfigured,
  type CommonInitOptions,
  type TenantTaggedEvent,
} from './lib/sentry-shared';
import { getTenantScope } from './lib/observability/trace-context';
import { resolveOtelExportConfig } from './lib/observability/otel-config';
import type { SentryTracingClient } from './lib/observability/otel-sdk';

const NODE_RUNTIME = 'nodejs';
const EDGE_RUNTIME = 'edge';

function tagRequestOrganization(event: TenantTaggedEvent): void {
  const { organizationId } = getTenantScope();
  if (!organizationId) return;
  event.tags = { ...event.tags, organization_id: organizationId };
}

export async function register() {
  if (process.env['NEXT_RUNTIME'] === NODE_RUNTIME) {
    await import('./lib/observability/trace-storage.node');
    try {
      const { validateEnvironment, logValidationResults } = await import('./lib/validate-env');
      const result = validateEnvironment();
      logValidationResults(result);

      const { assertPooledDatabaseEndpoint } = await import('./lib/server/db-pool-tuning');
      assertPooledDatabaseEndpoint();

      if (result.valid) {
        console.debug('✅ Server initialization complete - environment validated');
      } else {
        const message =
          `Environment validation failed with ${result.errors.length} error(s):\n` +
          result.errors.map((e) => `  - ${e}`).join('\n');

        const allowInvalid = process.env['AGI_ALLOW_INVALID_ENV'] === '1';
        if (process.env['NODE_ENV'] === 'production' && !allowInvalid) {
          console.error(`❌ ${message}`);
          throw new Error(`${message}\nSet AGI_ALLOW_INVALID_ENV=1 to boot anyway (degraded).`);
        }

        console.error(
          `⚠️ ${message}\nContinuing, some features will not work until these are configured.`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Environment validation failed')) {
        throw error;
      }
      console.error('⚠️ Environment validation could not run:', error);
    }
  }

  const runtime = process.env['NEXT_RUNTIME'];
  const otelConfig = runtime === NODE_RUNTIME ? resolveOtelExportConfig(process.env) : null;

  let sentryClient: SentryTracingClient | undefined;
  if (isSentryConfigured() && (runtime === NODE_RUNTIME || runtime === EDGE_RUNTIME)) {
    const options: CommonInitOptions = { tenantTagHook: tagRequestOrganization };
    if (otelConfig) {
      options.skipOpenTelemetrySetup = true;
      if (otelConfig.sampleRatio !== null) options.tracesSampleRate = otelConfig.sampleRatio;
    }
    sentryClient = Sentry.init(commonInitOptions(options)) as SentryTracingClient | undefined;
  }

  if (otelConfig) {
    const { startOtelSdk } = await import('./lib/observability/otel-sdk');
    startOtelSdk(otelConfig, sentryClient);
    if (sentryClient) Sentry.validateOpenTelemetrySetup();
  }
}

export const onRequestError = Sentry.captureRequestError;
