import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordSettledProviderCost: vi.fn(async () => undefined),
  getOrganizationMonthToDateSpendCents: vi.fn(async () => 0),
}));
vi.mock('@/lib/services/organization-policy-service', () => ({
  readOrganizationPolicy: vi.fn(async () => null),
}));
vi.mock('@/lib/services/enterprise-funding-organization', () => ({
  resolveEnterpriseFundingOrganizationId: vi.fn(async () => null),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/settings/billing',
}));

const {
  ManagedUsageRequestError,
  estimateMicrousdOf,
  finalizeManagedUsageRequest,
  markManagedUsageClientDelivered,
  markManagedUsageProviderStarted,
  reserveManagedUsageProviderStep,
  reserveManagedUsageRequest,
} = await import('../managed-usage-request-service');

const MICROUSD_PER_CENT = 10_000;
const MANAGED_SETTLEMENT_TYPES = [
  'managed_usage_reservation',
  'managed_usage_extension',
  'managed_usage_finalization',
  'managed_usage_outcome_unknown',
] as const;
const TERMINAL_STATUSES = ['completed', 'released', 'outcome_unknown', 'declined'] as const;

/** public.microusd_to_cents_mirror: round-half-up in both directions. */
function centsMirror(microusd: number): number {
  return Math.floor((microusd + MICROUSD_PER_CENT / 2) / MICROUSD_PER_CENT);
}

interface LedgerAccount {
  id: string;
  userId: string;
  periodStartMs: number;
  periodEndMs: number;
  allocatedMicrousd: number;
  usedMicrousd: number;
  topUpAllocatedMicrousd: number;
  flagshipUsedTodayMicrousd: number;
  flagshipResetDay: number;
}

interface LedgerTransaction {
  userId: string;
  accountId: string;
  amountMicrousd: number;
  amountCents: number;
  metadata: Record<string, unknown>;
  createdAtMs: number;
}

interface RequestRow {
  id: string;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
  provider: string;
  model: string;
  estimatedCostMicrousd: number;
  actualCostMicrousd: number | null;
  status: string;
  leaseToken: string;
  leaseExpiresAtMs: number;
  createdAtMs: number;
  isFlagship: boolean;
  isOverage: boolean;
  initialProviderOperationKey: string | null;
  reservationSettlementStatus: string | null;
  finalSettlementStatus: string | null;
  finalErrorCode: string | null;
  providerStartedAtMs: number | null;
  clientDeliveredAtMs: number | null;
}

interface ExtensionRow {
  requestId: string;
  operationKey: string;
  estimatedCostMicrousd: number;
  status: string;
  settlementStatus: string | null;
  errorCode: string | null;
}

interface SettlementOutcome {
  success: boolean;
  remainingMicrousd: number;
  error: string | null;
  code: string | null;
  dailyLimitMicrousd: number;
  dailyUsedMicrousd: number;
  dailyRemainingMicrousd: number;
}

interface SettlementJob {
  userId: string;
  idempotencyKey: string;
  amountMicrousd: number;
  description: string | null;
  metadata: Record<string, unknown>;
  status: 'pending' | 'processing' | 'succeeded' | 'terminal';
  attemptCount: number;
  result: SettlementOutcome | null;
}

/**
 * The managed-usage half of the ledger as Postgres answers it: the lifecycle
 * functions of the durable request table, the settlement queue in front of
 * them, and the balance they move. The conditional updates matter as much as
 * the arithmetic, because every idempotency guarantee in the service is really
 * a guarantee about which of these statements found a row.
 */
class LedgerDatabase {
  nowMs = Date.UTC(2026, 8, 20, 12, 0, 0);

  readonly accounts: LedgerAccount[] = [];
  readonly transactions: LedgerTransaction[] = [];
  readonly requests = new Map<string, RequestRow>();
  readonly extensions = new Map<string, ExtensionRow>();
  readonly jobs = new Map<string, SettlementJob>();

  private readonly idempotencyKeys = new Map<string, SettlementOutcome>();
  private readonly overageEnabled = new Set<string>();
  private sequence = 0;

  openAccount(input: {
    userId: string;
    allocatedMicrousd: number;
    topUpAllocatedMicrousd?: number;
    overageEnabled?: boolean;
  }): LedgerAccount {
    const account: LedgerAccount = {
      id: `account-${(this.sequence += 1)}`,
      userId: input.userId,
      periodStartMs: this.nowMs - 86_400_000,
      periodEndMs: this.nowMs + 30 * 86_400_000,
      allocatedMicrousd: input.allocatedMicrousd,
      usedMicrousd: 0,
      topUpAllocatedMicrousd: input.topUpAllocatedMicrousd ?? 0,
      flagshipUsedTodayMicrousd: 0,
      flagshipResetDay: Math.floor(this.nowMs / 86_400_000),
    };
    this.accounts.push(account);
    if (input.overageEnabled) this.overageEnabled.add(input.userId);
    return account;
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }

  accountFor(userId: string, requirePeriodStarted: boolean): LedgerAccount | null {
    const candidates = this.accounts
      .filter(
        (account) =>
          account.userId === userId &&
          account.periodEndMs > this.nowMs &&
          (!requirePeriodStarted || account.periodStartMs <= this.nowMs),
      )
      .sort((left, right) => right.periodEndMs - left.periodEndMs);
    return candidates[0] ?? null;
  }

  transactionsForRequest(requestId: string): LedgerTransaction[] {
    return this.transactions.filter(
      (transaction) => transaction.metadata['managed_usage_request_id'] === requestId,
    );
  }

  /** The three plan windows, summed exactly as the reservation function does. */
  rollingWindows(userId: string): { session: number; weekly: number; flagshipWeekly: number } {
    const inWeek = this.transactions.filter(
      (transaction) =>
        transaction.userId === userId && transaction.createdAtMs >= this.nowMs - 7 * 86_400_000,
    );
    const plan = inWeek.filter((transaction) => transaction.metadata['is_overage'] !== true);
    const sum = (rows: LedgerTransaction[]): number =>
      rows.reduce((total, row) => total + row.amountMicrousd, 0);
    return {
      session: sum(plan.filter((row) => row.createdAtMs >= this.nowMs - 5 * 3_600_000)),
      weekly: sum(plan),
      flagshipWeekly: sum(plan.filter((row) => row.metadata['is_flagship'] === true)),
    };
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const rows = this.dispatch(sql, params);
    return rows as T[];
  }

