export type {
  ErrorReportContext,
  ErrorReportingAdapter,
  ErrorReportingAdapterConfig,
  ErrorReportingBreadcrumb,
  ErrorReportingBreadcrumbCategory,
  ErrorReportingClient,
  ErrorReportingClientOptions,
  ScrubbedErrorPayload,
  ScrubbedStackFrame,
} from './types';

export { ERROR_REPORTING_MAX_BREADCRUMBS_DEFAULT } from './types';

export { scrubErrorPayload } from './scrub';

export { createErrorReportingClient } from './client';

export {
  createSentryFetchAdapter,
  type SentryFetchAdapterOptions,
} from './adapters/sentryFetchAdapter';
