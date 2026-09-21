import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { NextResponse } from 'next/server';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { dashboardPanels } from '../dashboards';
import { METRIC_NAME } from '../metrics';
import { withSpan } from '../span';
import { webProviderTracer } from '../provider-tracer';
import {
  getRequestId,
  getTenantScope,
  getTraceContext,
  runWithTraceContext,
  setTenantScope,
  traceLogFields,
} from '../trace-context';
import { carriedTraceContext, runWithCarriedTrace, withTraceCarrier } from '../trace-propagation';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const apiRoot = join(repoRoot, 'apps/web/app/api');
const GATEWAY_ROOT = join(apiRoot, 'llm');

const INBOUND = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const INBOUND_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';

function routeFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^route\.tsx?$/u.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

const streamSym = pino.symbols.streamSym as unknown as symbol;
type Writable = { write(chunk: string): void };

let records: Array<Record<string, unknown>>;
let originalStream: Writable;

beforeEach(() => {
  records = [];
  const holder = logger as unknown as Record<symbol, Writable>;
  originalStream = holder[streamSym] as Writable;
  holder[streamSym] = {
    write(chunk: string) {
      for (const line of chunk.split('\n')) {
        if (line.trim()) records.push(JSON.parse(line) as Record<string, unknown>);
      }
    },
  };
});

afterEach(() => {
  (logger as unknown as Record<symbol, Writable>)[streamSym] = originalStream;
});

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://app.example.com/api/things', { method: 'POST', headers });
}

