import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cloud, EyeOff, Folder, GitBranch, Laptop, ShieldCheck } from 'lucide-react';
import type { PrivacyMode } from '@agiworkforce/types';

import { gitStatus } from '@/api/git';
import { isTauri } from '@/lib/tauri-mock';
import { cn } from '@/lib/utils';
import { useSettingsDialogStore } from '@/stores/settingsDialogStore';
import { useSettingsStore } from '@/stores/settingsStore';

interface ComposerContextControlsProps {
  mode: PrivacyMode;
  folderPath: string | null;
  folderLabel: string | null;
  onSelectFolder?: () => void;
}

function chipClass(tone: 'neutral' | 'warning' | 'danger' = 'neutral') {
  return cn(
    'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full border px-2.5',
    'text-[11px] font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
    tone === 'neutral' &&
      'border-[var(--chat-border)] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
    tone === 'warning' && 'border-amber-500/40 bg-amber-500/10 text-amber-600',
    tone === 'danger' && 'border-red-500/40 bg-red-500/10 text-red-600',
  );
}

export function ComposerContextControls({
  mode,
  folderPath,
  folderLabel,
  onSelectFolder,
}: ComposerContextControlsProps) {
  const terminalSandbox = useSettingsStore((state) => state.executionPreferences.terminalSandbox);
  const autoApproveTools = useSettingsStore((state) => state.chatPreferences.autoApproveTools);
  const temporaryChat = useSettingsStore((state) => state.chatPreferences.temporaryChat === true);
  const setTemporaryChat = useSettingsStore((state) => state.setTemporaryChat);
  const openSettings = useSettingsDialogStore((state) => state.openSettings);
  const [branch, setBranch] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'managed' || !folderPath || !isTauri) {
      setBranch(null);
      return;
    }

    let cancelled = false;
    void gitStatus(folderPath)
      .then((status) => {
        if (!cancelled) setBranch(status.branch || null);
      })
      .catch(() => {
        if (!cancelled) setBranch(null);
      });

    return () => {
      cancelled = true;
    };
  }, [folderPath, mode]);

  const policy = useMemo(() => {
    if (!terminalSandbox.enabled || terminalSandbox.backend === 'none') {
      return {
        label: 'Terminal: Sandbox off',
        tone: 'danger' as const,
        Icon: AlertTriangle,
      };
    }
    if (terminalSandbox.policy === 'danger-full-access') {
      return {
        label: 'Terminal: Full access',
        tone: 'danger' as const,
        Icon: AlertTriangle,
      };
    }
    if (terminalSandbox.policy === 'read-only') {
      return {
        label: 'Terminal: Read-only',
        tone: 'neutral' as const,
        Icon: ShieldCheck,
      };
    }
    return {
      label: 'Terminal: Workspace write',
      tone: 'warning' as const,
      Icon: ShieldCheck,
    };
  }, [terminalSandbox.backend, terminalSandbox.enabled, terminalSandbox.policy]);

  return (
    <div
      className="flex min-w-0 items-center gap-1 overflow-hidden"
      aria-label="Active execution context"
    >
      {/* The terminal-policy chip warns about shell execution risk, which only
          exists once a workspace folder is attached. A fresh install has no
          folder AND ships with the sandbox not yet configured, so rendering
          the chip unconditionally put an alarm-red "Terminal: Sandbox off"
          in every new user's composer before they had touched the terminal.
          The full-access policy stays visible regardless, the user opted
          into that state explicitly and should keep seeing it. */}
      {(folderPath || terminalSandbox.policy === 'danger-full-access') && (
        <button
          type="button"
          className={chipClass(policy.tone)}
          onClick={() => openSettings('agent-execution')}
          aria-label={`${policy.label}. Open agent execution settings`}
          title={`${policy.label} · Open agent execution settings`}
        >
          <policy.Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="max-w-[9rem] truncate">{policy.label}</span>
        </button>
      )}

      {/*
        Temporary chat. Managed Cloud only: the flag lives on the cloud
        conversation row and is what the retention cron purges. Desktop sent
        `is_temporary: false` as a hardcoded constant, so the capability existed
        on the wire, in the schema, and in the purge job, everywhere except a
        control that could turn it on.
      */}
      {mode === 'managed' && (
        <button
          type="button"
          className={chipClass(temporaryChat ? 'warning' : 'neutral')}
          aria-pressed={temporaryChat}
          onClick={() => setTemporaryChat(!temporaryChat)}
          aria-label={
            temporaryChat
              ? 'Temporary chat is on. New chats are excluded from history and deleted automatically.'
              : 'Temporary chat is off. Turn on to keep new chats out of history.'
          }
          title={
            temporaryChat
              ? 'New chats stay out of history and are deleted automatically'
              : 'Start new chats as temporary'
          }
        >
          <EyeOff className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="max-w-[8rem] truncate">
            {temporaryChat ? 'Temporary: On' : 'Temporary'}
          </span>
        </button>
      )}

      {autoApproveTools && (
        <button
          type="button"
          className={chipClass('danger')}
          onClick={() => openSettings('agent-execution')}
          aria-label="Approvals: Automatic. Open agent execution settings"
          title="Tools can run without confirmation · Open agent execution settings"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="max-w-[8rem] truncate">Approvals: Auto</span>
        </button>
      )}

      <span className={chipClass()}>
        {mode === 'managed' ? (
          <Cloud className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <Laptop className="h-3 w-3 shrink-0" aria-hidden="true" />
        )}
        {mode === 'managed' ? 'Cloud' : mode === 'byok' ? 'BYOK' : 'Local'}
      </span>

      {folderLabel && (
        <button
          type="button"
          className={chipClass()}
          onClick={onSelectFolder}
          disabled={!onSelectFolder}
          title={folderPath ?? folderLabel}
          aria-label={`Workspace ${folderLabel}${onSelectFolder ? '. Change folder' : ''}`}
        >
          <Folder className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="max-w-[8rem] truncate">{folderLabel}</span>
        </button>
      )}

      {branch && (
        <span className={chipClass()} title={`Git branch: ${branch}`}>
          <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="max-w-[7rem] truncate">{branch}</span>
        </span>
      )}
    </div>
  );
}
