import { logger } from './logger.js';
import { metrics } from './metrics.js';
import {
  DEFAULT_EXPORT_INTERVAL_MS,
  keepSpanForExport,
  resolveOtelExportConfig,
  type OtelExportConfig,
} from './otel-config.js';
import { formatTraceparent, newSpanId, newTraceId, type TraceContext } from './trace-context.js';

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

export type SpanStatus = 'ok' | 'error';

export type SpanAttributes = Readonly<Record<string, string | number | boolean | undefined>>;

export interface ActiveSpan {
  readonly context: TraceContext;
  setAttributes(attributes: SpanAttributes): void;
  end(status?: SpanStatus, errorMessage?: string): void;
}

interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
}

interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  status: { code: number; message?: string };
}

const SPAN_KIND_CODE: Readonly<Record<SpanKind, number>> = {
  internal: 1,
  server: 2,
  client: 3,
  producer: 4,
  consumer: 5,
};

const STATUS_CODE_OK = 1;
const STATUS_CODE_ERROR = 2;
const SCOPE_NAME = 'agiworkforce.signaling';
const NANOS_PER_MS = 1_000_000;
const MAX_QUEUED_SPANS = 2_048;
const EXPORT_TIMEOUT_MS = 10_000;
const AGGREGATION_TEMPORALITY_CUMULATIVE = 2;

function attributeValue(value: string | number | boolean): OtlpAnyValue {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
}

function toOtlpAttributes(attributes: SpanAttributes): OtlpKeyValue[] {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => ({ key, value: attributeValue(value) }));
}

function toUnixNano(epochMs: number): string {
  return String(Math.round(epochMs * NANOS_PER_MS));
}

function resourceOf(config: OtelExportConfig): { attributes: OtlpKeyValue[] } {
  return { attributes: toOtlpAttributes({ 'service.name': config.serviceName }) };
}

function unrefTimer(timer: unknown): void {
  const candidate = timer as Partial<{ unref(): void }>;
  if (typeof candidate.unref === 'function') candidate.unref();
}

