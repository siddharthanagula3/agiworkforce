'use client';

import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { SENSITIVE_MEMORY_SUBJECTS } from '@agiworkforce/context';
import { MemoryEditor, useMemoryStore, selectMemoryCount } from '@agiworkforce/unified-chat';
import { Switch, useConfirmAction, translateUiPlural } from '@agiworkforce/ui';

import { MemoryConflicts } from '@/features/settings/components/MemoryConflicts';
import { MemorySummaryCard } from '@/features/settings/components/MemorySummaryCard';
import { MemoryExclusions } from '@/features/settings/components/MemoryExclusions';
import {
  ImportMemoryDialog,
  useImportMemoryDialog,
} from '@/features/settings/components/ImportMemoryDialog';
import { conversationHref } from '@/shared/components/layout/sidebar-session-actions';
import { useCapabilitiesPreferences } from '../hooks/use-capabilities-preferences';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';
import { toUserMessage } from '@/lib/user-error-message';
import { apiErrorMessage } from '@/lib/client/api-error-message';

const MEMORY_EDITOR_ANCHOR_ID = 'memory-editor';
const SAVE_FAILED_MESSAGE = 'Your memory settings were not saved, so nothing changed.';
const SAVE_RETRY_LABEL = 'Try again';
const CLEAR_FAILED_MESSAGE = 'Your memories were not deleted. Try again.';
const CONTROL_HEIGHT = 32;
const EXPORT_FAILED_MESSAGE = 'Your memories could not be exported. Try again.';
const MEMORY_EXPORT_PATH = '/api/memory/export';
const MEMORY_EXPORT_FALLBACK_FILENAME = 'memories.json';
const ATTACHMENT_FILENAME_RE = /filename="([^"]+)"/;
const WORKSPACE_MEMORY_OFF_NOTICE =
  'Your workspace has memory turned off, so none of these settings apply until an owner or admin turns it back on in Workspace → Policy.';

const MEMORY_SCOPE_EXPLANATION: ReadonlyArray<{ scope: string; meaning: string }> = [
  {
    scope: 'Account',
    meaning:
      'Read in every personal chat, on every device you sign in to. This is where a fact lands unless a project claims it.',
  },
  {
    scope: 'Workspace',
    meaning:
      'A memory written inside a workspace stays inside it. Nothing you record at work is read in a personal chat, and nothing personal is read at work.',
  },
  {
    scope: 'Project',
    meaning:
      'Read only in that project. A project set to use its own memory only never sees your account facts, so a project can hold a standing brief, the decisions and background a long project accumulates, without any of it leaking into an unrelated chat.',
  },
];

const SENSITIVE_TOPICS_DESCRIPTION = `Let AGI remember your ${SENSITIVE_MEMORY_SUBJECTS} from chats. While this is off, AGI is designed to keep these only when you say "Remember that" in a chat on the web, desktop, mobile or Chrome, or add them here. Memories saved earlier stay until you delete them.`;

const MEMORY_DISABLED_CONTRACT =
  'Turning persistent memory off stops both halves: nothing new is saved, and the memories you already have are no longer read into any answer. They are kept until you delete them.';

async function downloadMemoryExport(): Promise<void> {
  const response = await fetch(MEMORY_EXPORT_PATH, { credentials: 'include' });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(apiErrorMessage(body, EXPORT_FAILED_MESSAGE));
  }
  const filename =
    ATTACHMENT_FILENAME_RE.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
    MEMORY_EXPORT_FALLBACK_FILENAME;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function pillButtonStyle(disabled: boolean): CSSProperties {
  return {
    height: CONTROL_HEIGHT,
    padding: '0 var(--space-3)',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-1)',
    background: 'transparent',
    border: '1px solid var(--settings-border)',
    borderRadius: 'var(--corner-pill)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
}

function memoryRow(title: string, description: string, control: ReactNode) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        padding: 'var(--space-3) var(--space-4)',
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 'var(--space-1) 0 0' }}>
          {description}
        </p>
      </div>
      {control}
    </div>
  );
}