describe('every request carries an id a reporter can quote', () => {
  it('puts the request id on the response, the trace context and every log line', async () => {
    let inside: Record<string, string> = {};
    const handler = withErrorHandler(async (_request: Request) => {
      inside = traceLogFields();
      logger.info({ event: 'thing_created' }, 'created');
      return NextResponse.json({ ok: true });
    });

    const response = await handler(request({ traceparent: INBOUND }));

    expect(response.headers.get('x-request-id')).toBe(INBOUND_TRACE_ID);
    expect(inside['request_id']).toBe(INBOUND_TRACE_ID);
    expect(inside['trace_id']).toBe(INBOUND_TRACE_ID);
    const line = records.find((entry) => entry['event'] === 'thing_created');
    expect(line?.['request_id']).toBe(INBOUND_TRACE_ID);
  });

  it('logs the request id on the server span the wrapper emits itself', async () => {
    const handler = withErrorHandler(async (_request: Request) => NextResponse.json({ ok: true }));
    await handler(request({ 'x-request-id': 'req_quoted_by_support' }));

    const span = records.find((entry) => entry['span_name'] === 'http.server');
    expect(span?.['request_id']).toBe('req_quoted_by_support');
  });

  it('wraps every gateway route, so no model call is served without one', () => {
    const files = routeFiles(GATEWAY_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const unwrapped = files
      .filter((file) => !/\bwithErrorHandler\s*\(/u.test(readFileSync(file, 'utf8')))
      .map((file) => relative(repoRoot, file));
    expect(unwrapped).toEqual([]);
  });

  it('leaves no route outside the wrapper and the logger together', () => {
    const files = routeFiles(apiRoot);
    expect(files.length).toBeGreaterThan(0);

    const silent = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return (
        !/\bwithErrorHandler\s*\(|\bwithScim\s*\(|\bwithSeatAccountingErrors\s*\(/u.test(source) &&
        !/from\s*['"][^'"]*\/logger['"]/u.test(source)
      );
    });
    const ratchet = JSON.parse(
      readFileSync(join(repoRoot, 'scripts/.route-observability-ratchet.json'), 'utf8'),
    ) as { maxFindings: Record<string, number> };
    expect(silent.length).toBeLessThanOrEqual(ratchet.maxFindings['unlogged-route'] as number);
  });
});

describe('an error is observable wherever it is thrown', () => {
  it('logs, counts and answers every failure the handler lets escape', async () => {
    const handler = withErrorHandler(async (_request: Request) => {
      throw new Error('unhandled');
    });
    const response = await handler(request({ traceparent: INBOUND }));

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers.get('x-request-id')).toBe(INBOUND_TRACE_ID);
    const span = records.find((entry) => entry['span_name'] === 'http.server');
    expect(span?.['status']).toBe('error');
    expect(span?.['error.type']).toBe('Error');
    expect(span?.['request_id']).toBe(INBOUND_TRACE_ID);
  });

  it('routes every escaping error through the one wrapper that reports it', () => {
    const source = readFileSync(join(repoRoot, 'apps/web/lib/error-handler.ts'), 'utf8');
    expect(source).toContain('captureServerError');
    expect(source).toContain('recordHttpRequest');
  });

  it('turns a boot-time check into a standing series rather than one log line', () => {
    const source = readFileSync(join(repoRoot, 'apps/web/instrumentation.ts'), 'utf8');
    expect(source).toContain('recordConfigurationState');
    const panel = dashboardPanels().find((entry) => entry.id === 'configuration-completeness');
    expect(panel?.metric).toBe(METRIC_NAME.configurationState);
    expect(panel?.aggregation).toBe('max');
  });
});

describe('an audit record names the operation that produced it', () => {
  it('takes the ambient request id when the caller does not supply one', async () => {
    const parent = {
      traceId: INBOUND_TRACE_ID,
      spanId: '00f067aa0ba902b7',
      sampled: true,
      requestId: 'req_audited',
    };
    const captured = await runWithTraceContext(parent, async () => getRequestId());
    expect(captured).toBe('req_audited');

    const source = readFileSync(join(repoRoot, 'apps/web/lib/security-audit.ts'), 'utf8');
    expect(source).toContain('getRequestId');
    expect(source).toMatch(/correlationId\s*=\s*event\.correlationId \?\? getRequestId\(\)/u);
    expect(source).toContain('correlation_id');
    expect(source).toContain('operation_ref');
  });
});

describe('work started inside a request keeps its identity', () => {
  it('hands a child span the trace, the request id and the tenant scope', async () => {
    const parent = {
      traceId: INBOUND_TRACE_ID,
      spanId: '00f067aa0ba902b7',
      sampled: true,
      requestId: 'req_parent',
    };

    const seen = await runWithTraceContext(parent, async () => {
      setTenantScope({ organizationId: 'org_1', userId: 'usr_1' });
      return withSpan('tool.execute', { domain: 'tool' }, () => ({
        traceId: getTraceContext()?.traceId,
        requestId: getRequestId(),
        scope: getTenantScope(),
        fields: traceLogFields(),
      }));
    });

    expect(seen.traceId).toBe(INBOUND_TRACE_ID);
    expect(seen.requestId).toBe('req_parent');
    expect(seen.scope).toEqual({ organizationId: 'org_1', userId: 'usr_1' });
    expect(seen.fields['request_id']).toBe('req_parent');
    expect(seen.fields['organization_id']).toBe('org_1');
  });

  it('carries the trace and the request id through a queued payload', () => {
    const parent = {
      traceId: INBOUND_TRACE_ID,
      spanId: '00f067aa0ba902b7',
      sampled: true,
      requestId: 'req_enqueued',
    };

    const payload = runWithTraceContext(parent, () => withTraceCarrier({ jobKind: 'digest' }));
    expect(carriedTraceContext(payload)).toMatchObject({
      traceId: INBOUND_TRACE_ID,
      requestId: 'req_enqueued',
    });

    const drained = runWithCarriedTrace(JSON.parse(JSON.stringify(payload)), () =>
      traceLogFields(),
    );
    expect(drained['trace_id']).toBe(INBOUND_TRACE_ID);
    expect(drained['request_id']).toBe('req_enqueued');
  });

  it('hands a provider call the traceparent of the turn that made it', async () => {
    const parent = {
      traceId: INBOUND_TRACE_ID,
      spanId: '00f067aa0ba902b7',
      sampled: true,
      requestId: 'req_provider',
    };

    const carried = await runWithTraceContext(parent, () =>
      webProviderTracer.runInSpan(
        { providerId: 'anthropic', model: 'claude', operation: 'chat' },
        async () => webProviderTracer.currentTraceparent(),
      ),
    );

    expect(carried).toMatch(new RegExp(`^00-${INBOUND_TRACE_ID}-[0-9a-f]{16}-01$`, 'u'));
    const span = records.find((entry) => entry['span_name'] === 'gen_ai.chat');
    expect(span?.['gen_ai.provider.name']).toBe('anthropic');
    expect(span?.['gen_ai.request.model']).toBe('claude');
    expect(span?.['request_id']).toBe('req_provider');
  });
});
