import type {
  ErrorReportContext,
  ErrorReportingAdapter,
  ErrorReportingAdapterConfig,
  ErrorReportingBreadcrumb,
  ScrubbedErrorPayload,
} from '../types';

const SENTRY_ENVELOPE_CONTENT_TYPE = 'application/x-sentry-envelope';
const SENTRY_PROTOCOL_VERSION = '7';
const SENTRY_SDK_NAME = '@agiworkforce/observability';
const SENTRY_SDK_VERSION = '0.0.1';
const SENTRY_EVENT_PLATFORM = 'javascript';
const SENTRY_ITEM_TYPE_EVENT = 'event';
const MAX_BREADCRUMBS_SENT = 20;
const EVENT_ID_BYTE_LENGTH = 16;

interface ParsedSentryDsn {
  ingestUrl: string;
  publicKey: string;
}

function parseSentryDsn(dsn: string): ParsedSentryDsn | undefined {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, '');
    if (!publicKey || !projectId) return undefined;
    return {
      publicKey,
      ingestUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return undefined;
  }
}

function randomEventId(): string {
  const bytes = new Uint8Array(EVENT_ID_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildEnvelope(
  eventId: string,
  config: ErrorReportingAdapterConfig,
  payload: ScrubbedErrorPayload,
  context: ErrorReportContext | undefined,
  breadcrumbs: readonly ErrorReportingBreadcrumb[],
): string {
  const sentAt = new Date().toISOString();
  const header = { event_id: eventId, sent_at: sentAt };
  const itemHeader = { type: SENTRY_ITEM_TYPE_EVENT };
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: SENTRY_EVENT_PLATFORM,
    environment: config.environment,
    release: config.release,
    tags: context?.tags,
    contexts: context?.component ? { component: { name: context.component } } : undefined,
    breadcrumbs: breadcrumbs.map((crumb) => ({
      category: crumb.category,
      message: crumb.label,
      timestamp: Date.now() / 1000,
    })),
    exception: {
      values: [
        {
          type: payload.name,
          stacktrace: {
            frames: payload.frames
              .slice()
              .reverse()
              .map((frame) => ({ function: frame.functionName })),
          },
        },
      ],
    },
    sdk: { name: SENTRY_SDK_NAME, version: SENTRY_SDK_VERSION },
  };
  return `${JSON.stringify(header)}\n${JSON.stringify(itemHeader)}\n${JSON.stringify(event)}`;
}

export interface SentryFetchAdapterOptions {
  fetchImpl?: typeof fetch;
}

export function createSentryFetchAdapter(
  options: SentryFetchAdapterOptions = {},
): ErrorReportingAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  let dsn: ParsedSentryDsn | undefined;
  let config: ErrorReportingAdapterConfig | undefined;
  let breadcrumbs: ErrorReportingBreadcrumb[] = [];

  return {
    init(nextConfig) {
      config = nextConfig;
      dsn = parseSentryDsn(nextConfig.dsn);
    },
    addBreadcrumb(breadcrumb) {
      breadcrumbs = [...breadcrumbs, breadcrumb].slice(-MAX_BREADCRUMBS_SENT);
    },
    captureError(payload, context) {
      if (!dsn || !config) return;
      const eventId = randomEventId();
      const body = buildEnvelope(eventId, config, payload, context, breadcrumbs);
      const url = `${dsn.ingestUrl}?sentry_key=${dsn.publicKey}&sentry_version=${SENTRY_PROTOCOL_VERSION}`;
      void fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': SENTRY_ENVELOPE_CONTENT_TYPE },
        body,
      }).catch(() => undefined);
    },
  };
}
