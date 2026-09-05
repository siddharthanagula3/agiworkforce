import { describe, expect, it, vi } from 'vitest';
import { createErrorReportingClient } from '../client';
import type { ErrorReportingAdapter } from '../types';

function makeAdapter(): ErrorReportingAdapter {
  return {
    init: vi.fn(),
    captureError: vi.fn(),
    addBreadcrumb: vi.fn(),
  };
}

describe('createErrorReportingClient consent gate', () => {
  it('does not initialize or report when consent is withheld', () => {
    const adapter = makeAdapter();
    const client = createErrorReportingClient({
      adapter,
      environment: 'test',
      readDsn: () => 'https://key@ingest.example.com/1',
      hasConsent: () => false,
    });

    client.captureError(new Error('boom'));
    client.addBreadcrumb({ category: 'lifecycle', label: 'started' });

    expect(adapter.init).not.toHaveBeenCalled();
    expect(adapter.captureError).not.toHaveBeenCalled();
    expect(adapter.addBreadcrumb).not.toHaveBeenCalled();
    expect(client.isReporting()).toBe(false);
  });

  it('does not report when consent is granted but no dsn is configured', () => {
    const adapter = makeAdapter();
    const client = createErrorReportingClient({
      adapter,
      environment: 'test',
      readDsn: () => undefined,
      hasConsent: () => true,
    });

    client.captureError(new Error('boom'));

    expect(adapter.init).not.toHaveBeenCalled();
    expect(adapter.captureError).not.toHaveBeenCalled();
  });

  it('initializes once and reports when consent and a dsn are both present', () => {
    const adapter = makeAdapter();
    const client = createErrorReportingClient({
      adapter,
      environment: 'test',
      readDsn: () => 'https://key@ingest.example.com/1',
      hasConsent: () => true,
    });

    client.captureError(new Error('boom'));
    client.captureError(new Error('boom again'));

    expect(adapter.init).toHaveBeenCalledTimes(1);
    expect(adapter.captureError).toHaveBeenCalledTimes(2);
    expect(client.isReporting()).toBe(true);
  });

  it('caps breadcrumbs at the configured maximum', () => {
    const adapter = makeAdapter();
    const client = createErrorReportingClient({
      adapter,
      environment: 'test',
      readDsn: () => 'https://key@ingest.example.com/1',
      hasConsent: () => true,
      maxBreadcrumbs: 2,
    });

    client.addBreadcrumb({ category: 'lifecycle', label: 'a' });
    client.addBreadcrumb({ category: 'lifecycle', label: 'b' });
    client.addBreadcrumb({ category: 'lifecycle', label: 'c' });

    expect(adapter.addBreadcrumb).toHaveBeenCalledTimes(2);
  });

  it('stops reporting the moment consent flips off', () => {
    let consent = true;
    const adapter = makeAdapter();
    const client = createErrorReportingClient({
      adapter,
      environment: 'test',
      readDsn: () => 'https://key@ingest.example.com/1',
      hasConsent: () => consent,
    });

    client.captureError(new Error('boom'));
    consent = false;
    client.captureError(new Error('boom again'));

    expect(adapter.captureError).toHaveBeenCalledTimes(1);
  });

  it('never hands the adapter the raw error, only the scrubbed payload', () => {
    const adapter = makeAdapter();
    const client = createErrorReportingClient({
      adapter,
      environment: 'test',
      readDsn: () => 'https://key@ingest.example.com/1',
      hasConsent: () => true,
    });

    client.captureError(new Error('super secret message'));

    const [payload] = vi.mocked(adapter.captureError).mock.calls[0] ?? [];
    expect(JSON.stringify(payload)).not.toContain('super secret message');
  });
});
