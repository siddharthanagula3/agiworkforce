import { scrubErrorPayload } from './scrub';
import {
  ERROR_REPORTING_MAX_BREADCRUMBS_DEFAULT,
  type ErrorReportContext,
  type ErrorReportingBreadcrumb,
  type ErrorReportingClient,
  type ErrorReportingClientOptions,
} from './types';

export function createErrorReportingClient(
  options: ErrorReportingClientOptions,
): ErrorReportingClient {
  const {
    adapter,
    environment,
    release,
    readDsn,
    hasConsent,
    maxBreadcrumbs = ERROR_REPORTING_MAX_BREADCRUMBS_DEFAULT,
  } = options;

  let initialized = false;
  let breadcrumbCount = 0;

  function ensureInitialized(): boolean {
    if (!hasConsent()) return false;
    const dsn = readDsn();
    if (!dsn) return false;
    if (!initialized) {
      adapter.init(release === undefined ? { dsn, environment } : { dsn, environment, release });
      initialized = true;
    }
    return true;
  }

  return {
    captureError(error: Error, context?: ErrorReportContext) {
      if (!ensureInitialized()) return;
      adapter.captureError(scrubErrorPayload(error), context);
    },
    addBreadcrumb(breadcrumb: ErrorReportingBreadcrumb) {
      if (!ensureInitialized()) return;
      if (breadcrumbCount >= maxBreadcrumbs) return;
      breadcrumbCount += 1;
      adapter.addBreadcrumb(breadcrumb);
    },
    isReporting() {
      return initialized;
    },
  };
}
