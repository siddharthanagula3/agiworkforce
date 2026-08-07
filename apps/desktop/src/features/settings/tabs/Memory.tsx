import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Download, Trash2 } from 'lucide-react';
import {
  MemoryEditor,
  type MemoryEditorDataAdapter,
  type MemoryFact,
} from '@agiworkforce/unified-chat';

import { Button } from '../../../components/ui/Button';
import { Switch } from '../../../components/ui/Switch';
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
}

function MemorySettingsContent({ adapter, scope }: MemorySettingsContentProps) {
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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportMemories = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const entries = await useDesktopMemoryStore.getState().exportAll();
      const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `agi-memories-${new Date().toISOString().slice(0, 10)}.json`;
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

  const resetMemories = useCallback(async () => {
    if (adapter.facts.length === 0) return;
    const confirmed =
      typeof globalThis.confirm !== 'function' ||
      globalThis.confirm(
        `Reset all ${adapter.facts.length} ${scope === 'cloud' ? 'account' : 'local'} memories? This cannot be undone.`,
      );
    if (!confirmed) return;
    setResetting(true);
    setPolicyError(null);
    try {
      await adapter.clear();
    } catch (error) {
      setPolicyError(error instanceof Error ? error.message : 'Memories could not be reset.');
    } finally {
      setResetting(false);
    }
  }, [adapter, scope]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <section className="space-y-5 border-b border-border p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2.5">
            <Brain className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Memory</h2>
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
              onClick={() => void resetMemories()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {resetting ? 'Resetting…' : 'Reset memories'}
            </Button>
          </div>
          {/*
            Export / import. The store has had `exportAll` and
            `importJsonString` all along, but the only UI that surfaced them was
            `MemoryManager` behind `showImportExport`, and its sole caller
            (`MemoryBrowserModal`) was never mounted — so a user could not get
            their memories out of the device at all. Local scope only: cloud
            memories are exported through the account data-export path.
          */}
          {scope === 'local' && (
            <div className="flex items-center justify-between gap-5 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Export memories</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Download every device memory as JSON.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={adapter.facts.length === 0 || exporting}
                onClick={() => void exportMemories()}
              >
                <Download className="mr-2 h-4 w-4" />
                {exporting ? 'Exporting…' : 'Export JSON'}
              </Button>
            </div>
          )}
        </div>

        {exportError ? (
          <p role="alert" className="text-xs text-destructive">
            {exportError}
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
    </div>
  );
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
      add: async (text) => {
        const created = await createCloudMemory(text);
        setFacts((current) => [created, ...current]);
      },
      update: async (id, text) => {
        const updated = await updateCloudMemory(id, text);
        setFacts((current) => current.map((fact) => (fact.id === id ? updated : fact)));
      },
      remove: async (id) => {
        await deleteCloudMemory(id);
        setFacts((current) => current.filter((fact) => fact.id !== id));
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
  const isLoading = useDesktopMemoryStore((state) => state.isLoading);
  const error = useDesktopMemoryStore((state) => state.error);
  const loadAll = useDesktopMemoryStore((state) => state.loadAll);
  const storeMemory = useDesktopMemoryStore((state) => state.storeMemory);
  const deleteMemory = useDesktopMemoryStore((state) => state.deleteMemory);

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
      syncStatus: error ? 'error' : isLoading ? 'syncing' : 'synced',
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
      clear: async () => {
        // The native delete action refreshes the store after each deletion.
        // Keep bulk reset sequential so those refreshes cannot race and
        // resurrect an intermediate snapshot in the UI.
        for (const memory of memories) {
          await deleteMemory(memory.id);
        }
        await loadAll();
      },
    }),
    [deleteMemory, error, facts, isLoading, loadAll, memories, storeMemory],
  );

  return <MemorySettingsContent adapter={adapter} scope="local" />;
}

export function MemoryTab({ scope = 'local' }: { scope?: 'local' | 'cloud' }) {
  return scope === 'cloud' ? <CloudMemoryTab /> : <LocalMemoryTab />;
}
