import {
  createErrorReportingClient,
  createSentryFetchAdapter,
  type ErrorReportingClient,
} from '@agiworkforce/observability';
import {
  errorReportingConsentSnapshot,
  readErrorReportingConsent,
  watchErrorReportingConsent,
} from './errorReportingConsent';

const ENVIRONMENT_DEVELOPMENT = 'development';
const ENVIRONMENT_PRODUCTION = 'production';
const COMPONENT_BACKGROUND = 'background';
const COMPONENT_SIDE_PANEL = 'side-panel';

let client: ErrorReportingClient | undefined;

function getClient(): ErrorReportingClient {
  if (!client) {
    client = createErrorReportingClient({
      adapter: createSentryFetchAdapter(),
      environment: import.meta.env.DEV ? ENVIRONMENT_DEVELOPMENT : ENVIRONMENT_PRODUCTION,
      release: chrome.runtime.getManifest().version,
      readDsn: () => import.meta.env.VITE_SENTRY_DSN,
      hasConsent: errorReportingConsentSnapshot,
    });
  }
  return client;
}

function toError(value: unknown, fallbackMessage: string): Error {
  return value instanceof Error ? value : new Error(fallbackMessage);
}

function beginConsentTracking(): void {
  void readErrorReportingConsent();
  watchErrorReportingConsent();
}

export function installBackgroundErrorReporting(): void {
  beginConsentTracking();

  self.addEventListener('error', (event: ErrorEvent) => {
    getClient().captureError(toError(event.error, event.message), {
      component: COMPONENT_BACKGROUND,
    });
  });

  self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    getClient().captureError(toError(event.reason, String(event.reason)), {
      component: COMPONENT_BACKGROUND,
    });
  });
}

export function installSidePanelErrorReporting(): void {
  beginConsentTracking();

  window.addEventListener('error', (event: ErrorEvent) => {
    getClient().captureError(toError(event.error, event.message), {
      component: COMPONENT_SIDE_PANEL,
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    getClient().captureError(toError(event.reason, String(event.reason)), {
      component: COMPONENT_SIDE_PANEL,
    });
  });
}
