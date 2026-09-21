'use client';

import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Mic } from '@agiworkforce/icons';

import {
  MICROPHONE_NOTICE_CONTINUE_LABEL,
  MICROPHONE_NOTICE_DECLINE_LABEL,
  MICROPHONE_NOTICE_LINK_LABEL,
  MICROPHONE_NOTICE_TITLE,
  microphoneNoticeBody,
} from '../lib/microphone-notice-copy';
import { useMicrophoneNoticeStore } from '../stores/microphone-notice-store';

const ACTION_CLASS =
  'min-h-7 touch-manipulation rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] [@media(hover:none)]:min-h-11';

export function MicrophonePrivacyNotice() {
  const request = useMicrophoneNoticeStore((state) => state.request);
  const acknowledge = useMicrophoneNoticeStore((state) => state.acknowledge);
  const decline = useMicrophoneNoticeStore((state) => state.decline);
  const continueRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const bodyId = useId();

  useEffect(() => {
    if (!request) return;
    const active = document.activeElement;
    triggerRef.current = active instanceof HTMLElement ? active : null;
    continueRef.current?.focus();
  }, [request]);

  useEffect(() => () => decline(), [decline]);

  if (!request) return null;

  const returnFocus = () => {
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger?.isConnected) trigger.focus();
  };

  const handleContinue = () => {
    returnFocus();
    acknowledge();
  };

  const handleDecline = () => {
    decline();
    returnFocus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    handleDecline();
  };

  return (
    <div
      role="note"
      aria-label={MICROPHONE_NOTICE_TITLE}
      data-testid="microphone-privacy-notice"
      onKeyDown={handleKeyDown}
      className="mb-2 flex items-start gap-2 rounded-[var(--chat-radius-lg)] border border-[var(--chat-border-subtle)] bg-[var(--chat-surface-elevated)] px-3 py-2 text-[13px] leading-relaxed text-[var(--chat-text-secondary)]"
    >
      <Mic className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chat-text-muted)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p id={bodyId}>
          {microphoneNoticeBody()}{' '}
          <Link
            href="/privacy"
            className="rounded-sm text-[var(--chat-accent-primary-text)] underline underline-offset-2 transition-colors hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
          >
            {MICROPHONE_NOTICE_LINK_LABEL}
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            ref={continueRef}
            type="button"
            aria-describedby={bodyId}
            onClick={handleContinue}
            className={`${ACTION_CLASS} bg-primary text-primary-foreground`}
          >
            {MICROPHONE_NOTICE_CONTINUE_LABEL}
          </button>
          <button
            type="button"
            onClick={handleDecline}
            className={`${ACTION_CLASS} border border-border hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]`}
          >
            {MICROPHONE_NOTICE_DECLINE_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}
