'use client';

import { Settings } from '@agiworkforce/icons';

import { PRODUCT_NAME } from '@/lib/legal-constants';
import { useVoiceSessionStore } from '@features/chat/stores/voice-session-store';

const LABEL = {
  mode: 'Voice',
  settings: 'Voice settings',
} as const;

export function VoiceHeaderLabel() {
  const setSettingsOpen = useVoiceSessionStore((store) => store.setSettingsOpen);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <p data-testid="voice-header-label" className="flex min-w-0 items-baseline gap-1.5 text-sm">
        <span className="truncate font-semibold text-[var(--chat-text-primary)]">
          {PRODUCT_NAME}
        </span>
        <span className="shrink-0 font-normal text-[var(--chat-text-muted)]">{LABEL.mode}</span>
      </p>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label={LABEL.settings}
        title={LABEL.settings}
        data-testid="voice-settings-trigger"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
