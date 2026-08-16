'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SUPPORT_MAX_QUESTION_LENGTH,
  type SupportActionOutcome,
  type SupportActionProposal,
  type SupportHandoffView,
  type SupportRefusedAction,
  type SupportSurface,
  type SupportTurn,
} from '../lib/contract';
import { makeAbstention } from '../lib/normalize-answer';
import {
  askSupport,
  buildAttemptedActions,
  confirmAction,
  createHandoff,
  fetchHandoffStatus,
  proposeAction,
} from '../lib/support-client';

export type SupportActionFlow =
  | { phase: 'offered'; actionId: string }
  | { phase: 'preparing'; actionId: string }
  | { phase: 'confirming'; actionId: string; proposal: SupportActionProposal }
  | { phase: 'running'; actionId: string; proposal: SupportActionProposal }
  | { phase: 'refused'; actionId: string; refusal: SupportRefusedAction }
  | { phase: 'blocked'; actionId: string; message: string }
  | { phase: 'done'; actionId: string; outcome: SupportActionOutcome };

export interface SupportSessionState {
  turns: SupportTurn[];
  pending: boolean;
  actionFlows: Record<string, SupportActionFlow>;
  handoff: SupportHandoffView | null;
  handoffPending: boolean;
  ask: (question: string) => void;
  prepareAction: (turnId: string, actionId: string) => void;
  confirmProposal: (turnId: string) => void;
  cancelAction: (turnId: string) => void;
  startHandoff: (options: { reason: HandoffReason; contactEmail?: string }) => void;
  dismissHandoff: () => void;
  reset: () => void;
}

export type HandoffReason =
  | 'user_requested'
  | 'hard_abstain'
  | 'low_confidence'
  | 'no_citation'
  | 'action_refused';

let turnCounter = 0;
function nextTurnId(prefix: string): string {
  turnCounter += 1;
  return `${prefix}-${String(turnCounter)}`;
}

