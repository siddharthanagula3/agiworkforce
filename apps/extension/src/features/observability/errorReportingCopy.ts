export const ERROR_REPORTING_CONSENT_LABEL = 'Share crash and usage telemetry';

export function describeErrorReportingConsent(enabled: boolean): string {
  return enabled
    ? 'Crash reports are sent when the background or side panel hits an unhandled error. Message text, file names, and URLs are dropped before anything leaves your browser.'
    : 'Crash reports stay off. Nothing is sent when an unhandled error occurs.';
}