  private dispatch(sql: string, params: unknown[]): Record<string, unknown>[] {
    if (sql.includes('headroom_microusd')) {
      const account = this.accountFor(String(params[0]), false);
      if (!account || !this.overageEnabled.has(String(params[0]))) return [];
      const headroom = Math.max(
        0,
        Math.min(account.allocatedMicrousd - account.usedMicrousd, account.topUpAllocatedMicrousd),
      );
      return [{ headroom_microusd: headroom }];
    }
    if (sql.includes('reserve_managed_usage_request_with_limits_microusd')) {
      return [this.reserveWithLimits(params)];
    }
    if (sql.includes('extend_managed_usage_request_provider_step_microusd')) {
      return [this.extendProviderStep(params)];
    }
    if (sql.includes('mark_managed_usage_provider_started')) {
      return [this.markProviderStarted(params)];
    }
    if (sql.includes('mark_managed_usage_client_delivered')) {
      return [this.markClientDelivered(params)];
    }
    if (sql.includes('finalize_managed_usage_request_microusd')) {
      return [this.finalize(params)];
    }
    if (sql.includes('enqueue_credit_settlement_microusd')) {
      const settlement = this.enqueueSettlement(
        String(params[0]),
        Number(params[1]),
        params[2] === null ? null : String(params[2]),
        JSON.parse(String(params[3])) as Record<string, unknown>,
        String(params[4]),
      );
      return [
        {
          status: settlement.settlementStatus,
          success: settlement.deductionSuccess,
          remaining_microusd: settlement.remainingMicrousd,
          code: settlement.errorCode,
          error: settlement.errorMessage,
          attempt_count: settlement.attempts,
        },
      ];
    }
    throw new Error(`unhandled statement: ${sql.slice(0, 80)}`);
  }

  // ---- credit settlement -------------------------------------------------

  private replay(userId: string, key: string): SettlementOutcome | null {
    const stored = this.idempotencyKeys.get(`${userId}:${key}`);
    return stored ?? null;
  }

  private remember(userId: string, key: string, outcome: SettlementOutcome): void {
    const composite = `${userId}:${key}`;
    if (!this.idempotencyKeys.has(composite)) this.idempotencyKeys.set(composite, outcome);
  }

  private writeTransaction(
    account: LedgerAccount,
    amountMicrousd: number,
    metadata: Record<string, unknown>,
  ): void {
    const requestId = metadata['managed_usage_request_id'];
    const request =
      typeof requestId === 'string'
        ? [...this.requests.values()].find(
            (candidate) => candidate.id === requestId && candidate.userId === account.userId,
          )
        : undefined;
    // label_managed_usage_transaction_classification: the request owns the
    // classification and every ledger row of it inherits both tags.
    const classified = request
      ? { ...metadata, is_flagship: request.isFlagship, is_overage: request.isOverage }
      : metadata;
    this.transactions.push({
      userId: account.userId,
      accountId: account.id,
      amountMicrousd,
      amountCents: centsMirror(amountMicrousd),
      metadata: classified,
      createdAtMs: this.nowMs,
    });
  }

  private settleManagedUsage(
    userId: string,
    amountMicrousd: number,
    metadata: Record<string, unknown>,
    key: string,
  ): SettlementOutcome {
    const operationType = String(metadata['type'] ?? '');
    const requestId = String(metadata['managed_usage_request_id'] ?? '');
    const operationKey = String(metadata['operation_key'] ?? '');
    if (
      !(MANAGED_SETTLEMENT_TYPES as readonly string[]).includes(operationType) ||
      requestId === ''
    ) {
      throw Object.assign(new Error('invalid managed usage settlement metadata'), {
        code: '22023',
      });
    }
    const expectedKey =
      operationType === 'managed_usage_reservation'
        ? `managed-reserve:${requestId}`
        : operationType === 'managed_usage_extension' &&
            /^provider:[1-9][0-9]{0,8}$/.test(operationKey)
          ? `managed-extend:${requestId}:${operationKey}`
          : `managed-final:${requestId}`;
    if (key !== expectedKey) {
      throw Object.assign(new Error('invalid managed usage settlement key'), { code: '22023' });
    }

    const replayed = this.replay(userId, key);
    if (replayed) return replayed;

    const account = this.accountFor(userId, true);
    if (!account) {
      const outcome = this.rejection(0, 'no active credit account found', 'NO_ACCOUNT');
      this.remember(userId, key, outcome);
      return outcome;
    }

    const remaining = account.allocatedMicrousd - account.usedMicrousd;
    if (amountMicrousd > 0 && remaining < amountMicrousd) {
      const outcome = this.rejection(
        remaining,
        'billing period credit limit exceeded',
        'BILLING_PERIOD_LIMIT_REACHED',
      );
      this.remember(userId, key, outcome);
      return outcome;
    }
    if (amountMicrousd < 0 && account.usedMicrousd < -amountMicrousd) {
      const outcome = this.rejection(
        remaining,
        'managed usage release exceeds settled usage',
        'INVALID_MANAGED_USAGE_RELEASE',
      );
      this.remember(userId, key, outcome);
      return outcome;
    }

    account.usedMicrousd += amountMicrousd;
    this.writeTransaction(account, amountMicrousd, { ...metadata, idempotency_key: key });
    const outcome: SettlementOutcome = {
      success: true,
      remainingMicrousd: remaining - amountMicrousd,
      error: null,
      code: null,
      dailyLimitMicrousd: 0,
      dailyUsedMicrousd: 0,
      dailyRemainingMicrousd: 0,
    };
    this.remember(userId, key, outcome);
    return outcome;
  }

