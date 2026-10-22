import type {
  DeveloperApprovalAnswer,
  DeveloperSessionEvent,
  DeveloperUserInputRequest,
  HostAgentNotificationKind,
  HostAgentNotificationPreferences,
} from '@agiworkforce/local-runtime-contract';
import { redactSecrets } from '@agiworkforce/utils';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { approvalNeedsMain, type PendingApprovalReview } from './runtime/approvalReview';

export interface RunningTurn {
  rootId: string;
  threadId: string;
  turnId: string;
}

export interface PendingApproval extends RunningTurn {
  requestId: string;
  summary: string;
}

export interface AgentActivity {
  runningTurns: RunningTurn[];
  pendingApprovals: PendingApproval[];
}

export function shouldNotify(
  preferences: HostAgentNotificationPreferences,
  kind: HostAgentNotificationKind,
  appFocused: boolean,
): boolean {
  if (preferences.when === 'never') return false;
  if (preferences.muted.includes(kind)) return false;
  return preferences.when === 'always' || !appFocused;
}

export class AgentActivityTracker {
  private turns = new Map<string, RunningTurn>();
  private approvals = new Map<string, PendingApproval>();

  apply(rootId: string, event: DeveloperSessionEvent): boolean {
    switch (event.type) {
      case 'turn-started':
        this.turns.set(turnKey(rootId, event.threadId, event.turnId), {
          rootId,
          threadId: event.threadId,
          turnId: event.turnId,
        });
        return true;
      case 'approval-requested':
        this.turns.set(turnKey(rootId, event.threadId, event.turnId), {
          rootId,
          threadId: event.threadId,
          turnId: event.turnId,
        });
        this.approvals.set(approvalKey(rootId, event.threadId, event.requestId), {
          rootId,
          threadId: event.threadId,
          turnId: event.turnId,
          requestId: event.requestId,
          summary: event.summary,
        });
        return true;
      case 'approval-answered':
        return this.approvals.delete(approvalKey(rootId, event.threadId, event.requestId));
      case 'turn-finished': {
        const removedTurn = this.turns.delete(turnKey(rootId, event.threadId, event.turnId));
        let removedApproval = false;
        for (const [key, approval] of this.approvals) {
          if (
            approval.rootId === rootId &&
            approval.threadId === event.threadId &&
            approval.turnId === event.turnId
          ) {
            this.approvals.delete(key);
            removedApproval = true;
          }
        }
        return removedTurn || removedApproval;
      }
      case 'runtime-stopped': {
        let removed = false;
        for (const [key, turn] of this.turns) {
          if (turn.rootId !== rootId) continue;
          this.turns.delete(key);
          removed = true;
        }
        for (const [key, approval] of this.approvals) {
          if (approval.rootId !== rootId) continue;
          this.approvals.delete(key);
          removed = true;
        }
        return removed;
      }
      default:
        return false;
    }
  }

  awaits(approval: Pick<PendingApproval, 'rootId' | 'threadId' | 'requestId'>): boolean {
    return this.approvals.has(approvalKey(approval.rootId, approval.threadId, approval.requestId));
  }

  snapshot(): AgentActivity {
    return {
      runningTurns: [...this.turns.values()],
      pendingApprovals: [...this.approvals.values()],
    };
  }
}

function turnKey(rootId: string, threadId: string, turnId: string): string {
  return `${rootId}\u0000${threadId}\u0000${turnId}`;
}

function approvalKey(rootId: string, threadId: string, requestId: string): string {
  return `${rootId}\u0000${threadId}\u0000${requestId}`;
}

export interface NotificationOptionsLike {
  title: string;
  body: string;
  silent: boolean;
  actions?: Array<{ type: 'button'; text: string }>;
}

export interface NotificationLike {
  onClick(listener: () => void): void;
  onAction(listener: (actionIndex: number) => void): void;
  onClose(listener: () => void): void;
  show(): void;
  close(): void;
}

export interface AgentNotifierDeps {
  preferences: () => HostAgentNotificationPreferences;
  appFocused: () => boolean;
  supported: () => boolean;
  supportsActions: boolean;
  create: (options: NotificationOptionsLike) => NotificationLike;
  answerApproval: (answer: DeveloperApprovalAnswer) => Promise<unknown>;
  /** The approval as the CLI holds it, with what it reaches; null once it is gone. */
  reviewApproval: (
    pending: Pick<DeveloperApprovalAnswer, 'rootId' | 'threadId' | 'turnId' | 'requestId'>,
  ) => Promise<PendingApprovalReview | null>;
  openSession: (rootId: string, threadId: string) => void;
  sessionLabel: (rootId: string) => string;
  onActivityChanged: (activity: AgentActivity) => void;
  onAnswerFailed: (error: unknown) => void;
}