class OtelPipeline {
  private queued: OtlpSpan[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private startedAtMs = Date.now();

  constructor(private readonly config: OtelExportConfig) {}

  start(intervalMs: number): void {
    const timer = setInterval(() => {
      void this.flush();
    }, intervalMs);
    unrefTimer(timer);
    this.timer = timer;
  }

  startSpan(name: string, kind: SpanKind, parent: TraceContext | null): ActiveSpan {
    const context: TraceContext = {
      traceId: parent?.traceId ?? newTraceId(),
      spanId: newSpanId(),
      sampled: parent?.sampled ?? true,
    };
    const startedAtMs = Date.now();
    const attributes: Record<string, string | number | boolean | undefined> = {};
    let ended = false;

    return {
      context,
      setAttributes(next) {
        Object.assign(attributes, next);
      },
      end: (status = 'ok', errorMessage) => {
        if (ended) return;
        ended = true;
        const endedAtMs = Date.now();
        const errored = status === 'error';
        const keep = keepSpanForExport({
          traceId: context.traceId,
          errored,
          durationMs: endedAtMs - startedAtMs,
          ratio: this.config.sampleRatio,
          slowThresholdMs: this.config.slowSpanThresholdMs,
        });
        if (!keep) return;
        this.enqueue({
          traceId: context.traceId,
          spanId: context.spanId,
          ...(parent ? { parentSpanId: parent.spanId } : {}),
          name,
          kind: SPAN_KIND_CODE[kind],
          startTimeUnixNano: toUnixNano(startedAtMs),
          endTimeUnixNano: toUnixNano(endedAtMs),
          attributes: toOtlpAttributes(attributes),
          status: errored
            ? { code: STATUS_CODE_ERROR, ...(errorMessage ? { message: errorMessage } : {}) }
            : { code: STATUS_CODE_OK },
        });
      },
    };
  }

  private enqueue(span: OtlpSpan): void {
    if (this.queued.length >= MAX_QUEUED_SPANS) {
      this.queued.shift();
    }
    this.queued.push(span);
  }

  private async post(url: string, body: unknown): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.config.headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
      });
      if (!response.ok) {
        logger.warn({ url, status: response.status }, 'OTLP export rejected');
      }
    } catch (error) {
      logger.warn(
        { url, error: error instanceof Error ? error.message : String(error) },
        'OTLP export failed',
      );
    }
  }

  async flush(): Promise<void> {
    await Promise.all([this.flushSpans(), this.flushMetrics()]);
  }

  private async flushSpans(): Promise<void> {
    if (this.queued.length === 0) return;
    const spans = this.queued;
    this.queued = [];
    await this.post(this.config.tracesEndpoint, {
      resourceSpans: [
        {
          resource: resourceOf(this.config),
          scopeSpans: [{ scope: { name: SCOPE_NAME }, spans }],
        },
      ],
    });
  }

  private async flushMetrics(): Promise<void> {
    await this.post(this.config.metricsEndpoint, {
      resourceMetrics: [
        {
          resource: resourceOf(this.config),
          scopeMetrics: [{ scope: { name: SCOPE_NAME }, metrics: this.metricPayload() }],
        },
      ],
    });
  }

  private metricPayload(): unknown[] {
    const snapshot = metrics.toJSON();
    const nowNano = toUnixNano(Date.now());
    const startNano = toUnixNano(this.startedAtMs);

    const gauge = (name: string, value: number, attributes: SpanAttributes = {}): unknown => ({
      name,
      gauge: {
        dataPoints: [
          {
            attributes: toOtlpAttributes(attributes),
            timeUnixNano: nowNano,
            asInt: String(Math.round(value)),
          },
        ],
      },
    });

    const sum = (
      name: string,
      points: readonly { value: number; attributes: SpanAttributes }[],
    ): unknown => ({
      name,
      sum: {
        aggregationTemporality: AGGREGATION_TEMPORALITY_CUMULATIVE,
        isMonotonic: true,
        dataPoints: points.map((point) => ({
          attributes: toOtlpAttributes(point.attributes),
          startTimeUnixNano: startNano,
          timeUnixNano: nowNano,
          asInt: String(Math.round(point.value)),
        })),
      },
    });

    return [
      gauge('signaling.uptime', snapshot.uptime),
      gauge('signaling.connections.active', snapshot.connections),
      gauge('signaling.sessions.active', snapshot.sessions),
      gauge('signaling.memory.bytes', snapshot.memory.heapUsed, { 'memory.type': 'heapUsed' }),
      gauge('signaling.memory.bytes', snapshot.memory.rss, { 'memory.type': 'rss' }),
      sum(
        'signaling.messages',
        Object.entries(snapshot.messages).map(([type, value]) => ({
          value,
          attributes: { 'signaling.message.type': type },
        })),
      ),
      sum(
        'signaling.errors',
        Object.entries(snapshot.errors).map(([type, value]) => ({
          value,
          attributes: { 'error.type': type },
        })),
      ),
      sum('signaling.pairing.requests', [
        { value: snapshot.pairingRequests.success, attributes: { 'pairing.status': 'success' } },
        { value: snapshot.pairingRequests.failure, attributes: { 'pairing.status': 'failure' } },
      ]),
    ];
  }

  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.flush();
  }
}

let pipeline: OtelPipeline | null = null;

export function startOtel(
  env: NodeJS.ProcessEnv,
  intervalMs = DEFAULT_EXPORT_INTERVAL_MS,
): boolean {
  const config = resolveOtelExportConfig(env);
  if (!config) return false;
  pipeline = new OtelPipeline(config);
  pipeline.start(intervalMs);
  logger.info({ serviceName: config.serviceName }, 'OTel export pipeline started');
  return true;
}

const NOOP_SPAN: ActiveSpan = {
  context: { traceId: '', spanId: '', sampled: false },
  setAttributes() {},
  end() {},
};

export function startSpan(name: string, kind: SpanKind, parent: TraceContext | null): ActiveSpan {
  return pipeline ? pipeline.startSpan(name, kind, parent) : NOOP_SPAN;
}

export function spanTraceparent(span: ActiveSpan): string | null {
  return span.context.traceId ? formatTraceparent(span.context) : null;
}

export async function shutdownOtel(): Promise<void> {
  const current = pipeline;
  pipeline = null;
  await current?.shutdown();
}