  private deductCredits(
    userId: string,
    amountMicrousd: number,
    metadata: Record<string, unknown>,
    key: string,
  ): SettlementOutcome {
    const replayed = this.replay(userId, key);
    if (replayed) return replayed;

    const account = this.accountFor(userId, false);
    if (!account) {
      const outcome = this.rejection(0, 'no active credit account found', 'NO_ACCOUNT');
      this.remember(userId, key, outcome);
      return outcome;
    }

    const remaining = account.allocatedMicrousd - account.usedMicrousd;
    const dailyLimit = Math.floor(account.allocatedMicrousd * 0.3);
    const today = Math.floor(this.nowMs / 86_400_000);
    if (account.flagshipResetDay < today) {
      account.flagshipUsedTodayMicrousd = 0;
      account.flagshipResetDay = today;
    }
    const dailyUsed = account.flagshipUsedTodayMicrousd;

    if (dailyUsed + amountMicrousd > dailyLimit) {
      const outcome = this.rejection(
        remaining,
        'daily credit limit exceeded',
        'DAILY_CREDIT_LIMIT_REACHED',
      );
      this.remember(userId, key, outcome);
      return outcome;
    }
    if (remaining < amountMicrousd) {
      const outcome = this.rejection(
        remaining,
        'monthly credit limit exceeded',
        'MONTHLY_CREDIT_LIMIT_REACHED',
      );
      this.remember(userId, key, outcome);
      return outcome;
    }

    account.usedMicrousd += amountMicrousd;
    account.flagshipUsedTodayMicrousd = dailyUsed + amountMicrousd;
    this.writeTransaction(account, amountMicrousd, { ...metadata, idempotency_key: key });
    const outcome: SettlementOutcome = {
      success: true,
      remainingMicrousd: remaining - amountMicrousd,
      error: null,
      code: null,
      dailyLimitMicrousd: dailyLimit,
      dailyUsedMicrousd: dailyUsed + amountMicrousd,
      dailyRemainingMicrousd: Math.max(0, dailyLimit - dailyUsed - amountMicrousd),
    };
    this.remember(userId, key, outcome);
    return outcome;
  }

  private rejection(remaining: number, error: string, code: string): SettlementOutcome {
    return {
      success: false,
      remainingMicrousd: remaining,
      error,
      code,
      dailyLimitMicrousd: 0,
      dailyUsedMicrousd: 0,
      dailyRemainingMicrousd: 0,
    };
  }

  private enqueueSettlement(
    userId: string,
    amountMicrousd: number,
    description: string | null,
    metadata: Record<string, unknown>,
    key: string,
  ): {
    settlementStatus: string;
    deductionSuccess: boolean;
    remainingMicrousd: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    attempts: number;
  } {
    const composite = `${userId}:${key}`;
    let job = this.jobs.get(composite);
    if (!job) {
      job = {
        userId,
        idempotencyKey: key,
        amountMicrousd,
        description,
        metadata,
        status: 'pending',
        attemptCount: 0,
        result: null,
      };
      this.jobs.set(composite, job);
    }

    if (
      job.amountMicrousd !== amountMicrousd ||
      job.description !== description ||
      JSON.stringify(job.metadata) !== JSON.stringify(metadata)
    ) {
      return {
        settlementStatus: 'terminal',
        deductionSuccess: false,
        remainingMicrousd: null,
        errorCode: 'IDEMPOTENCY_CONFLICT',
        errorMessage: 'idempotency key was reused with a different settlement payload',
        attempts: job.attemptCount,
      };
    }

    if (job.status === 'succeeded' || job.status === 'terminal') {
      return {
        settlementStatus: job.status,
        deductionSuccess: job.result?.success ?? false,
        remainingMicrousd: job.result?.remainingMicrousd ?? null,
        errorCode: job.result?.code ?? null,
        errorMessage: job.result?.error ?? null,
        attempts: job.attemptCount,
      };
    }

    job.attemptCount += 1;
    job.status = 'processing';
    const managed = (MANAGED_SETTLEMENT_TYPES as readonly string[]).includes(
      String(metadata['type'] ?? ''),
    );
    const outcome = managed
      ? this.settleManagedUsage(userId, amountMicrousd, metadata, key)
      : this.deductCredits(userId, amountMicrousd, metadata, key);

    job.result = outcome;
    job.status = outcome.success ? 'succeeded' : 'terminal';
    return {
      settlementStatus: job.status,
      deductionSuccess: outcome.success,
      remainingMicrousd: outcome.remainingMicrousd,
      errorCode: outcome.success ? null : (outcome.code ?? 'DEDUCTION_REJECTED'),
      errorMessage: outcome.success ? null : (outcome.error ?? 'credit deduction rejected'),
      attempts: job.attemptCount,
    };
  }

  // ---- managed usage lifecycle -------------------------------------------

  private requestFor(userId: string, idempotencyKey: string): RequestRow | undefined {
    return this.requests.get(`${userId}:${idempotencyKey}`);
  }

  private reserveLegacy(params: unknown[]): Record<string, unknown> {
    const [userId, idempotencyKey, requestHash, provider, model, estimated, leaseToken, leaseSecs] =
      params as [string, string, string, string, string, number, string, number];

    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw Object.assign(new Error('invalid idempotency key'), { code: '22023' });
    }
    if (!/^[a-f0-9]{64}$/.test(requestHash)) {
      throw Object.assign(new Error('invalid request hash'), { code: '22023' });
    }
    if (provider.trim() === '' || model.trim() === '' || estimated < 0) {
      throw Object.assign(new Error('invalid managed usage reservation'), { code: '22023' });
    }

    const leaseSeconds = Math.max(60, Math.min(leaseSecs ?? 900, 21_600));
    let request = this.requestFor(userId, idempotencyKey);
    if (!request) {
      request = {
        id: `request-${(this.sequence += 1)}`,
        userId,
        idempotencyKey,
        requestHash,
        provider,
        model,
        estimatedCostMicrousd: estimated,
        actualCostMicrousd: null,
        status: 'reserving',
        leaseToken,
        leaseExpiresAtMs: this.nowMs + leaseSeconds * 1000,
        createdAtMs: this.nowMs,
        isFlagship: false,
        isOverage: false,
        initialProviderOperationKey: null,
        reservationSettlementStatus: null,
        finalSettlementStatus: null,
        finalErrorCode: null,
        providerStartedAtMs: null,
        clientDeliveredAtMs: null,
      };
      this.requests.set(`${userId}:${idempotencyKey}`, request);
    }

    if (
      request.requestHash !== requestHash ||
      request.provider !== provider ||
      request.model !== model
    ) {
      return {
        reservation_decision: 'conflict',
        request_status: request.status,
        lease_token: null,
        estimated_cost_microusd: request.estimatedCostMicrousd,
        settlement_status: request.reservationSettlementStatus,
        error_code: 'IDEMPOTENCY_CONFLICT',
      };
    }

    if ((TERMINAL_STATUSES as readonly string[]).includes(request.status)) {
      return {
        reservation_decision: request.status,
        request_status: request.status,
        lease_token: null,
        estimated_cost_microusd: request.estimatedCostMicrousd,
        settlement_status: request.finalSettlementStatus ?? request.reservationSettlementStatus,
        error_code: request.finalErrorCode,
      };
    }

