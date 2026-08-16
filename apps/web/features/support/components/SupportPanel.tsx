'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SupportSurface } from '../lib/contract';
import { useSupportAccountContext } from '../hooks/useSupportAccountContext';
import { useSupportPresence } from '../hooks/useSupportPresence';
import { handoffReasonForReply, useSupportSession } from '../hooks/useSupportSession';
import { fetchAvailableActions } from '../lib/support-client';
import { SupportAccountFacts } from './SupportAccountFacts';
import { SupportComposer } from './SupportComposer';
import { SupportHandoffPanel } from './SupportHandoffPanel';
import { SupportTranscript } from './SupportTranscript';
import styles from './SupportWidget.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function SupportPanel({
  surface,
  panelId,
  onClose,
}: {
  surface: SupportSurface;
  panelId: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const [showHandoff, setShowHandoff] = useState(false);
  const [actionTitles, setActionTitles] = useState<Record<string, string>>({});

  const session = useSupportSession(surface);
  const { presence, checking } = useSupportPresence(true);
  const { context } = useSupportAccountContext(true);
  const signedIn = context.signedIn;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 639px)');
    setIsNarrow(media.matches);
    const onChange = (event: MediaQueryListEvent) => {
      setIsNarrow(event.matches);
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const controller = new AbortController();
    void fetchAvailableActions(controller.signal).then((actions) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const action of actions) map[action.id] = action.title;
      setActionTitles(map);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [signedIn]);

  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const first = node.querySelector<HTMLElement>('textarea, button, a[href]');
    first?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !isNarrow) return;

      const node = panelRef.current;
      if (!node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [isNarrow, onClose],
  );

  const escalationReasonRef = useRef<ReturnType<typeof handoffReasonForReply>>('user_requested');

  const escalate = useCallback(
    (turnId: string) => {
      setShowHandoff(true);
      const turn = session.turns.find((candidate) => candidate.id === turnId);
      escalationReasonRef.current = handoffReasonForReply(turn);
    },
    [session.turns],
  );

  const presenceLabel = useMemo(() => {
    if (checking) return 'Checking availability';
    return presence.live ? 'A person is available' : 'No one on live chat';
  }, [checking, presence.live]);

  return (
    <div
      ref={panelRef}
      id={panelId}
      className={styles['panel']}
      role="dialog"
      aria-modal={isNarrow}
      aria-label="Product support"
      onKeyDown={onKeyDown}
    >
      <div className={styles['panelHeader']}>
        <h2 className={styles['panelTitle']}>Support</h2>
        <span className={styles['presenceChip']} data-support-presence={String(presence.live)}>
          {presenceLabel}
        </span>
        <button type="button" className={styles['iconButton']} onClick={onClose}>
          <span aria-hidden="true">✕</span>
          <span className="sr-only">Close support</span>
        </button>
      </div>

      <SupportTranscript
        turns={session.turns}
        pending={session.pending}
        actionFlows={session.actionFlows}
        actionTitles={actionTitles}
        signedIn={signedIn}
        onPrepare={session.prepareAction}
        onConfirm={session.confirmProposal}
        onCancel={session.cancelAction}
        onEscalate={escalate}
      />

      {showHandoff || session.handoff ? (
        <div className={styles['section']}>
          <SupportHandoffPanel
            presence={presence}
            checking={checking}
            handoff={session.handoff}
            pending={session.handoffPending}
            signedIn={signedIn}
            onStart={(contactEmail) => {
              session.startHandoff(
                contactEmail
                  ? { reason: escalationReasonRef.current, contactEmail }
                  : { reason: escalationReasonRef.current },
              );
            }}
            onDismiss={() => {
              setShowHandoff(false);
              session.dismissHandoff();
            }}
          />
        </div>
      ) : null}

      {context.signedIn ? (
        <SupportAccountFacts planLabel={context.planLabel} facts={context.facts} />
      ) : null}

      <SupportComposer disabled={session.pending} onAsk={session.ask} />

      {!showHandoff && !session.handoff ? (
        <div className={styles['section']}>
          <button
            type="button"
            className={styles['ghostButton']}
            onClick={() => {
              escalationReasonRef.current = 'user_requested';
              setShowHandoff(true);
            }}
          >
            Talk to a person
          </button>
        </div>
      ) : null}
    </div>
  );
}
