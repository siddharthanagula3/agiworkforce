import {
  HEALTH_PATH,
  READINESS_ATTEMPTS,
  READINESS_RETRY_DELAY_MS,
  READINESS_TIMEOUT_MS,
} from './constants.js';

export interface EndpointProbe {
  endpoint: string;
  ok: boolean;
  httpStatus: number | null;
  status: string | null;
  deploymentId: string | null;
  attempts: number;
  failure: string | null;
}

export interface ReadinessReport {
  checkedAt: number;
  probes: EndpointProbe[];
  ready: boolean;
  degraded: boolean;
}

export interface ReadinessOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

type HealthBody = { status?: unknown; deployment?: { id?: unknown } };

function readDeploymentId(body: HealthBody): string | null {
  const id = body.deployment?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function probeOnce(
  endpoint: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Omit<EndpointProbe, 'endpoint' | 'attempts'>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL(HEALTH_PATH, endpoint).toString(), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    let body: HealthBody = {};
    try {
      body = (await response.json()) as HealthBody;
    } catch {
      body = {};
    }
    const status = typeof body.status === 'string' ? body.status : null;
    return {
      ok: response.ok && status === 'healthy',
      httpStatus: response.status,
      status,
      deploymentId: readDeploymentId(body),
      failure: response.ok && status === 'healthy' ? null : (status ?? `http_${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      status: null,
      deploymentId: null,
      failure: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A single deploy target answering is not the service being up: both targets are
 * probed so a fleet running on one of them is reported as degraded rather than
 * healthy.
 */
export async function checkReadiness(
  endpoints: readonly string[],
  options: ReadinessOptions = {},
): Promise<ReadinessReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? READINESS_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.attempts ?? READINESS_ATTEMPTS);
  const retryDelayMs = options.retryDelayMs ?? READINESS_RETRY_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  const probes: EndpointProbe[] = [];
  for (const endpoint of endpoints) {
    let attempts = 0;
    let last = await probeOnce(endpoint, fetchImpl, timeoutMs);
    attempts += 1;
    while (!last.ok && attempts < maxAttempts) {
      await sleep(retryDelayMs);
      last = await probeOnce(endpoint, fetchImpl, timeoutMs);
      attempts += 1;
    }
    probes.push({ endpoint, attempts, ...last });
  }

  const healthy = probes.filter((probe) => probe.ok);
  return {
    checkedAt: Date.now(),
    probes,
    ready: probes.length > 0 && healthy.length === probes.length,
    degraded: healthy.length > 0 && healthy.length < probes.length,
  };
}

export function formatReadinessReport(report: ReadinessReport): string {
  const lines = report.probes.map((probe) => {
    const identity = probe.deploymentId ? ` deployment=${probe.deploymentId}` : '';
    return probe.ok
      ? `ok    ${probe.endpoint}${identity} attempts=${probe.attempts}`
      : `FAIL  ${probe.endpoint} reason=${probe.failure ?? 'unknown'} attempts=${probe.attempts}`;
  });
  const verdict = report.ready ? 'ready' : report.degraded ? 'degraded' : 'down';
  lines.push(`verdict=${verdict}`);
  return lines.join('\n');
}
