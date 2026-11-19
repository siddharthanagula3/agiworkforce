'use client';

import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { SENSITIVE_MEMORY_SUBJECTS } from '@agiworkforce/context';
import { MemoryEditor } from '@agiworkforce/unified-chat';
import {
  useCloudMemory,
  useCloudMemoryAdapter,
  useCloudMemorySnapshot,
  useMemoryView,
} from '@/features/memory/use-cloud-memory';
import type { CloudMemoryController } from '@/features/memory/cloud-memory-controller';
import { Switch, useConfirmAction, translateUiPlural } from '@agiworkforce/ui';

import { MemoryConflicts } from '@/features/settings/components/MemoryConflicts';
import { MemorySummaryCard } from '@/features/settings/components/MemorySummaryCard';
import { MemoryExclusions } from '@/features/settings/components/MemoryExclusions';
import {
  ImportMemoryDialog,
  useImportMemoryDialog,
} from '@/features/settings/components/ImportMemoryDialog';
import { conversationHref } from '@/shared/components/layout/sidebar-session-actions';
import {
  useCapabilitiesPreferences,
  type UseCapabilitiesPreferencesResult,
} from '../hooks/use-capabilities-preferences';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';
import { toUserMessage } from '@/lib/user-error-message';

const MEMORY_EDITOR_ANCHOR_ID = 'memory-editor';
const SAVE_FAILED_MESSAGE = 'Your memory settings were not saved, so nothing changed.';
const SAVE_RETRY_LABEL = 'Try again';
const CLEAR_FAILED_MESSAGE =
  'The deletion could not be confirmed. Check your saved memories before trying again.';
const CONTROL_HEIGHT = 32;
const EXPORT_FAILED_MESSAGE = 'Your memories could not be exported. Try again.';
const WORKSPACE_MEMORY_OFF_NOTICE =
  'Your workspace has memory off. An owner or admin can turn it on in Workspace → Policy.';

const MEMORY_SCOPE_EXPLANATION: ReadonlyArray<{ scope: string; meaning: string }> = [
  {
    scope: 'Account',
    meaning: 'Read in every personal chat on every device, unless a project claims it.',
  },
  {
    scope: 'Workspace',
    meaning: 'Stays in that workspace. Work and personal memories never mix.',
  },
  {
    scope: 'Project',
    meaning:
      'Read only in that project. A project on its own memory never sees your account facts.',
  },
];

const SENSITIVE_TOPICS_DESCRIPTION = `Remember your ${SENSITIVE_MEMORY_SUBJECTS} from chats, not only when you ask.`;

const NEEDS_PERSISTENT_MEMORY_HINT = 'Turn on persistent memory to change this.';

const MEMORY_DISABLED_CONTRACT =
  'When off, nothing is saved or read. Existing memories stay until you delete them.';

async function downloadMemoryExport(
  controller: CloudMemoryController,
  current: () => boolean,
): Promise<void> {
  const { blob, filename } = await controller.exportMemories(current);
  if (!current()) return;
  const url = URL.createObjectURL(blob);
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

interface MemoryRowHint {
  id: string;
  text: string;
}

function memoryRow(title: string, description: string, control: ReactNode, hint?: MemoryRowHint) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        padding: 'var(--space-4) 0',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 16, color: 'var(--text-1)', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 'var(--space-1) 0 0' }}>
          {description}
        </p>
        {hint ? (
          <p
            id={hint.id}
            style={{ fontSize: 12, color: 'var(--text-2)', margin: 'var(--space-1) 0 0' }}
          >
            {hint.text}
          </p>
        ) : null}
      </div>
      {control}
    </li>
  );
}

export function MemorySection() {
  const controller = useCloudMemory();
  const capabilities = useCapabilitiesPreferences();
  return (
    <OwnedMemorySection
      key={controller?.key ?? 'unavailable'}
      controller={controller}
      capabilities={capabilities}
    />
  );
}

function CloudMemoryEditor({ controller }: { controller: CloudMemoryController }) {
  const adapter = useCloudMemoryAdapter(controller);
  return (
    <MemoryEditor
      title={null}
      description=""
      hideClearAll
      conversationHref={conversationHref}
      adapter={adapter}
    />
  );
}

