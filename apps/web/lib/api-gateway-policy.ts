import {
  API_CONTRACT_VERSION,
  API_VERSION_REQUEST_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  MINIMUM_SUPPORTED_API_CONTRACT_VERSION,
  SUPPORTED_API_CONTRACT_VERSIONS,
} from '@agiworkforce/cloud-contracts';
import { resolveClientUpgrade, type ServerVersionAdvertisement } from '@agiworkforce/types';
import {
  CircuitOpenError,
  DependencyOverloadedError,
  DependencyTimeoutError,
  getCircuitBreaker,
  type CircuitBreaker,
} from '@agiworkforce/utils';

import { AppError, createError } from './errors';

export {
  API_CONTRACT_VERSION,
  API_VERSION_REQUEST_HEADER,
  API_VERSION_RESPONSE_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  MINIMUM_API_VERSION_RESPONSE_HEADER,
  MINIMUM_SUPPORTED_API_CONTRACT_VERSION,
  SUPPORTED_API_CONTRACT_VERSIONS,
} from '@agiworkforce/cloud-contracts';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/u;
const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const INBOUND_CIRCUIT_PREFIX = 'inbound:';
const INBOUND_CIRCUIT_MAX_CONCURRENT = 1_000;
const INBOUND_CIRCUIT_MAX_QUEUED = 0;
const SERVER_ERROR_STATUS = 500;

export type ApiGatewayPolicy = {
  idempotencyKey?: 'optional' | 'required';
} & ({ deadlineMs?: number; circuit?: undefined } | { deadlineMs: number; circuit: string });

export interface InboundRequestFacts {
  method: string | undefined;
  header: (name: string) => string | null;
}

/**
 * What this deployment tells a client about itself. The floor ships equal to
 * the newest contract because every shipped build speaks that one; a client
 * that names no version at all is not refused, because the builds in the field
 * predate the header.
 */
export const SERVER_VERSION_ADVERTISEMENT: ServerVersionAdvertisement = Object.freeze({
  latest: API_CONTRACT_VERSION,
  minimumSupported: MINIMUM_SUPPORTED_API_CONTRACT_VERSION,
  unsupportedBelow: MINIMUM_SUPPORTED_API_CONTRACT_VERSION,
});

export function assertInboundContract(
  request: InboundRequestFacts,
  policy: ApiGatewayPolicy,
): void {
  const requestedVersion = request.header(API_VERSION_REQUEST_HEADER)?.trim();
  if (requestedVersion) {
    if (!resolveClientUpgrade(SERVER_VERSION_ADVERTISEMENT, requestedVersion).usable) {
      throw createError.clientUpdateRequired(
        `This version speaks API contract ${requestedVersion}, and AGI Workforce now needs ${MINIMUM_SUPPORTED_API_CONTRACT_VERSION} or newer. Update to continue.`,
      );
    }
    if (!SUPPORTED_API_CONTRACT_VERSIONS.has(requestedVersion)) {
      throw createError.validation(
        `API version ${requestedVersion} is not supported. Send ${API_CONTRACT_VERSION} or omit the ${API_VERSION_REQUEST_HEADER} header.`,
      );
    }
  }

  if (!policy.idempotencyKey) return;
  const method = request.method?.toUpperCase();
  if (!method || !MUTATING_METHODS.has(method)) return;
  const idempotencyKey = request.header(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (!idempotencyKey) {
    if (policy.idempotencyKey === 'required') {
      throw createError.validation(
        `This request needs an ${IDEMPOTENCY_KEY_HEADER} header so a retry cannot apply it twice.`,
      );
    }
    return;
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw createError.validation(
      `The ${IDEMPOTENCY_KEY_HEADER} header must be 8 to 128 letters, digits, dots, colons, underscores or hyphens.`,
    );
  }
}

class ServerErrorResponse extends Error {
  constructor(readonly response: Response) {
    super(`handler answered ${response.status}`);
  }
}

const DELIBERATE_UNAVAILABLE_STATUSES: ReadonlySet<number> = new Set([503, 504]);

function isFaultStatus(status: number): boolean {
  return status >= SERVER_ERROR_STATUS && !DELIBERATE_UNAVAILABLE_STATUSES.has(status);
}

function isServerFailure(error: unknown): boolean {
  if (error instanceof ServerErrorResponse) return true;
  if (error instanceof AppError) return !error.userSafe && isFaultStatus(error.statusCode);
  return true;
}

function inboundCircuit(name: string, deadlineMs: number): CircuitBreaker {
  return getCircuitBreaker({
    name: `${INBOUND_CIRCUIT_PREFIX}${name}`,
    maxConcurrent: INBOUND_CIRCUIT_MAX_CONCURRENT,
    maxQueued: INBOUND_CIRCUIT_MAX_QUEUED,
    timeoutMs: deadlineMs,
    slowCallMs: deadlineMs,
    isFailure: isServerFailure,
  });
}

function timedOut(): AppError {
  return createError
    .timeout('This request took too long and was stopped. Try again in a moment.')
    .asUserSafe();
}

function withDeadline<T>(run: () => Promise<T>, deadlineMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(timedOut()), deadlineMs);
  });
  return Promise.race([run(), deadline]).finally(() => clearTimeout(timer));
}

export class InboundCircuitOpenError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('inbound circuit open');
  }
}

export async function runUnderGatewayPolicy<R extends Response>(
  policy: ApiGatewayPolicy,
  run: () => Promise<R>,
): Promise<R> {
  if (!policy.circuit) {
    return policy.deadlineMs === undefined ? run() : withDeadline(run, policy.deadlineMs);
  }

  const breaker = inboundCircuit(policy.circuit, policy.deadlineMs);
  try {
    return await breaker.execute(async () => {
      const response = await run();
      if (isFaultStatus(response.status)) throw new ServerErrorResponse(response);
      return response;
    });
  } catch (error) {
    if (error instanceof ServerErrorResponse) return error.response as R;
    if (error instanceof DependencyTimeoutError) throw timedOut();
    if (error instanceof CircuitOpenError) {
      throw new InboundCircuitOpenError(Math.max(1, Math.ceil(error.retryAfterMs / 1000)));
    }
    if (error instanceof DependencyOverloadedError) {
      throw new InboundCircuitOpenError(1);
    }
    throw error;
  }
}
