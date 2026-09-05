export const ERROR_REPORTING_MAX_BREADCRUMBS_DEFAULT = 20;

export type ErrorReportingBreadcrumbCategory =
  | 'lifecycle'
  | 'consent'
  | 'network-status'
  | 'navigation-blocked';

export interface ErrorReportingBreadcrumb {
  category: ErrorReportingBreadcrumbCategory;
  label: string;
}

export interface ScrubbedStackFrame {
  functionName: string;
}

export interface ScrubbedErrorPayload {
  name: string;
  frames: ScrubbedStackFrame[];
}

export interface ErrorReportContext {
  component: string;
  tags?: Record<string, string>;
}

export interface ErrorReportingAdapterConfig {
  dsn: string;
  environment: string;
  release?: string;
}

export interface ErrorReportingAdapter {
  init(config: ErrorReportingAdapterConfig): void;
  captureError(payload: ScrubbedErrorPayload, context?: ErrorReportContext): void;
  addBreadcrumb(breadcrumb: ErrorReportingBreadcrumb): void;
}

export interface ErrorReportingClient {
  captureError(error: Error, context?: ErrorReportContext): void;
  addBreadcrumb(breadcrumb: ErrorReportingBreadcrumb): void;
  isReporting(): boolean;
}

export interface ErrorReportingClientOptions {
  adapter: ErrorReportingAdapter;
  environment: string;
  release?: string;
  readDsn(): string | undefined;
  hasConsent(): boolean;
  maxBreadcrumbs?: number;
}
