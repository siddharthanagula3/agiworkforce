import { useCallback, useMemo, useState } from 'react';
import {
  MemoryEditor,
  type MemoryEditorDataAdapter,
  type MemoryFact,
} from '@agiworkforce/unified-chat';
import {
  createCloudMemory,
  deleteCloudMemory,
  listCloudMemories,
  updateCloudMemory,
} from '../../../api/cloudMemory';

/**
 * Memory settings tab — wraps the shared `MemoryEditor` primitive from
 * `@agiworkforce/unified-chat` so the desktop Settings dialog exposes the
 * same memory surface as web and mobile.
 *
 * Local Mode uses unified-chat's device-local store. Managed Cloud supplies
 * an authenticated account adapter and never copies its facts into the local
 * store, preserving the mode boundary.
 */
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
        try {
          await Promise.all(facts.map((fact) => deleteCloudMemory(fact.id)));
        } finally {
          // Reconcile with the server even when only part of a bulk delete
          // succeeded, so the UI never claims stale facts still exist.
          await hydrateFromServer();
        }
      },
    }),
    [facts, hydrateFromServer, syncStatus],
  );

  return <MemoryEditor adapter={adapter} className="h-full" />;
}

export function MemoryTab({ scope = 'local' }: { scope?: 'local' | 'cloud' }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {scope === 'cloud' ? <CloudMemoryTab /> : <MemoryEditor className="h-full" />}
    </div>
  );
}