    if (request.status === 'reserved' || request.status === 'provider_started') {
      const held = request.leaseToken === leaseToken && request.leaseExpiresAtMs > this.nowMs;
      return {
        reservation_decision: held ? 'acquired' : 'in_progress',
        request_status: held ? 'reserved' : request.status,
        lease_token: held ? request.leaseToken : null,
        estimated_cost_microusd: request.estimatedCostMicrousd,
        settlement_status: request.reservationSettlementStatus,
        error_code: null,
      };
    }

    const settlement = this.enqueueSettlement(
      userId,
      request.estimatedCostMicrousd,
      `Managed usage reservation: ${request.provider}/${request.model}`,
      {
        type: 'managed_usage_reservation',
        managed_usage_request_id: request.id,
        provider: request.provider,
        model: request.model,
      },
      `managed-reserve:${request.id}`,
    );

    if (settlement.settlementStatus === 'succeeded' && settlement.deductionSuccess) {
      request.status = 'reserved';
      request.leaseToken = leaseToken;
      request.leaseExpiresAtMs = this.nowMs + leaseSeconds * 1000;
      request.reservationSettlementStatus = 'succeeded';
      request.finalErrorCode = null;
      return {
        reservation_decision: 'acquired',
        request_status: 'reserved',
        lease_token: leaseToken,
        estimated_cost_microusd: request.estimatedCostMicrousd,
        settlement_status: 'succeeded',
        error_code: null,
      };
    }

    if (settlement.settlementStatus === 'pending') {
      request.reservationSettlementStatus = 'pending';
      request.finalErrorCode = settlement.errorCode;
      return {
        reservation_decision: 'unavailable',
        request_status: 'reserving',
        lease_token: null,
        estimated_cost_microusd: request.estimatedCostMicrousd,
        settlement_status: 'pending',
        error_code: settlement.errorCode,
      };
    }