function OwnedMemorySection({
  controller,
  capabilities,
}: {
  controller: CloudMemoryController | null;
  capabilities: UseCapabilitiesPreferencesResult;
}) {
  const {
    settings,
    loaded,
    organizationMemoryAllowed,
    saveError,
    retrySave,
    loadError,
    setBoolean,
  } = capabilities;
  const togglesDisabled = !loaded || loadError !== null || !organizationMemoryAllowed;
  const needsMemory = !togglesDisabled && !settings.memory;
  const dependentHint = (id: string): MemoryRowHint | undefined =>
    needsMemory ? { id, text: NEEDS_PERSISTENT_MEMORY_HINT } : undefined;
  const snapshot = useCloudMemorySnapshot(controller);
  const memoryCount = snapshot.facts.length;
  const isEmpty = memoryCount === 0 || snapshot.syncStatus !== 'synced';
  const capture = useMemoryView(controller);
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const importDialog = useImportMemoryDialog();
  const [clearError, setClearError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const onExport = useCallback(async () => {
    const current = capture();
    if (!controller || !current()) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadMemoryExport(controller, current);
    } catch (error) {
      if (current()) setExportError(toUserMessage(error, EXPORT_FAILED_MESSAGE));
    } finally {
      if (current()) setExporting(false);
    }
  }, [controller, capture]);

  const onManageMemories = useCallback(() => {
    document.getElementById(MEMORY_EDITOR_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const onClearAll = useCallback(() => {
    const current = capture();
    if (isEmpty || !controller || !current()) return;
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
        if (!current()) return;
        setClearError(null);
        try {
          await controller.adapter(current).clear();
        } catch (error) {
          if (current()) setClearError(toUserMessage(error, CLEAR_FAILED_MESSAGE));
        }
      },
    });
  }, [isEmpty, memoryCount, confirm, controller, capture]);

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
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
          Facts saved in your selected Cloud workspace. Device-local and offline memories are
          separate and are not shown or uploaded here.
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

        <ul className="divide-y divide-border" style={{ margin: 0, padding: 0 }}>
          {memoryRow(
            'Persistent memory',
            'Allow the assistant to remember details across conversations',
            <Switch
              aria-label="Persistent memory"
              checked={settings.memory}
              disabled={togglesDisabled}
              onCheckedChange={(value) => setBoolean('memory', value)}
            />,
          )}
        </ul>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
          }}
        >
          <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }} role="status">
            {snapshot.syncStatus !== 'synced'
              ? 'Cloud memories are not loaded.'
              : translateUiPlural('settings', 'counts.savedMemories', memoryCount, {
                  one: '{{count}} saved memory',
                  other: '{{count}} saved memories',
                })}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
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

      <ul className="divide-y divide-border" style={{ margin: 0, padding: 0 }}>
        {memoryRow(
          'Save memories from chats',
          'Let the assistant save lasting details you mention in a chat without being asked. When this is off, it saves only what you ask it to remember.',
          <Switch
            aria-label="Save memories from chats"
            aria-describedby={needsMemory ? 'memory-hint-save-from-chats' : undefined}
            checked={settings.generateFromHistory}
            disabled={togglesDisabled || !settings.memory}
            onCheckedChange={(value) => setBoolean('generateFromHistory', value)}
          />,
          dependentHint('memory-hint-save-from-chats'),
        )}

        {memoryRow(
          'Search past chats',
          'Let the assistant look up excerpts from your other conversations when answering. Never used in temporary chats.',
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
            aria-describedby={needsMemory ? 'memory-hint-sensitive-topics' : undefined}
            checked={settings.includeSensitiveTopics}
            disabled={togglesDisabled || !settings.memory}
            onCheckedChange={(value) => setBoolean('includeSensitiveTopics', value)}
          />,
          dependentHint('memory-hint-sensitive-topics'),
        )}

        {memoryRow(
          'Allow memory generation from tool-assisted chats',
          'Create memories from chats that use tools, connectors, code, or web search',
          <Switch
            aria-label="Allow memory generation from tool-assisted chats"
            aria-describedby={needsMemory ? 'memory-hint-tool-assisted' : undefined}
            checked={settings.allowToolAssistedGeneration}
            disabled={togglesDisabled || !settings.memory}
            onCheckedChange={(value) => setBoolean('allowToolAssistedGeneration', value)}
          />,
          dependentHint('memory-hint-tool-assisted'),
        )}

        {memoryRow(
          'Import memory from other AI providers',
          'Bring what another assistant knows about you into your saved memories.',
          <button
            type="button"
            onClick={importDialog.open}
            disabled={!controller}
            style={pillButtonStyle(!controller)}
          >
            Start import
          </button>,
        )}
      </ul>

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
              <dd style={{ fontSize: 12, color: 'var(--text-3)', margin: 'var(--space-1) 0 0' }}>
                {entry.meaning}
              </dd>
            </div>
          ))}
        </dl>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
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
        {controller ? (
          <CloudMemoryEditor controller={controller} />
        ) : (
          <p role="status">
            Cloud memory is unavailable until your account and workspace are ready.
          </p>
        )}
      </section>

      <MemoryConflicts />

      <ImportMemoryDialog
        open={importDialog.isOpen}
        onOpenChange={(next) => (next ? importDialog.open() : importDialog.close())}
      />
    </section>
  );
}
