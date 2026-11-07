'use client';

import { makeFetchTransport } from '@sentry/nextjs';
import { commonInitOptions, hasTelemetryConsent } from '@/lib/sentry-shared';

export function makeConsentAwareSentryTransport(
  options: Parameters<typeof makeFetchTransport>[0],
): ReturnType<typeof makeFetchTransport> {
  const transport = makeFetchTransport(options);

  return {
    send(envelope) {
      // Check each configured transport send, including envelopes buffered by the SDK.
      if (!hasTelemetryConsent()) return Promise.resolve({});
      return transport.send(envelope);
    },
    flush(timeout) {
      return transport.flush(timeout);
    },
  };
}

export function clientSentryInitOptions() {
  return {
    ...commonInitOptions(),
    transport: makeConsentAwareSentryTransport,
  };
}