    request.status = 'declined';
    request.reservationSettlementStatus = 'terminal';
    request.finalErrorCode = settlement.errorCode ?? 'INSUFFICIENT_CREDITS';
    return {
      reservation_decision: 'declined',
      request_status: 'declined',
      lease_token: null,
      estimated_cost_microusd: request.estimatedCostMicrousd,
      settlement_status: 'terminal',
      error_code: request.finalErrorCode,
    };
  }

  private reserveWithLimits(params: unknown[]): Record<string, unknown> {
    const [userId, idempotencyKey] = params as [string, string];
    const estimated = Number(params[5]);
    const sessionCap = params[8] as number | null;
    const weeklyCap = params[9] as number | null;
    const flagshipCap = params[10] as number | null;
    const isFlagship = Boolean(params[11]);
    const headroom = Math.max(0, Number(params[12] ?? 0));

    if (estimated < 0) {
      throw Object.assign(new Error('invalid managed usage limits'), { code: '22023' });
    }

    if (this.requestFor(userId, idempotencyKey)) return this.reserveLegacy(params);

    const windows = this.rollingWindows(userId);
    let isOverage = false;
    const decline = (decision: string, code: string): Record<string, unknown> => ({
      reservation_decision: decision,
      request_status: 'declined',
      lease_token: null,
      estimated_cost_microusd: estimated,
      settlement_status: null,
      error_code: code,
    });

    if (sessionCap !== null && windows.session + estimated > sessionCap) {
      if (estimated <= headroom) isOverage = true;
      else return decline('session_limit', 'ROLLING_FIVE_HOUR_LIMIT_REACHED');
    }
    if (weeklyCap !== null && windows.weekly + estimated > weeklyCap) {
      if (estimated <= headroom) isOverage = true;
      else return decline('weekly_limit', 'ROLLING_WEEKLY_LIMIT_REACHED');
    }
    if (isFlagship && flagshipCap !== null && windows.flagshipWeekly + estimated > flagshipCap) {
      if (estimated <= headroom) isOverage = true;
      else return decline('flagship_weekly_limit', 'FLAGSHIP_WEEKLY_LIMIT_REACHED');
    }

    const reservation = this.reserveLegacy(params);
    if (reservation['reservation_decision'] === 'acquired') {
      const request = this.requestFor(userId, idempotencyKey);
      if (request) {
        request.isFlagship = isFlagship;
        request.isOverage = isOverage;
        for (const transaction of this.transactionsForRequest(request.id)) {
          transaction.metadata['is_flagship'] = isFlagship;
          transaction.metadata['is_overage'] = isOverage;
        }
      }
    }
    return reservation;
  }

  private extendProviderStep(params: unknown[]): Record<string, unknown> {
    const [userId, idempotencyKey, requestHash, leaseToken, operationKey] = params as [
      string,
      string,
      string,
      string,
      string,
    ];
    const stepMicrousd = Number(params[5]);
    const sessionCap = params[6] as number | null;
    const weeklyCap = params[7] as number | null;
    const flagshipCap = params[8] as number | null;
    const isFlagship = Boolean(params[9]);

    const request = this.requestFor(userId, idempotencyKey);
    const conflict = (): Record<string, unknown> => ({
      extension_decision: 'conflict',
      request_status: request?.status ?? 'unknown',
      estimated_cost_microusd: request?.estimatedCostMicrousd ?? 0,
      settlement_status: null,
      error_code: 'STATE_CONFLICT',
    });
    if (
      !request ||
      request.requestHash !== requestHash ||
      request.leaseToken !== leaseToken ||
      request.isFlagship !== isFlagship ||
      request.status !== 'provider_started' ||
      request.leaseExpiresAtMs <= this.nowMs
    ) {
      return conflict();
    }

    request.leaseExpiresAtMs = Math.min(
      Math.max(request.leaseExpiresAtMs, this.nowMs + 3_600_000),
      request.createdAtMs + 86_400_000,
    );

    const covered = (): Record<string, unknown> => ({
      extension_decision: 'covered',
      request_status: request.status,
      estimated_cost_microusd: request.estimatedCostMicrousd,
      settlement_status: request.reservationSettlementStatus,
      error_code: null,
    });
    if (request.initialProviderOperationKey === null) {
      request.initialProviderOperationKey = operationKey;
      return covered();
    }
    if (request.initialProviderOperationKey === operationKey) return covered();

    const extensionId = `${request.id}:${operationKey}`;
    let extension = this.extensions.get(extensionId);
    if (!extension) {
      extension = {
        requestId: request.id,
        operationKey,
        estimatedCostMicrousd: stepMicrousd,
        status: 'pending',
        settlementStatus: null,
        errorCode: null,
      };
      this.extensions.set(extensionId, extension);
    }
    if (extension.estimatedCostMicrousd !== stepMicrousd) {
      return {
        extension_decision: 'conflict',
        request_status: request.status,
        estimated_cost_microusd: request.estimatedCostMicrousd,
        settlement_status: extension.settlementStatus,
        error_code: 'IDEMPOTENCY_CONFLICT',
      };
    }
    if (extension.status === 'extended') {
      return {
        extension_decision: 'already_extended',
        request_status: request.status,
        estimated_cost_microusd: request.estimatedCostMicrousd,
        settlement_status: extension.settlementStatus,
        error_code: null,
      };
    }

    const windows = this.rollingWindows(userId);
    const declineExtension = (decision: string, code: string): Record<string, unknown> => {
      extension.status = 'declined';
      extension.errorCode = code;
      return {
        extension_decision: decision,
        request_status: request.status,
        estimated_cost_microusd: request.estimatedCostMicrousd,
        settlement_status: null,
        error_code: code,
      };
    };
    if (extension.status === 'declined') {
      return declineExtension(
        extension.errorCode === 'ROLLING_FIVE_HOUR_LIMIT_REACHED'
          ? 'session_limit'
          : extension.errorCode === 'ROLLING_WEEKLY_LIMIT_REACHED'
            ? 'weekly_limit'
            : extension.errorCode === 'FLAGSHIP_WEEKLY_LIMIT_REACHED'
              ? 'flagship_weekly_limit'
              : 'declined',
        extension.errorCode ?? 'DECLINED',
      );
    }
    if (sessionCap !== null && windows.session + stepMicrousd > sessionCap) {
      return declineExtension('session_limit', 'ROLLING_FIVE_HOUR_LIMIT_REACHED');
    }
    if (weeklyCap !== null && windows.weekly + stepMicrousd > weeklyCap) {
      return declineExtension('weekly_limit', 'ROLLING_WEEKLY_LIMIT_REACHED');
    }
    if (isFlagship && flagshipCap !== null && windows.flagshipWeekly + stepMicrousd > flagshipCap) {
      return declineExtension('flagship_weekly_limit', 'FLAGSHIP_WEEKLY_LIMIT_REACHED');
    }

    const settlement = this.enqueueSettlement(
      userId,
      stepMicrousd,
      'Managed usage provider-step reservation',
      {
        type: 'managed_usage_extension',
        managed_usage_request_id: request.id,
        provider: request.provider,
        model: request.model,
        operation_key: operationKey,
      },
      `managed-extend:${request.id}:${operationKey}`,
    );

    if (settlement.settlementStatus === 'succeeded' && settlement.deductionSuccess) {
      request.estimatedCostMicrousd += stepMicrousd;
      extension.status = 'extended';
      extension.settlementStatus = 'succeeded';
      extension.errorCode = null;
      return {
        extension_decision: 'extended',
        request_status: request.status,
        estimated_cost_microusd: request.estimatedCostMicrousd,
        settlement_status: 'succeeded',
        error_code: null,
      };
    }

    extension.status = 'declined';
    extension.settlementStatus = 'terminal';
    extension.errorCode = settlement.errorCode ?? 'INSUFFICIENT_CREDITS';
    return {
      extension_decision: 'declined',
      request_status: request.status,
      estimated_cost_microusd: request.estimatedCostMicrousd,
      settlement_status: 'terminal',
      error_code: extension.errorCode,
    };
  }

  private markProviderStarted(params: unknown[]): Record<string, unknown> {
    const [userId, idempotencyKey, requestHash, leaseToken] = params as [
      string,
      string,
      string,
      string,
    ];
    const request = this.requestFor(userId, idempotencyKey);
    if (!request || request.requestHash !== requestHash || request.leaseToken !== leaseToken) {
      return { request_status: 'unknown', operation_result: 'conflict' };
    }
    if (request.status === 'provider_started') {
      return { request_status: request.status, operation_result: 'already_updated' };
    }
    if (request.status !== 'reserved' || request.leaseExpiresAtMs <= this.nowMs) {
      return { request_status: request.status, operation_result: 'conflict' };
    }
    request.status = 'provider_started';
    request.providerStartedAtMs ??= this.nowMs;
    return { request_status: 'provider_started', operation_result: 'updated' };
  }

  private markClientDelivered(params: unknown[]): Record<string, unknown> {
    const [userId, idempotencyKey, requestHash, leaseToken] = params as [
      string,
      string,
      string,
      string,
    ];
    const request = this.requestFor(userId, idempotencyKey);
    if (!request || request.requestHash !== requestHash || request.leaseToken !== leaseToken) {
      return { request_status: 'unknown', operation_result: 'conflict' };
    }
    if (request.status !== 'completed') {
      return { request_status: request.status, operation_result: 'conflict' };
    }
    if (request.clientDeliveredAtMs !== null) {
      return { request_status: request.status, operation_result: 'already_updated' };
    }
    request.clientDeliveredAtMs = this.nowMs;
    return { request_status: 'completed', operation_result: 'updated' };
  }

  private finalize(params: unknown[]): Record<string, unknown> {
    const [userId, idempotencyKey, requestHash, leaseToken, outcome] = params as [
      string,
      string,
      string,
      string,
      string,
    ];
    const actual = Number(params[5]);
    const usage = JSON.parse(String(params[6])) as Record<string, unknown>;
    if ((outcome !== 'completed' && outcome !== 'failed') || actual < 0) {
      throw Object.assign(new Error('invalid managed usage finalization'), { code: '22023' });
    }

    const request = this.requestFor(userId, idempotencyKey);
    if (!request || request.requestHash !== requestHash || request.leaseToken !== leaseToken) {
      return {
        request_status: 'unknown',
        operation_result: 'conflict',
        settlement_status: null,
        actual_cost_microusd: 0,
        error_code: 'STATE_CONFLICT',
      };
    }
    if (['completed', 'released', 'outcome_unknown'].includes(request.status)) {
      return {
        request_status: request.status,
        operation_result: 'already_finalized',
        settlement_status: request.finalSettlementStatus,
        actual_cost_microusd: request.actualCostMicrousd ?? 0,
        error_code: request.finalErrorCode,
      };
    }
    if (
      !['reserved', 'provider_started'].includes(request.status) ||
      (outcome === 'completed' && request.status !== 'provider_started')
    ) {
      return {
        request_status: request.status,
        operation_result: 'conflict',
        settlement_status: request.finalSettlementStatus,
        actual_cost_microusd: request.actualCostMicrousd ?? 0,
        error_code: 'STATE_CONFLICT',
      };
    }

    const settled = outcome === 'completed' ? actual : 0;
    const delta = settled - request.estimatedCostMicrousd;
    const finalStatus = outcome === 'completed' ? 'completed' : 'released';

    const settlement = this.enqueueSettlement(
      userId,
      delta,
      outcome === 'completed'
        ? 'Managed usage actual-cost reconciliation'
        : 'Managed usage reservation release',
      {
        type: 'managed_usage_finalization',
        managed_usage_request_id: request.id,
        provider: request.provider,
        model: request.model,
        outcome,
        estimated_cost_microusd: request.estimatedCostMicrousd,
        actual_cost_microusd: settled,
        usage,
      },
      `managed-final:${request.id}`,
    );

    request.status = finalStatus;
    request.actualCostMicrousd = settled;
    request.finalSettlementStatus = settlement.settlementStatus;
    request.finalErrorCode = settlement.errorCode;
    return {
      request_status: finalStatus,
      operation_result: 'finalized',
      settlement_status: settlement.settlementStatus,
      actual_cost_microusd: settled,
      error_code: settlement.errorCode,
    };
  }

  /**
   * The ledger-row half of the classification backfill, with its predicates:
   * an untagged row of a classified request, young enough for a rolling window
   * to still sum it, whose cents mirror already matches its microUSD amount so
   * the before-update unit trigger can only write back what is there.
   */
  backfillOverageClassification(): number {
    let tagged = 0;
    for (const transaction of this.transactions) {
      if (transaction.metadata['is_overage'] === true) continue;
      if (transaction.createdAtMs < this.nowMs - 8 * 86_400_000) continue;
      if (transaction.amountCents !== centsMirror(transaction.amountMicrousd)) continue;
      const owner = [...this.requests.values()].find(
        (request) =>
          request.isOverage &&
          request.userId === transaction.userId &&
          request.id === transaction.metadata['managed_usage_request_id'],
      );
      if (!owner) continue;
      transaction.metadata['is_overage'] = true;
      tagged += 1;
    }
    return tagged;
  }

  /** public.recover_stale_managed_usage_requests, the cron half of the lease. */
  recoverStaleRequests(): number {
    let recovered = 0;
    for (const request of this.requests.values()) {
      if (!['reserving', 'reserved', 'provider_started'].includes(request.status)) continue;
      if (request.leaseExpiresAtMs > this.nowMs) continue;

      if (request.status === 'reserving') {
        const job = this.jobs.get(`${request.userId}:managed-reserve:${request.id}`);
        if (job && (job.status === 'pending' || job.status === 'processing')) continue;
        if (!job || job.status === 'terminal') {
          request.status = 'outcome_unknown';
          request.actualCostMicrousd = 0;
          request.finalSettlementStatus = job?.status ?? null;
          request.finalErrorCode = 'OUTCOME_UNKNOWN_BEFORE_RESERVATION';
          recovered += 1;
          continue;
        }
      }

      const settlement = this.enqueueSettlement(
        request.userId,
        -request.estimatedCostMicrousd,
        'Managed usage outcome-unknown reservation release',
        {
          type: 'managed_usage_outcome_unknown',
          managed_usage_request_id: request.id,
          provider: request.provider,
          model: request.model,
          provider_started: request.providerStartedAtMs !== null,
          client_delivered: request.clientDeliveredAtMs !== null,
        },
        `managed-final:${request.id}`,
      );
      request.status = 'outcome_unknown';
      request.actualCostMicrousd = 0;
      request.finalSettlementStatus = settlement.settlementStatus;
      request.finalErrorCode = settlement.errorCode ?? 'OUTCOME_UNKNOWN';
      recovered += 1;
    }
    return recovered;
  }
}

