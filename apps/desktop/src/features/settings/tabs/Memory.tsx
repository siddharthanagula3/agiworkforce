import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Download, Trash2, Upload } from 'lucide-react';
import { useConfirmAction } from '@agiworkforce/ui';
import {
  MemoryEditor,
  type MemoryEditorDataAdapter,
  type MemoryFact,
} from '@agiworkforce/unified-chat';

import { Button } from '../../../ui/Button';
import { Switch } from '../../../ui/Switch';
import { useMemoryStore as useDesktopMemoryStore } from '../../../stores/memoryStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import {
  createCloudMemory,
  deleteCloudMemory,
  listCloudMemories,
  updateCloudMemory,
} from '../../../api/cloudMemory';

interface MemorySettingsContentProps {
  adapter: MemoryEditorDataAdapter;
  scope: 'local' | 'cloud';
  loadError?: string | null;
}

function MemorySettingsContent({ adapter, scope, loadError = null }: MemorySettingsContentProps) {
  const memoryEnabled = useSettingsStore((state) => state.chatPreferences.memoryEnabled === true);
  const allowToolAssistedGeneration = useSettingsStore(
    (state) => state.chatPreferences.allowToolAssistedMemoryGeneration === true,
  );
  const setMemoryEnabled = useSettingsStore((state) => state.setMemoryEnabled);
  const setAllowToolAssistedMemoryGeneration = useSettingsStore(
    (state) => state.setAllowToolAssistedMemoryGeneration,
  );
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDeclined, setResetDeclined] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const exportMemories = useCallback(async (format: 'json' | 'markdown') => {
    setExporting(true);
    setExportError(null);
    try {
      const store = useDesktopMemoryStore.getState();
      const blob =
        format === 'json'
          ? new Blob([JSON.stringify(await store.exportBackup(), null, 2)], {
              type: 'application/json',
            })
          : new Blob([await store.exportMarkdown()], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `agi-memories-${new Date().toISOString().slice(0, 10)}.${
        format === 'json' ? 'json' : 'md'
      }`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Memories could not be exported.');
    } finally {
      setExporting(false);
    }
  }, []);

  const updateMaster = useCallback(
    async (enabled: boolean) => {
      setSavingPolicy(true);
      setPolicyError(null);
      try {
        await setMemoryEnabled(enabled);
      } catch (error) {
        setPolicyError(
          error instanceof Error ? error.message : 'Memory settings could not be saved.',
        );
      } finally {
        setSavingPolicy(false);
      }
    },
    [setMemoryEnabled],
  );

  const updateToolScope = useCallback(
    async (enabled: boolean) => {
      setSavingPolicy(true);
      setPolicyError(null);
      try {
        await setAllowToolAssistedMemoryGeneration(enabled);
      } catch (error) {
        setPolicyError(
          error instanceof Error ? error.message : 'Memory settings could not be saved.',
        );
      } finally {
        setSavingPolicy(false);
      }
    },
    [setAllowToolAssistedMemoryGeneration],
  );

  const importMemories = useCallback(async (file: File) => {
    setImporting(true);
    setImportStatus(null);
    try {
      const result = await useDesktopMemoryStore.getState().importBackup(await file.text());
      const kept = result.memories_skipped;
      const parts = [
        `Imported ${result.memories_imported} ${result.memories_imported === 1 ? 'memory' : 'memories'}.`,
        kept > 0
          ? `${kept} already saved on this device ${kept === 1 ? 'was' : 'were'} kept unchanged.`
          : '',
        result.errors.length > 0
          ? `${result.errors.length} ${result.errors.length === 1 ? 'entry' : 'entries'} could not be read.`
          : '',
      ];
      setImportStatus({ ok: true, message: parts.filter(Boolean).join(' ') });
    } catch (error) {
      setImportStatus({
        ok: false,
        message:
          error instanceof Error
            ? `That file could not be imported. ${error.message}`
            : 'That file could not be imported.',
      });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }, []);

  const resetMemories = useCallback(() => {
    const count = adapter.facts.length;
    if (count === 0) return;
    const noun = count === 1 ? 'memory' : 'memories';
    confirm({
      title: `Delete all ${count} ${noun}?`,
      description:
        scope === 'cloud'
          ? `This permanently deletes every memory saved to your Managed Cloud account. Chats on all your devices stop using them, and they cannot be recovered.`
          : `This permanently deletes every memory saved on this device. Chats stop using them, and they cannot be recovered unless you exported them first. Your system asks you once more before anything is deleted.`,
      confirmLabel: 'Delete all memories',
      destructive: true,
      onConfirm: async () => {
        setResetting(true);
        setPolicyError(null);
        setResetDeclined(false);
        try {
          // The device adapter resolves to null when the system prompt was declined.
          setResetDeclined((await adapter.clear()) === null);
        } catch (error) {
          setPolicyError(error instanceof Error ? error.message : 'Memories could not be reset.');
        } finally {
          setResetting(false);
        }
      },
    });
  }, [adapter, confirm, scope]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <section className="space-y-5 border-b border-border p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2.5">
            <Brain className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-h4">Memory</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {scope === 'cloud'
                ? 'Control what AGI can remember and generate for your Managed Cloud account.'
                : 'Control what AGI can remember and generate on this device.'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-5 rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">Enable memories</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Generate memories from chats and bring saved memories into new chats.
              </p>
            </div>
            <Switch
              aria-label="Enable memories"
              checked={memoryEnabled}
              disabled={savingPolicy}
              onCheckedChange={(enabled) => void updateMaster(enabled)}
            />
          </div>

          <div className="flex items-center justify-between gap-5 rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">
                Allow memory generation from tool-assisted chats
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Includes chats that use tools, connectors, code execution, or web search.
              </p>
            </div>
            <Switch
              aria-label="Allow memory generation from tool-assisted chats"
              checked={allowToolAssistedGeneration}
              disabled={!memoryEnabled || savingPolicy}
              onCheckedChange={(enabled) => void updateToolScope(enabled)}
            />
          </div>

          <div className="flex items-center justify-between gap-5 rounded-lg border border-destructive/30 p-4">
            <div>
              <p className="text-sm font-medium">Reset memories</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Permanently delete all {scope === 'cloud' ? 'account' : 'device'} memories.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={adapter.facts.length === 0 || resetting}
              onClick={resetMemories}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {resetting ? 'Resetting…' : 'Reset memories'}
            </Button>
          </div>
          {scope === 'local' && (
            <div className="flex items-center justify-between gap-5 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Export memories</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Download every device memory. JSON can be imported again; Markdown is for reading.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={adapter.facts.length === 0 || exporting}
                  onClick={() => void exportMemories('markdown')}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export Markdown
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={adapter.facts.length === 0 || exporting}
                  onClick={() => void exportMemories('json')}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export JSON
                </Button>
              </div>
            </div>
          )}
          {scope === 'local' && (
            <div className="flex items-center justify-between gap-5 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Import memories</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Add memories from a JSON export. Memories already on this device are kept.
                </p>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importMemories(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {importing ? 'Importing…' : 'Import JSON'}
              </Button>
            </div>
          )}
        </div>

        {exportError ? (
          <p role="alert" className="text-xs text-destructive">
            {exportError}
          </p>
        ) : null}
        {importStatus ? (
          <p
            role={importStatus.ok ? 'status' : 'alert'}
            className={
              importStatus.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'
            }
          >
            {importStatus.message}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Turning memory off stops automatic retrieval and generation. You can still review, edit,
          or delete saved memories below.
        </p>
        {policyError ? (
          <p role="alert" className="text-xs text-destructive">
            {policyError}
          </p>
        ) : null}
        {resetDeclined ? (
          <p role="status" className="text-xs text-muted-foreground">
            Nothing was deleted.
          </p>
        ) : null}
        {loadError ? (
          <p role="alert" className="text-xs text-destructive">
            The memories saved on this device could not be loaded. {loadError}
          </p>
        ) : null}
      </section>

      <MemoryEditor
        adapter={adapter}
        title="Saved memories"
        description={
          scope === 'cloud'
            ? 'Facts stored in your Managed Cloud account.'
            : 'Facts stored in the native memory database on this device.'
        }
        hideClearAll
        className="min-h-[360px] flex-1"
      />
      {confirmDialog}
    </div>
  );
}

function optimisticFact(text: string): MemoryFact {
  const now = new Date().toISOString();
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? `pending_${globalThis.crypto.randomUUID()}`
      : `pending_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  return { id, text, createdAt: now, updatedAt: now, pending: true };
}

function asMemoryError(error: unknown, fallback: string): Error {
  const detail = error instanceof Error ? error.message.trim() : '';
  return new Error(detail ? `${fallback} (${detail})` : fallback);
}

function CloudMemoryTab() {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [syncStatus, setSyncStatus] = useState<MemoryEditorDataAdapter['syncStatus']>('idle');

  const hydrateFromServer = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      setFacts(await listCloudMemories());
      setSyncStatus('synced');
    } catch (error) {
      setSyncStatus('error');
      throw error;
    }
  }, []);

  const adapter = useMemo<MemoryEditorDataAdapter>(
    () => ({
      scope: 'cloud',
      facts,
      syncStatus,
      hydrateFromServer,
      // Local memory (useMemoryStore) applies these synchronously and syncs
      // afterwards, so local mode has always felt instant while cloud mode sat
      // waiting on a round trip in the same screen. These bring cloud to
      // parity: apply first, reconcile with the server row, and put the list
      // back if the write fails. Each rethrows so MemoryEditor can say why the
      // list just changed back.
      add: async (text) => {
        const optimistic = optimisticFact(text);
        setFacts((current) => [optimistic, ...current]);
        try {
          const created = await createCloudMemory(text);
          setFacts((current) =>
            current.map((fact) => (fact.id === optimistic.id ? created : fact)),
          );
        } catch (error) {
          setFacts((current) => current.filter((fact) => fact.id !== optimistic.id));
          throw asMemoryError(error, 'Could not save that memory. It has been removed again.');
        }
      },
      update: async (id, text) => {
        let previous: MemoryFact | undefined;
        setFacts((current) =>
          current.map((fact) => {
            if (fact.id !== id) return fact;
            previous = fact;
            return { ...fact, text, updatedAt: new Date().toISOString() };
          }),
        );
        try {
          const updated = await updateCloudMemory(id, text);
          setFacts((current) => current.map((fact) => (fact.id === id ? updated : fact)));
        } catch (error) {
          if (previous) {
            const restored = previous;
            setFacts((current) => current.map((fact) => (fact.id === id ? restored : fact)));
          }
          throw asMemoryError(error, 'Could not save that edit. The earlier text is back.');
        }
      },
      remove: async (id) => {
        let removed: MemoryFact | undefined;
        let removedIndex = -1;
        setFacts((current) => {
          removedIndex = current.findIndex((fact) => fact.id === id);
          if (removedIndex === -1) return current;
          removed = current[removedIndex];
          return current.filter((fact) => fact.id !== id);
        });
        try {
          await deleteCloudMemory(id);
        } catch (error) {
          // Restored at its original index rather than appended, so a failed
          // delete does not silently reorder the list.
          if (removed) {
            const restored = removed;
            const at = removedIndex;
            setFacts((current) => {
              if (current.some((fact) => fact.id === restored.id)) return current;
              const next = [...current];
              next.splice(Math.max(0, Math.min(at, next.length)), 0, restored);
              return next;
            });
          }
          throw asMemoryError(error, 'Could not delete that memory. It has been put back.');
        }
      },
      clear: async () => {
        let failedDeletes = 0;
        try {
          const results = await Promise.allSettled(facts.map((fact) => deleteCloudMemory(fact.id)));
          failedDeletes = results.filter((result) => result.status === 'rejected').length;
        } finally {
          await hydrateFromServer();
        }
        if (failedDeletes > 0) {
          throw new Error(
            `${failedDeletes} ${failedDeletes === 1 ? 'memory' : 'memories'} could not be deleted.`,
          );
        }
      },
    }),
    [facts, hydrateFromServer, syncStatus],
  );

  return <MemorySettingsContent adapter={adapter} scope="cloud" />;
}

function LocalMemoryTab() {
  const memories = useDesktopMemoryStore((state) => state.memories);
  const error = useDesktopMemoryStore((state) => state.error);
  const loadAll = useDesktopMemoryStore((state) => state.loadAll);
  const storeMemory = useDesktopMemoryStore((state) => state.storeMemory);
  const deleteMemory = useDesktopMemoryStore((state) => state.deleteMemory);
  const deleteAll = useDesktopMemoryStore((state) => state.deleteAll);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const facts = useMemo<MemoryFact[]>(
    () =>
      memories.map((memory) => ({
        id: String(memory.id),
        text: memory.content,
        createdAt: memory.created_at,
        updatedAt: memory.updated_at,
      })),
    [memories],
  );

  const adapter = useMemo<MemoryEditorDataAdapter>(
    () => ({
      scope: 'local',
      facts,
      syncStatus: 'unavailable',
      hydrateFromServer: loadAll,
      add: async (text) => {
        const topic = `manual_${crypto.randomUUID()}`;
        await storeMemory('fact', topic, text, 7, 'manual settings entry');
      },
      update: async (id, text) => {
        const existing = memories.find((memory) => String(memory.id) === id);
        if (!existing) throw new Error('That memory no longer exists.');
        await storeMemory(
          existing.category,
          existing.topic,
          text,
          existing.importance,
          existing.source,
        );
      },
      remove: async (id) => {
        await deleteMemory(Number(id));
      },
      clear: deleteAll,
    }),
    [deleteAll, deleteMemory, facts, loadAll, memories, storeMemory],
  );

  return <MemorySettingsContent adapter={adapter} scope="local" loadError={error} />;
}

export function MemoryTab({ scope = 'local' }: { scope?: 'local' | 'cloud' }) {
  return scope === 'cloud' ? <CloudMemoryTab /> : <LocalMemoryTab />;
}