export function useSupportSession(surface: SupportSurface): SupportSessionState {
  const [turns, setTurns] = useState<SupportTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [actionFlows, setActionFlows] = useState<Record<string, SupportActionFlow>>({});
  const [handoff, setHandoff] = useState<SupportHandoffView | null>(null);
  const [handoffPending, setHandoffPending] = useState(false);

  const turnsRef = useRef<SupportTurn[]>([]);
  turnsRef.current = turns;
  const actionFlowsRef = useRef<Record<string, SupportActionFlow>>({});
  actionFlowsRef.current = actionFlows;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ask = useCallback(
    (question: string) => {
      const trimmed = question.trim().slice(0, SUPPORT_MAX_QUESTION_LENGTH);
      if (trimmed.length === 0) return;

      const userTurn: SupportTurn = { id: nextTurnId('u'), role: 'user', text: trimmed };
      const historyTurns = [...turnsRef.current, userTurn];
      setTurns(historyTurns);
      setPending(true);

      void askSupport({
        message: trimmed,
        surface,
        turns: turnsRef.current,
      }).then((reply) => {
        if (!mounted.current) return;
        setTurns((prev) => [...prev, { id: nextTurnId('a'), role: 'assistant', reply }]);
        setPending(false);
      });
    },
    [surface],
  );

  const prepareAction = useCallback(
    (turnId: string, actionId: string) => {
      setActionFlows((prev) => ({ ...prev, [turnId]: { phase: 'preparing', actionId } }));
      void proposeAction(actionId, surface).then((result) => {
        if (!mounted.current) return;
        setActionFlows((prev) => {
          const next = { ...prev };
          if (result.kind === 'proposal') {
            next[turnId] = { phase: 'confirming', actionId, proposal: result.proposal };
          } else if (result.kind === 'refused') {
            next[turnId] = { phase: 'refused', actionId, refusal: result.refusal };
          } else {
            next[turnId] = { phase: 'blocked', actionId, message: result.message };
          }
          return next;
        });
      });
    },
    [surface],
  );

  const confirmProposal = useCallback((turnId: string) => {
    setActionFlows((prev) => {
      const current = prev[turnId];
      if (!current || current.phase !== 'confirming') return prev;
      const { proposal, actionId } = current;

      void confirmAction(proposal.proposalId, proposal.confirmationToken).then((outcome) => {
        if (!mounted.current) return;
        setActionFlows((inner) => ({ ...inner, [turnId]: { phase: 'done', actionId, outcome } }));
      });

      return { ...prev, [turnId]: { phase: 'running', actionId, proposal } };
    });
  }, []);

  const cancelAction = useCallback((turnId: string) => {
    setActionFlows((prev) => {
      const next = { ...prev };
      delete next[turnId];
      return next;
    });
  }, []);

  const startHandoff = useCallback(
    ({ reason, contactEmail }: { reason: HandoffReason; contactEmail?: string }) => {
      setHandoffPending(true);
      const firstUserTurn = turnsRef.current.find((turn) => turn.role === 'user');
      const summary =
        firstUserTurn && firstUserTurn.role === 'user'
          ? firstUserTurn.text.slice(0, 1000)
          : 'A visitor asked for a person.';

      const attemptedActions = buildAttemptedActions(actionFlowsRef.current);

      const input: Parameters<typeof createHandoff>[0] = {
        surface,
        reason,
        summary,
        turns: turnsRef.current,
      };
      if (attemptedActions.length > 0) input.attemptedActions = attemptedActions;
      if (contactEmail) input.contactEmail = contactEmail;
      if (typeof window !== 'undefined') input.pagePath = window.location.pathname;

      void createHandoff(input).then((result) => {
        if (!mounted.current) return;
        setHandoff(result);
        setHandoffPending(false);
      });
    },
    [surface],
  );

  const dismissHandoff = useCallback(() => {
    setHandoff(null);
  }, []);

  const reset = useCallback(() => {
    setTurns([]);
    setActionFlows({});
    setHandoff(null);
    setPending(false);
    setHandoffPending(false);
  }, []);

  const sessionId = handoff && handoff.kind === 'waiting' ? handoff.sessionId : null;
  const pollIntervalMs = handoff && handoff.kind === 'waiting' ? handoff.pollIntervalMs : 0;
  const waitExpiresAt = handoff && handoff.kind === 'waiting' ? handoff.waitExpiresAt : null;

  useEffect(() => {
    if (!sessionId || pollIntervalMs <= 0) return;
    const timer = window.setInterval(() => {
      void fetchHandoffStatus(sessionId).then((next) => {
        if (!mounted.current || !next) return;
        setHandoff((current) =>
          current && current.kind === 'waiting' && current.sessionId === sessionId ? next : current,
        );
      });
    }, pollIntervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [sessionId, pollIntervalMs]);

  useEffect(() => {
    if (!sessionId || !waitExpiresAt) return;
    const parsed = Date.parse(waitExpiresAt);
    const delay = Number.isFinite(parsed) ? Math.max(0, parsed - Date.now()) : 0;
    const timer = window.setTimeout(() => {
      if (!mounted.current) return;
      setHandoff((current) => {
        if (!current || current.kind !== 'waiting' || current.sessionId !== sessionId) {
          return current;
        }
        return {
          kind: 'timed_out',
          referenceId: current.referenceId,
          headline: 'Nobody picked up.',
          detail:
            'I stopped waiting rather than leave you hanging. You can send this by email instead.',
        };
      });
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [sessionId, waitExpiresAt]);

  return {
    turns,
    pending,
    actionFlows,
    handoff,
    handoffPending,
    ask,
    prepareAction,
    confirmProposal,
    cancelAction,
    startHandoff,
    dismissHandoff,
    reset,
  };
}

export function handoffReasonForReply(reply: SupportTurn | undefined): HandoffReason {
  if (!reply || reply.role !== 'assistant') return 'user_requested';
  if (reply.reply.kind === 'answer') return 'user_requested';
  const { reason } = reply.reply;
  if (reason.startsWith('hard_abstain')) return 'hard_abstain';
  if (reason === 'no_source' || reason === 'unverifiable_citation') return 'no_citation';
  return 'low_confidence';
}

export { makeAbstention };