function hash(seed: string): string {
  let value = 0x811c9dc5;
  const digits: string[] = [];
  for (let index = 0; index < 64; index += 1) {
    value ^= seed.charCodeAt(index % seed.length) + index;
    value = Math.imul(value, 0x01000193) >>> 0;
    digits.push((value % 16).toString(16));
  }
  return digits.join('');
}

function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}

const USER_ID = 'user-lifecycle';
const PLAN_TIER = 'max';

function reservationInput(ledger: LedgerDatabase, key: string, estimatedMicrousd: number) {
  return {
    db: ledger as unknown as Parameters<typeof reserveManagedUsageRequest>[0]['db'],
    userId: USER_ID,
    idempotencyKey: key,
    requestHash: hash(key),
    provider: 'anthropic',
    model: 'claude-model',
    planTier: PLAN_TIER,
    isFlagship: false,
    estimatedCostMicrousd: estimatedMicrousd,
  };
}

/** Everything the ledger must still be able to say once a script has run. */
function assertLedgerInvariants(ledger: LedgerDatabase): void {
  for (const account of ledger.accounts) {
    const posted = ledger.transactions
      .filter((transaction) => transaction.accountId === account.id)
      .reduce((total, transaction) => total + transaction.amountMicrousd, 0);
    expect(posted).toBe(account.usedMicrousd);
    expect(account.usedMicrousd).toBeGreaterThanOrEqual(0);
    expect(account.usedMicrousd).toBeLessThanOrEqual(account.allocatedMicrousd);
  }

  for (const transaction of ledger.transactions) {
    expect(transaction.amountCents).toBe(centsMirror(transaction.amountMicrousd));
    const settlementType = transaction.metadata['type'];
    if ((MANAGED_SETTLEMENT_TYPES as readonly string[]).includes(String(settlementType))) {
      const requestId = transaction.metadata['managed_usage_request_id'];
      const owner = [...ledger.requests.values()].find((request) => request.id === requestId);
      expect(owner, `settlement ${String(settlementType)} has no reservation`).toBeDefined();
      expect(transaction.metadata['is_overage']).toBe(owner?.isOverage);
    }
  }

  const keys = ledger.transactions.map((transaction) => transaction.metadata['idempotency_key']);
  expect(new Set(keys).size).toBe(keys.length);

  // The only charge outside the lifecycle is the late settlement of a turn
  // recovery already refunded. It may exist once, for delivered work only.
  const late = ledger.transactions.filter(
    (transaction) => transaction.metadata['is_late_settlement'] === true,
  );
  const lateSubjects = late.map((transaction) => transaction.metadata['request_hash']);
  expect(new Set(lateSubjects).size).toBe(lateSubjects.length);
  for (const transaction of late) {
    expect(transaction.amountMicrousd).toBeGreaterThan(0);
    const owner = [...ledger.requests.values()].find(
      (request) => request.requestHash === transaction.metadata['request_hash'],
    );
    expect(owner?.status).toBe('outcome_unknown');
  }

  for (const request of ledger.requests.values()) {
    const settled = ledger
      .transactionsForRequest(request.id)
      .filter((transaction) =>
        (MANAGED_SETTLEMENT_TYPES as readonly string[]).includes(
          String(transaction.metadata['type']),
        ),
      )
      .reduce((total, transaction) => total + transaction.amountMicrousd, 0);

    if (request.status === 'completed') {
      expect(settled).toBe(request.actualCostMicrousd);
    } else if ((TERMINAL_STATUSES as readonly string[]).includes(request.status)) {
      expect(settled).toBe(0);
    } else {
      expect(settled).toBe(request.estimatedCostMicrousd);
    }
  }
}