export function MemorySection() {
  const { settings, organizationMemoryAllowed, saveError, retrySave, loadError, setBoolean } =
    useCapabilitiesPreferences();
  const togglesDisabled = loadError !== null || !organizationMemoryAllowed;
  const memoryCount = useMemoryStore(selectMemoryCount);
  const isEmpty = memoryCount === 0;
  const clearAllMemories = useMemoryStore((s) => s.clear);
  const hydrateMemories = useMemoryStore((s) => s.hydrateFromServer);
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const importDialog = useImportMemoryDialog();
  const [clearError, setClearError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const onExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadMemoryExport();
    } catch (error) {
      setExportError(toUserMessage(error, EXPORT_FAILED_MESSAGE));
    } finally {
      setExporting(false);
    }
  }, []);

  const onManageMemories = useCallback(() => {
    document.getElementById(MEMORY_EDITOR_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const onImported = useCallback(() => {
    void hydrateMemories();
  }, [hydrateMemories]);

  const onClearAll = useCallback(() => {
    if (isEmpty) return;
    confirm({
      title: 'Delete all memory facts?',
      description: translateUiPlural('settings', 'counts.deleteAllMemoryFacts', memoryCount, {
        one: 'This cannot be undone. All {{count}} fact would have to be added again. Your chats are not deleted.',
        other:
          'This cannot be undone. All {{count}} facts would have to be added again. Your chats are not deleted.',
      }),
      confirmLabel: 'Forget everything',
      destructive: true,
      onConfirm: async () => {
        setClearError(null);
        try {
          await clearAllMemories();
        } catch (error) {
          setClearError(toUserMessage(error, CLEAR_FAILED_MESSAGE));
        }
      },
    });
  }, [isEmpty, memoryCount, confirm, clearAllMemories]);

  return (
    <section
      aria-labelledby="memory-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
    >
      {confirmDialog}
      <div>
        <h2 id="memory-heading" className="mb-1 text-h3 text-foreground">
          Memory
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Facts the assistant should remember about you across conversations. Stored on this device,
          and synced to your account across devices when you&apos;re signed in.
        </p>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <HelpArticleLink docId="memory" label="How memory works" />
        </div>
      </div>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: 'var(--space-4)',
        }}
      >
        {organizationMemoryAllowed ? null : (
          <p
            role="status"
            style={{
              margin: 0,
              padding: 'var(--space-3) var(--space-4)',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-1)',
              fontSize: 14,
            }}
          >
            {WORKSPACE_MEMORY_OFF_NOTICE}
          </p>
        )}

        {saveError ? (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-4)',
              border: '1px solid var(--settings-destructive)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--settings-destructive-text)',
              fontSize: 14,
            }}
          >
            <span>{`${SAVE_FAILED_MESSAGE} ${saveError}`}</span>
            {retrySave ? (
              <button
                type="button"
                onClick={retrySave}
                style={{
                  height: CONTROL_HEIGHT,
                  padding: '0 var(--space-3)',
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--settings-destructive-text)',
                  background: 'transparent',
                  border: '1px solid var(--settings-destructive)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {SAVE_RETRY_LABEL}
              </button>
            ) : null}
          </div>
        ) : null}

        {memoryRow(
          'Persistent memory',
          'Allow AGI to remember details across conversations',
          <Switch
            aria-label="Persistent memory"
            checked={settings.memory}
            disabled={togglesDisabled}
            onCheckedChange={(value) => setBoolean('memory', value)}
          />,
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-1) var(--space-4)',
          }}
        >
          <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }} role="status">
            {translateUiPlural('settings', 'counts.savedMemories', memoryCount, {
              one: '{{count}} saved memory',
              other: '{{count}} saved memories',
            })}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <button type="button" onClick={importDialog.open} style={pillButtonStyle(false)}>
              Import memories
            </button>
            <button
              type="button"
              onClick={() => void onExport()}
              disabled={isEmpty || exporting}
              aria-busy={exporting}
              style={pillButtonStyle(isEmpty || exporting)}
            >
              {exporting ? 'Exporting…' : 'Export memories'}
            </button>
            <button
              type="button"
              onClick={onManageMemories}
              disabled={isEmpty}
              style={pillButtonStyle(isEmpty)}
            >
              Manage memories
            </button>
            <button
              type="button"
              onClick={onClearAll}
              disabled={isEmpty}
              style={{
                ...pillButtonStyle(isEmpty),
                color: 'var(--settings-destructive-text)',
              }}
            >
              Clear all memories
            </button>
          </div>
        </div>
        {exportError ? (
          <p
            role="alert"
            style={{ margin: 0, fontSize: 14, color: 'var(--settings-destructive-text)' }}
          >
            {exportError}
          </p>
        ) : null}
        {clearError ? (
          <p
            role="alert"
            style={{ margin: 0, fontSize: 14, color: 'var(--settings-destructive-text)' }}
          >
            {clearError}
          </p>
        ) : null}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {memoryRow(
          'Save memories from chats',
          'Let AGI save lasting details you mention in a chat without being asked. When this is off, it saves only what you ask it to remember.',
          <Switch
            aria-label="Save memories from chats"
            checked={settings.generateFromHistory}
            disabled={togglesDisabled || !settings.memory}
            onCheckedChange={(value) => setBoolean('generateFromHistory', value)}
          />,
        )}

        {memoryRow(
          'Search past chats',
          'Let AGI look up excerpts from your other conversations when answering. Never used in temporary chats.',
          <Switch
            aria-label="Search past chats"
            checked={settings.searchPastChats}
            disabled={togglesDisabled}
            onCheckedChange={(value) => setBoolean('searchPastChats', value)}
          />,
        )}

        {memoryRow(
          'Include sensitive topics in memory',
          SENSITIVE_TOPICS_DESCRIPTION,
          <Switch
            aria-label="Include sensitive topics in memory"
            checked={settings.includeSensitiveTopics}
            disabled={togglesDisabled || !settings.memory}
            onCheckedChange={(value) => setBoolean('includeSensitiveTopics', value)}
          />,
        )}

        {memoryRow(
          'Allow memory generation from tool-assisted chats',
          'Create memories from chats that use tools, connectors, code, or web search',
          <Switch
            aria-label="Allow memory generation from tool-assisted chats"
            checked={settings.allowToolAssistedGeneration}
            disabled={togglesDisabled || !settings.memory}
            onCheckedChange={(value) => setBoolean('allowToolAssistedGeneration', value)}
          />,
        )}
      </section>

      <section
        aria-labelledby="memory-scope-heading"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: 'var(--space-4)',
        }}
      >
        <h2
          id="memory-scope-heading"
          style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: 0 }}
        >
          Where a memory applies
        </h2>
        <dl style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', margin: 0 }}>
          {MEMORY_SCOPE_EXPLANATION.map((entry) => (
            <div key={entry.scope}>
              <dt style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                {entry.scope}
              </dt>
              <dd style={{ fontSize: 14, color: 'var(--text-3)', margin: 'var(--space-1) 0 0' }}>
                {entry.meaning}
              </dd>
            </div>
          ))}
        </dl>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          {MEMORY_DISABLED_CONTRACT}
        </p>
      </section>

      <MemorySummaryCard memoryCount={memoryCount} />

      {/* Exclusions sit ABOVE the memory list: the rule that governs what gets
          saved is more useful before you read what was. */}
      <MemoryExclusions />

      <section
        id={MEMORY_EDITOR_ANCHOR_ID}
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
          minHeight: 360,
        }}
      >
        <MemoryEditor
          title={null}
          description=""
          hideClearAll
          conversationHref={conversationHref}
        />
      </section>

      <MemoryConflicts />

      <ImportMemoryDialog
        open={importDialog.isOpen}
        onOpenChange={(next) => (next ? importDialog.open() : importDialog.close())}
        onImported={onImported}
      />
    </section>
  );
}
