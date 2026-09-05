import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OTEL_SERVICE_NAME,
  OTEL_ENDPOINT_ENV,
  OTEL_HEADERS_ENV,
  OTEL_SAMPLE_RATIO_ENV,
  OTEL_SERVICE_NAME_ENV,
  parseOtelHeaders,
  parseOtelSampleRatio,
  resolveOtelExportConfig,
} from './otel-config';

const COLLECTOR = 'https://collector.example.com';

describe('resolveOtelExportConfig', () => {
  it('returns null when no endpoint is configured', () => {
    expect(resolveOtelExportConfig({})).toBeNull();
    expect(resolveOtelExportConfig({ [OTEL_ENDPOINT_ENV]: '   ' })).toBeNull();
  });

  it('returns null for an endpoint that is not a url', () => {
    expect(resolveOtelExportConfig({ [OTEL_ENDPOINT_ENV]: 'collector.example.com' })).toBeNull();
  });

  it('appends the otlp traces path to a base url exactly once', () => {
    expect(resolveOtelExportConfig({ [OTEL_ENDPOINT_ENV]: COLLECTOR })?.tracesEndpoint).toBe(
      `${COLLECTOR}/v1/traces`,
    );
    expect(resolveOtelExportConfig({ [OTEL_ENDPOINT_ENV]: `${COLLECTOR}/` })?.tracesEndpoint).toBe(
      `${COLLECTOR}/v1/traces`,
    );
    expect(
      resolveOtelExportConfig({ [OTEL_ENDPOINT_ENV]: `${COLLECTOR}/v1/traces` })?.tracesEndpoint,
    ).toBe(`${COLLECTOR}/v1/traces`);
  });

  it('defaults the service name and lets the environment override it', () => {
    expect(resolveOtelExportConfig({ [OTEL_ENDPOINT_ENV]: COLLECTOR })?.serviceName).toBe(
      DEFAULT_OTEL_SERVICE_NAME,
    );
    expect(
      resolveOtelExportConfig({
        [OTEL_ENDPOINT_ENV]: COLLECTOR,
        [OTEL_SERVICE_NAME_ENV]: ' edge-worker ',
      })?.serviceName,
    ).toBe('edge-worker');
  });

  it('carries the configured headers and sample ratio', () => {
    const config = resolveOtelExportConfig({
      [OTEL_ENDPOINT_ENV]: COLLECTOR,
      [OTEL_HEADERS_ENV]: 'x-api-key=abc123,x-tenant=acme',
      [OTEL_SAMPLE_RATIO_ENV]: '0.25',
    });
    expect(config?.headers).toEqual({ 'x-api-key': 'abc123', 'x-tenant': 'acme' });
    expect(config?.sampleRatio).toBe(0.25);
  });
});

describe('parseOtelHeaders', () => {
  it('is empty when unset and ignores malformed pairs', () => {
    expect(parseOtelHeaders(undefined)).toEqual({});
    expect(parseOtelHeaders('novalue,=orphan,,  ')).toEqual({});
  });

  it('keeps a value that itself contains the separator character', () => {
    expect(parseOtelHeaders(' authorization = Bearer a=b ')).toEqual({
      authorization: 'Bearer a=b',
    });
  });
});

describe('parseOtelSampleRatio', () => {
  it('is null when unset or unparseable so the pipeline default applies', () => {
    expect(parseOtelSampleRatio(undefined)).toBeNull();
    expect(parseOtelSampleRatio('')).toBeNull();
    expect(parseOtelSampleRatio('every-other-one')).toBeNull();
  });

  it('clamps to the closed unit interval', () => {
    expect(parseOtelSampleRatio('-3')).toBe(0);
    expect(parseOtelSampleRatio('7')).toBe(1);
    expect(parseOtelSampleRatio('0.5')).toBe(0.5);
  });
});