async function runTurn(ledger: LedgerDatabase, draw: () => number, index: number): Promise<void> {
  const key = `turn-${index.toString().padStart(6, '0')}`;
  const estimated = 20_000 + Math.floor(draw() * 180_000);

  let reservation;
  try {
    reservation = await reserveManagedUsageRequest(reservationInput(ledger, key, estimated));
  } catch (error) {
    expect(error).toBeInstanceOf(ManagedUsageRequestError);
    return;
  }

  // A retry that still holds the lease resumes the same reservation.
  if (draw() < 0.3) {
    const replay = await reserveManagedUsageRequest({
      ...reservationInput(ledger, key, estimated),
      leaseToken: reservation.leaseToken,
    });
    expect(replay.leaseToken).toBe(reservation.leaseToken);
    expect(replay.estimatedCostMicrousd).toBe(reservation.estimatedCostMicrousd);
  }

  // A retry from anywhere else is refused rather than reserving a second time.
  if (draw() < 0.2) {
    await expect(
      reserveManagedUsageRequest(reservationInput(ledger, key, estimated)),
    ).rejects.toMatchObject({ code: 'idempotency_in_progress' });
  }

  const started = draw() < 0.85;
  if (started) {
    await markManagedUsageProviderStarted(reservation);
    if (draw() < 0.3) await markManagedUsageProviderStarted(reservation);
  }

  if (started && draw() < 0.35) {
    await reserveManagedUsageProviderStep({
      reservation,
      operationKey: 'provider:1',
      planTier: PLAN_TIER,
      isFlagship: false,
      estimatedCostMicrousd: 0,
    });
    if (draw() < 0.5) {
      const step = Math.floor(draw() * 40_000);
      try {
        await reserveManagedUsageProviderStep({
          reservation,
          operationKey: 'provider:2',
          planTier: PLAN_TIER,
          isFlagship: false,
          estimatedCostMicrousd: step,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ManagedUsageRequestError);
      }
    }
  }

  const expire = draw() < 0.2;
  if (expire) {
    ledger.advance(21_600_000);
    ledger.recoverStaleRequests();
  }

  const outcome = started && draw() < 0.75 ? 'completed' : 'failed';
  const actual =
    outcome === 'completed'
      ? Math.floor(estimateMicrousdOf(reservation) * (0.1 + draw() * 1.4))
      : 0;

  try {
    const finalization = await finalizeManagedUsageRequest({
      ...reservation,
      outcome,
      actualCostMicrousd: actual,
      usage: { totalTokens: 1_000 },
    });
    if (finalization.requestStatus === 'completed' && draw() < 0.5) {
      await markManagedUsageClientDelivered(reservation);
    }
    // A duplicate terminal callback may only observe the stored result.
    if (draw() < 0.4) {
      const duplicate = await finalizeManagedUsageRequest({
        ...reservation,
        outcome,
        actualCostMicrousd: actual,
        usage: { totalTokens: 1_000 },
      });
      expect(duplicate.requestStatus).toBe(finalization.requestStatus);
      expect(duplicate.actualCostMicrousd).toBe(finalization.actualCostMicrousd);
    }
  } catch (error) {
    expect(error).toBeInstanceOf(ManagedUsageRequestError);
  }

  if (!expire) {
    ledger.advance(1_000 + Math.floor(draw() * 60_000));
  }
}

describe('managed usage reservation lifecycle', () => {
  let ledger: LedgerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    ledger = new LedgerDatabase();
  });

  for (const seed of [1, 7, 23, 101, 977]) {
    it(`settles every interleaving to the work it delivered, seed ${seed}`, async () => {
      ledger.openAccount({ userId: USER_ID, allocatedMicrousd: 400_000_000 });
      const draw = randomSource(seed);

      for (let index = 0; index < 24; index += 1) {
        await runTurn(ledger, draw, index);
      }

      ledger.advance(21_600_000);
      ledger.recoverStaleRequests();

      expect(ledger.requests.size).toBeGreaterThan(0);
      for (const request of ledger.requests.values()) {
        expect(TERMINAL_STATUSES).toContain(request.status);
      }
      assertLedgerInvariants(ledger);
    });
  }

  it('charges a failed turn nothing and leaves no reservation behind', async () => {
    const account = ledger.openAccount({ userId: USER_ID, allocatedMicrousd: 10_000_000 });
    const reservation = await reserveManagedUsageRequest(
      reservationInput(ledger, 'failed-turn-1', 250_000),
    );
    await markManagedUsageProviderStarted(reservation);
    expect(account.usedMicrousd).toBe(250_000);

    const finalization = await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'failed',
      actualCostMicrousd: 175_000,
    });

    expect(finalization.requestStatus).toBe('released');
    expect(finalization.actualCostMicrousd).toBe(0);
    expect(account.usedMicrousd).toBe(0);
    assertLedgerInvariants(ledger);
  });

  it('bills a retried turn once however many times the callback arrives', async () => {
    const account = ledger.openAccount({ userId: USER_ID, allocatedMicrousd: 10_000_000 });
    const reservation = await reserveManagedUsageRequest(
      reservationInput(ledger, 'retried-turn-1', 300_000),
    );
    await markManagedUsageProviderStarted(reservation);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'completed',
        actualCostMicrousd: 275_000,
      });
    }

    expect(account.usedMicrousd).toBe(275_000);
    assertLedgerInvariants(ledger);
  });

  it('settles a turn delivered after recovery once, never twice', async () => {
    const account = ledger.openAccount({ userId: USER_ID, allocatedMicrousd: 10_000_000 });
    const reservation = await reserveManagedUsageRequest(
      reservationInput(ledger, 'recovered-turn-1', 400_000),
    );
    await markManagedUsageProviderStarted(reservation);

    ledger.advance(21_600_000);
    expect(ledger.recoverStaleRequests()).toBe(1);
    expect(account.usedMicrousd).toBe(0);

    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostMicrousd: 320_000,
    });
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostMicrousd: 320_000,
    });

    const late = ledger.transactions.filter(
      (transaction) => transaction.metadata['is_late_settlement'] === true,
    );
    expect(late).toHaveLength(1);
    expect(account.usedMicrousd).toBe(320_000);
    assertLedgerInvariants(ledger);
  });

  it('never lets a release manufacture balance the account never spent', async () => {
    const account = ledger.openAccount({ userId: USER_ID, allocatedMicrousd: 10_000_000 });
    const reservation = await reserveManagedUsageRequest(
      reservationInput(ledger, 'release-guard-1', 500_000),
    );
    await markManagedUsageProviderStarted(reservation);
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostMicrousd: 500_000,
    });

    ledger.advance(21_600_000);
    ledger.recoverStaleRequests();

    expect(account.usedMicrousd).toBe(500_000);
    assertLedgerInvariants(ledger);
  });

  it('keeps an overage turn out of the plan windows in both directions', async () => {
    ledger.openAccount({
      userId: USER_ID,
      allocatedMicrousd: 400_000_000,
      topUpAllocatedMicrousd: 100_000_000,
      overageEnabled: true,
    });

    const planTurn = await reserveManagedUsageRequest(
      reservationInput(ledger, 'plan-turn-0001', 1_000_000),
    );
    await markManagedUsageProviderStarted(planTurn);
    await finalizeManagedUsageRequest({
      ...planTurn,
      outcome: 'completed',
      actualCostMicrousd: 1_000_000,
    });
    const planUsage = ledger.rollingWindows(USER_ID);
    expect(planUsage.weekly).toBe(1_000_000);

    // Over the five-hour ceiling, admitted against purchased headroom, then
    // released in full. The release may not repay the plan's window.
    const overageTurn = await reserveManagedUsageRequest({
      ...reservationInput(ledger, 'overage-turn-01', 60_000_000),
      isFlagship: false,
    });
    const overageRequest = [...ledger.requests.values()].find(
      (request) => request.idempotencyKey === 'overage-turn-01',
    );
    expect(overageRequest?.isOverage).toBe(true);

    await markManagedUsageProviderStarted(overageTurn);
    await finalizeManagedUsageRequest({
      ...overageTurn,
      outcome: 'failed',
      actualCostMicrousd: 0,
    });

    expect(ledger.rollingWindows(USER_ID).weekly).toBe(planUsage.weekly);
    for (const transaction of ledger.transactionsForRequest(overageRequest?.id ?? '')) {
      expect(transaction.metadata['is_overage']).toBe(true);
    }
    assertLedgerInvariants(ledger);
  });

  it('repairs a window an already-written release left depressed', async () => {
    ledger.openAccount({
      userId: USER_ID,
      allocatedMicrousd: 400_000_000,
      topUpAllocatedMicrousd: 100_000_000,
      overageEnabled: true,
    });

    const planTurn = await reserveManagedUsageRequest(
      reservationInput(ledger, 'plan-turn-0002', 1_000_000),
    );
    await markManagedUsageProviderStarted(planTurn);
    await finalizeManagedUsageRequest({
      ...planTurn,
      outcome: 'completed',
      actualCostMicrousd: 1_000_000,
    });
    const planOnlyWeekly = ledger.rollingWindows(USER_ID).weekly;
    const planRequest = [...ledger.requests.values()].find(
      (request) => request.idempotencyKey === 'plan-turn-0002',
    );

    const overageTurn = await reserveManagedUsageRequest(
      reservationInput(ledger, 'overage-turn-02', 60_000_000),
    );
    await markManagedUsageProviderStarted(overageTurn);
    await finalizeManagedUsageRequest({
      ...overageTurn,
      outcome: 'failed',
      actualCostMicrousd: 0,
    });
    const overageRequest = [...ledger.requests.values()].find(
      (request) => request.idempotencyKey === 'overage-turn-02',
    );

    // The state per-row labelling left behind: the reservation carries the tag,
    // the release written after it does not.
    const releases = ledger
      .transactionsForRequest(overageRequest?.id ?? '')
      .filter((transaction) => transaction.amountMicrousd < 0);
    expect(releases).toHaveLength(1);
    for (const transaction of releases) delete transaction.metadata['is_overage'];
    expect(ledger.rollingWindows(USER_ID).weekly).toBeLessThan(planOnlyWeekly);

    const amountsBefore = ledger.transactions.map((transaction) => [
      transaction.amountMicrousd,
      transaction.amountCents,
    ]);
    const balancesBefore = ledger.accounts.map((account) => account.usedMicrousd);
    const planRowsBefore = ledger
      .transactionsForRequest(planRequest?.id ?? '')
      .map((transaction) => ({ ...transaction.metadata }));

    expect(ledger.backfillOverageClassification()).toBe(1);

    expect(ledger.rollingWindows(USER_ID).weekly).toBe(planOnlyWeekly);
    expect(
      ledger.transactions.map((transaction) => [
        transaction.amountMicrousd,
        transaction.amountCents,
      ]),
    ).toEqual(amountsBefore);
    expect(ledger.accounts.map((account) => account.usedMicrousd)).toEqual(balancesBefore);
    expect(
      ledger.transactionsForRequest(planRequest?.id ?? '').map((transaction) => ({
        ...transaction.metadata,
      })),
    ).toEqual(planRowsBefore);
    assertLedgerInvariants(ledger);
  });

  it('leaves a row too old for any window alone', async () => {
    ledger.openAccount({
      userId: USER_ID,
      allocatedMicrousd: 400_000_000,
      topUpAllocatedMicrousd: 100_000_000,
      overageEnabled: true,
    });
    await reserveManagedUsageRequest(reservationInput(ledger, 'plan-turn-0003', 1_000_000));

    await reserveManagedUsageRequest(reservationInput(ledger, 'overage-turn-03', 60_000_000));
    const overageRequest = [...ledger.requests.values()].find(
      (request) => request.idempotencyKey === 'overage-turn-03',
    );
    expect(overageRequest?.isOverage).toBe(true);

    for (const transaction of ledger.transactionsForRequest(overageRequest?.id ?? '')) {
      delete transaction.metadata['is_overage'];
    }
    ledger.advance(9 * 86_400_000);

    expect(ledger.backfillOverageClassification()).toBe(0);
  });
});