const BODY_LIMIT = 180;
const COMMAND_LIMIT = 100;
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

function clip(text: string, limit: number = BODY_LIMIT): string {
  const line = text.replace(/\s+/gu, ' ').trim();
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
}

/**
 * True when the banner prints `text` exactly: nothing clipped, redacted,
 * folded onto one line or hidden by a character that draws nothing.
 */
function shownWhole(text: string, limit: number): boolean {
  return !UNPRINTABLE.test(text) && clip(redactSecrets(text), limit) === text;
}

/**
 * Approve is offered from a banner only for a request the CLI rated low or
 * medium risk and reversible, and only when the banner shows all of it: an
 * approval covers the whole command, so one the banner had to clip or redact
 * is answered in the session, where the whole request is shown. Anything
 * missing one of those facts opens the session too.
 */
export function answerableFromNotification(request: {
  summary: string;
  command: string | null;
  riskLevel: string | null;
  reversible: boolean | null;
}): boolean {
  return (
    (request.riskLevel === 'low' || request.riskLevel === 'medium') &&
    request.reversible === true &&
    shownWhole(request.summary, BODY_LIMIT) &&
    (request.command === null || shownWhole(request.command, COMMAND_LIMIT))
  );
}

/** Answered in the session, never from the banner. */
export function questionBody(request: Pick<DeveloperUserInputRequest, 'question'>): string {
  return clip(redactSecrets(request.question));
}

export const APPROVE_ACTION_INDEX = 0;
export const DENY_ACTION_INDEX = 1;

const MAX_REMEMBERED = 500;

const RISK_LABELS: Record<string, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
};

/**
 * A notification banner is shown on a locked screen and mirrored to other
 * devices, so a command line in it is redacted before it is clipped: a token
 * passed as an argument must not reach the banner.
 */
export function approvalBody(
  request: {
    summary: string;
    command: string | null;
    riskLevel: string | null;
    reversible: boolean | null;
  },
  answerable: boolean,
): string {
  const facts = [
    request.riskLevel ? RISK_LABELS[request.riskLevel] : undefined,
    request.reversible === false ? 'Cannot be undone' : undefined,
  ].filter((fact): fact is string => fact !== undefined);
  return [
    clip(redactSecrets(request.summary)),
    request.command ? `$ ${clip(redactSecrets(request.command), COMMAND_LIMIT)}` : null,
    facts.length > 0 ? facts.join(', ') : null,
    answerable ? null : `Open ${PRODUCT_NAMES.desktop} to review it.`,
  ]
    .filter((line): line is string => line !== null && line !== '')
    .join('\n');
}

/**
 * Every notification is keyed by session and request or turn, so an event the
 * relay delivers twice raises one notification, and one answered anywhere else
 * is withdrawn rather than left offering a button that no longer means
 * anything. The shown notifications are held here because Electron drops a
 * notification's action events once nothing references it.
 */
