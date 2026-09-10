'use client';

import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { MemoryEditor, useMemoryStore, selectMemoryCount } from '@agiworkforce/unified-chat';
import { Switch, useConfirmAction } from '@agiworkforce/ui';

import { MemoryExclusions } from '@/features/settings/components/MemoryExclusions';
import {
  ImportMemoryDialog,
  useImportMemoryDialog,
} from '@/features/settings/components/ImportMemoryDialog';
import { useCapabilitiesPreferences } from '../hooks/use-capabilities-preferences';

const MEMORY_EDITOR_ANCHOR_ID = 'memory-editor';
const SAVE_FAILED_MESSAGE = 'Your memory settings were not saved, so nothing changed.';
const SAVE_RETRY_LABEL = 'Try again';
const CONTROL_HEIGHT = 30;
const WORKSPACE_MEMORY_OFF_NOTICE =
  'Your workspace has memory turned off, so none of these settings apply until an owner or admin turns it back on in Workspace → Policy.';

function memoryRow(title: string, description: string, control: ReactNode) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 16px',
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>{description}</p>
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
  const clearAllMemories = useMemoryStore((s) => s.clear);
  const hydrateMemories = useMemoryStore((s) => s.hydrateFromServer);
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const importDialog = useImportMemoryDialog();

  const onManageMemories = useCallback(() => {
    document.getElementById(MEMORY_EDITOR_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const onImported = useCallback(() => {
    void hydrateMemories();
  }, [hydrateMemories]);

  const onClearAll = useCallback(() => {
    if (memoryCount === 0) return;
    confirm({
      title: 'Delete all memory facts?',
      description: `This cannot be undone. All ${memoryCount} ${memoryCount === 1 ? 'fact' : 'facts'} would have to be added again.`,
      confirmLabel: 'Forget everything',
      destructive: true,
      onConfirm: () => clearAllMemories(),
    });
  }, [memoryCount, confirm, clearAllMemories]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {confirmDialog}
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Memory
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Facts the assistant should remember about you across conversations. Stored on this device,
          and synced to your account across devices when you&apos;re signed in.
        </p>
      </div>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: 16,
        }}
      >
        {organizationMemoryAllowed ? null : (
          <p
            role="status"
            style={{
              margin: 0,
              padding: '10px 16px',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-1)',
              fontSize: 13,
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
              gap: 16,
              padding: '10px 16px',
              border: '1px solid var(--settings-destructive)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--settings-destructive-text)',
              fontSize: 13,
            }}
          >
            <span>{`${SAVE_FAILED_MESSAGE} ${saveError}`}</span>
            {retrySave ? (
              <button
                type="button"
                onClick={retrySave}
                style={{
                  height: CONTROL_HEIGHT,
                  padding: '0 10px',
                  fontSize: 12,
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
            gap: 16,
            padding: '4px 16px',
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }} role="status">
            {memoryCount} saved {memoryCount === 1 ? 'memory' : 'memories'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={importDialog.open}
              style={{
                height: CONTROL_HEIGHT,
                padding: '0 10px',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-1)',
                background: 'transparent',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Import memories
            </button>
            <button
              type="button"
              onClick={onManageMemories}
              disabled={memoryCount === 0}
              style={{
                height: CONTROL_HEIGHT,
                padding: '0 10px',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-1)',
                background: 'transparent',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                cursor: memoryCount === 0 ? 'default' : 'pointer',
                opacity: memoryCount === 0 ? 0.5 : 1,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Manage memories
            </button>
            <button
              type="button"
              onClick={onClearAll}
              disabled={memoryCount === 0}
              style={{
                height: CONTROL_HEIGHT,
                padding: '0 10px',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--settings-destructive-text)',
                background: 'transparent',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                cursor: memoryCount === 0 ? 'default' : 'pointer',
                opacity: memoryCount === 0 ? 0.5 : 1,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Clear all memories
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {memoryRow(
          'Generate from past chats',
          'Use conversation history to generate better responses',
          <Switch
            aria-label="Generate from past chats"
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
        <MemoryEditor title={null} description="" hideClearAll />
      </section>

      <ImportMemoryDialog
        open={importDialog.isOpen}
        onOpenChange={(next) => (next ? importDialog.open() : importDialog.close())}
        onImported={onImported}
      />
    </div>
  );
}
