import type { ManagedCloudOwner } from '../cloud-bridge/managedCloudAuthority';

export type ComputerUseCancellationReason =
  | 'account_changed'
  | 'debugger_detached'
  | 'panel_closed'
  | 'site_access_withdrawn'
  | 'superseded'
  | 'tab_intent_changed'
  | 'tab_removed'
  | 'user_cleared'
  | 'user_stopped';

export interface ComputerUseRunLease {
  readonly runId: string;
  readonly generation: number;
  readonly tabId: number;
  readonly windowId?: number;
  readonly authOwner: ManagedCloudOwner;
  readonly initialCredential: string;
  readonly controller: AbortController;
  tabIntentUrl: string;
  actionInFlight: boolean;
  lastActionEndedAt: number;
  completion: Promise<unknown> | null;
  takeover: ComputerUseTakeover | null;
}

export interface ComputerUseTakeover {
  readonly reason: string;
  readonly handedBack: Promise<void>;
  readonly handBack: () => void;
}

export interface ComputerUseStartIntent {
  readonly runId: string;
  readonly generation: number;
}

export class ComputerUseRunCancelledError extends Error {
  readonly reasonCode: ComputerUseCancellationReason;

  constructor(reasonCode: ComputerUseCancellationReason) {
    super(`Computer-use run cancelled: ${reasonCode.replace(/_/g, ' ')}`);
    this.name = 'ComputerUseRunCancelledError';
    this.reasonCode = reasonCode;
  }
}

export class ComputerUseStartCoordinator {
  private pending: ComputerUseStartIntent | null = null;

  begin(runId: string, generation: number): ComputerUseStartIntent {
    const intent = { runId, generation };
    this.pending = intent;
    return intent;
  }

  getPending(): ComputerUseStartIntent | null {
    return this.pending;
  }

  isCurrent(runId: string, generation: number): boolean {
    return this.pending?.runId === runId && this.pending.generation === generation;
  }

  cancel(expectedRunId?: string): ComputerUseStartIntent | null {
    const intent = this.pending;
    if (!intent || (expectedRunId !== undefined && intent.runId !== expectedRunId)) return null;
    this.pending = null;
    return intent;
  }
}

export class ComputerUseRunCoordinator {
  private active: ComputerUseRunLease | null = null;

  begin(input: {
    runId: string;
    generation: number;
    tabId: number;
    windowId?: number;
    tabIntentUrl: string;
    authOwner: ManagedCloudOwner;
    credential: string;
  }): ComputerUseRunLease {
    this.cancel('superseded');
    const lease: ComputerUseRunLease = {
      runId: input.runId,
      generation: input.generation,
      tabId: input.tabId,
      ...(input.windowId === undefined ? {} : { windowId: input.windowId }),
      tabIntentUrl: input.tabIntentUrl,
      authOwner: input.authOwner,
      initialCredential: input.credential,
      controller: new AbortController(),
      actionInFlight: false,
      lastActionEndedAt: 0,
      completion: null,
      takeover: null,
    };
    this.active = lease;
    return lease;
  }

  beginTakeover(lease: ComputerUseRunLease, reason: string): ComputerUseTakeover {
    this.assertCurrent(lease);
    if (lease.takeover) return lease.takeover;
    let handBack: () => void = () => undefined;
    const handedBack = new Promise<void>((resolve) => {
      handBack = resolve;
    });
    lease.takeover = { reason, handedBack, handBack };
    return lease.takeover;
  }

  endTakeover(lease: ComputerUseRunLease): boolean {
    this.assertCurrent(lease);
    const takeover = lease.takeover;
    if (!takeover) return false;
    lease.takeover = null;
    takeover.handBack();
    return true;
  }

  getActive(): ComputerUseRunLease | null {
    return this.active;
  }

  isCurrent(lease: ComputerUseRunLease): boolean {
    return this.active === lease && !lease.controller.signal.aborted;
  }

  assertCurrent(lease: ComputerUseRunLease): void {
    if (this.isCurrent(lease)) return;
    const reason = lease.controller.signal.reason;
    if (reason instanceof Error) throw reason;
    throw new ComputerUseRunCancelledError('superseded');
  }

  setActionInFlight(lease: ComputerUseRunLease, active: boolean): void {
    this.assertCurrent(lease);
    lease.actionInFlight = active;
    if (!active) lease.lastActionEndedAt = Date.now();
  }

  commitTabIntent(lease: ComputerUseRunLease, url: string): void {
    this.assertCurrent(lease);
    lease.tabIntentUrl = url;
  }

  trackCompletion(lease: ComputerUseRunLease, completion: Promise<unknown>): void {
    this.assertCurrent(lease);
    lease.completion = completion;
  }

  finish(lease: ComputerUseRunLease): boolean {
    if (this.active !== lease) return false;
    this.active = null;
    lease.actionInFlight = false;
    return true;
  }

  cancel(
    reason: ComputerUseCancellationReason,
    expectedRunId?: string,
  ): ComputerUseRunLease | null {
    const lease = this.active;
    if (!lease || (expectedRunId !== undefined && lease.runId !== expectedRunId)) return null;
    this.active = null;
    lease.actionInFlight = false;
    lease.controller.abort(new ComputerUseRunCancelledError(reason));
    return lease;
  }
}