export function createAgentNotifier(deps: AgentNotifierDeps) {
  const tracker = new AgentActivityTracker();
  const seen = new Set<string>();
  const shown = new Map<string, NotificationLike>();

  const remember = (key: string): boolean => {
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > MAX_REMEMBERED) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
    return true;
  };

  const withdraw = (key: string): void => {
    const notification = shown.get(key);
    if (!notification) return;
    shown.delete(key);
    notification.close();
  };

  const present = (
    key: string,
    kind: HostAgentNotificationKind,
    options: Omit<NotificationOptionsLike, 'silent'>,
    onClick: () => void,
    onAction?: (index: number) => void,
  ): void => {
    if (!remember(key)) return;
    if (!deps.supported()) return;
    const preferences = deps.preferences();
    if (!shouldNotify(preferences, kind, deps.appFocused())) return;
    const notification = deps.create({ ...options, silent: !preferences.sound });
    notification.onClick(() => {
      shown.delete(key);
      onClick();
    });
    if (onAction) {
      notification.onAction((actionIndex) => {
        shown.delete(key);
        onAction(actionIndex);
      });
    }
    notification.onClose(() => {
      shown.delete(key);
    });
    shown.set(key, notification);
    notification.show();
  };

  const send = (approval: PendingApproval, decision: 'approve_once' | 'deny'): Promise<unknown> =>
    deps.answerApproval({
      rootId: approval.rootId,
      threadId: approval.threadId,
      turnId: approval.turnId,
      requestId: approval.requestId,
      decision,
    });

  /**
   * An Approve is judged again when it is pressed. The button was drawn from
   * the review made when the banner went up, and a banner stays up: a link
   * the write goes through, or a remote the push names, can have changed
   * since. What the CLI holds now decides, and anything that has come to need
   * the dialog in main is opened in its session, not approved from here.
   */
  const answer = (approval: PendingApproval, decision: 'approve_once' | 'deny'): void => {
    const sent: Promise<unknown> =
      decision === 'deny'
        ? send(approval, decision)
        : deps.reviewApproval(approval).then((review) => {
            if (review !== null && !approvalNeedsMain(review, decision, true)) {
              return send(approval, decision);
            }
            deps.openSession(approval.rootId, approval.threadId);
            return false;
          });
    sent.catch((error: unknown) => {
      deps.onAnswerFailed(error);
      deps.openSession(approval.rootId, approval.threadId);
    });
  };

  const handle = (
    rootId: string,
    event: DeveloperSessionEvent,
    notificationAllowed = true,
  ): void => {
    const changed = tracker.apply(rootId, event);
    const label = (): string => deps.sessionLabel(rootId);

    if (event.type === 'approval-requested' && notificationAllowed) {
      const approval: PendingApproval = {
        rootId,
        threadId: event.threadId,
        turnId: event.turnId,
        requestId: event.requestId,
        summary: event.summary,
      };
      const presentApproval = (answerable: boolean): void =>
        present(
          `approval\u0000${approvalKey(rootId, event.threadId, event.requestId)}`,
          'approval',
          {
            title: `Approval needed in ${label()}`,
            body: approvalBody(event, answerable),
            ...(answerable
              ? {
                  actions: [
                    { type: 'button' as const, text: 'Approve' },
                    { type: 'button' as const, text: 'Deny' },
                  ],
                }
              : {}),
          },
          () => deps.openSession(rootId, event.threadId),
          answerable
            ? (index) => {
                if (index === APPROVE_ACTION_INDEX) answer(approval, 'approve_once');
                else if (index === DENY_ACTION_INDEX) answer(approval, 'deny');
                else deps.openSession(rootId, event.threadId);
              }
            : undefined,
        );
      if (!deps.supportsActions || !answerableFromNotification(event)) {
        presentApproval(false);
      } else {
        // The banner is one more place an allow can be given without the
        // session open, so it is held to the rule the page and the phone are:
        // what `approvalNeedsMain` reserves gets no Approve button here.
        void deps
          .reviewApproval(approval)
          .then(
            (review) => review !== null && !approvalNeedsMain(review, 'approve_once', true),
            () => false,
          )
          .then((answerable) => {
            if (tracker.awaits(approval)) presentApproval(answerable);
          });
      }
    } else if (event.type === 'approval-answered') {
      withdraw(`approval\u0000${approvalKey(rootId, event.threadId, event.requestId)}`);
    } else if (event.type === 'user-input-requested' && notificationAllowed) {
      present(
        `question\u0000${approvalKey(rootId, event.threadId, event.requestId)}`,
        'question',
        {
          title: `The agent has a question in ${label()}`,
          body: questionBody(event),
        },
        () => deps.openSession(rootId, event.threadId),
      );
    } else if (event.type === 'user-input-answered') {
      withdraw(`question\u0000${approvalKey(rootId, event.threadId, event.requestId)}`);
    } else if (event.type === 'turn-finished') {
      const waiting = [
        `approval\u0000${rootId}\u0000${event.threadId}\u0000`,
        `question\u0000${rootId}\u0000${event.threadId}\u0000`,
      ];
      for (const [key, notification] of shown) {
        if (!waiting.some((prefix) => key.startsWith(prefix))) continue;
        shown.delete(key);
        notification.close();
      }
      if (event.outcome === 'completed' && notificationAllowed) {
        present(
          `finished\u0000${turnKey(rootId, event.threadId, event.turnId)}`,
          'turn-complete',
          {
            title: `Agent finished in ${label()}`,
            body: clip(redactSecrets(event.response)) || 'The turn is complete.',
          },
          () => deps.openSession(rootId, event.threadId),
        );
      } else if (event.outcome === 'failed' && notificationAllowed) {
        present(
          `finished\u0000${turnKey(rootId, event.threadId, event.turnId)}`,
          'turn-failed',
          {
            title: `Agent stopped with an error in ${label()}`,
            body: clip(redactSecrets(event.failure?.message ?? '')) || 'The turn did not finish.',
          },
          () => deps.openSession(rootId, event.threadId),
        );
      }
    }

    if (changed) deps.onActivityChanged(tracker.snapshot());
  };

  return {
    handle,
    activity: (): AgentActivity => tracker.snapshot(),
  };
}

export type AgentNotifier = ReturnType<typeof createAgentNotifier>;
