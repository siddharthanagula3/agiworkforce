/**
 * Skills store — reserved local persistence for future cloud skills.
 *
 * Tracks installed skills + the active skill ID. Mobile does not inject these
 * records into chat while the public skills surface is Cloud-gated.
 * Catalog fetch state is ephemeral and not persisted.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { InstalledSkill, SkillCatalogEntry } from '@/src/features/skills/service';

interface SkillsState {
  /** MMKV-persisted: installed skill bundles keyed by skill ID */
  installedSkills: Record<string, InstalledSkill>;
  /** MMKV-persisted: active skill ID, reserved until skills execution ships */
  activeSkillId: string | null;

  /** Ephemeral: remote catalog (not persisted) */
  catalog: SkillCatalogEntry[];
  catalogFetchedAt: number | null;
  catalogLoading: boolean;
  catalogError: string | null;

  installSkill: (entry: SkillCatalogEntry) => void;
  uninstallSkill: (id: string) => void;
  setActiveSkill: (id: string | null) => void;
  setCatalog: (entries: SkillCatalogEntry[]) => void;
  setCatalogLoading: (loading: boolean) => void;
  setCatalogError: (err: string | null) => void;

  isInstalled: (id: string) => boolean;
  getInstalledList: () => InstalledSkill[];
}

export const useSkillsStore = create<SkillsState>()(
  persist(
    (set, get) => ({
      installedSkills: {},
      activeSkillId: null,
      catalog: [],
      catalogFetchedAt: null,
      catalogLoading: false,
      catalogError: null,

      installSkill: (entry) => {
        const skill: InstalledSkill = { ...entry, installedAt: new Date().toISOString() };
        set((s) => ({
          installedSkills: { ...s.installedSkills, [entry.id]: skill },
        }));
      },

      uninstallSkill: (id) => {
        set((s) => {
          const updated = { ...s.installedSkills };
          delete updated[id];
          return {
            installedSkills: updated,
            activeSkillId: s.activeSkillId === id ? null : s.activeSkillId,
          };
        });
      },

      setActiveSkill: (id) => {
        if (id !== null && !get().installedSkills[id]) return;
        set({ activeSkillId: id });
      },

      setCatalog: (entries) => {
        set({ catalog: entries, catalogFetchedAt: Date.now(), catalogError: null });
      },

      setCatalogLoading: (loading) => set({ catalogLoading: loading }),
      setCatalogError: (err) => set({ catalogError: err, catalogLoading: false }),

      isInstalled: (id) => Boolean(get().installedSkills[id]),

      getInstalledList: () => Object.values(get().installedSkills),
    }),
    {
      name: 'skills-store-v1',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      // Only persist the durable fields; catalog is ephemeral
      partialize: (s) => ({
        installedSkills: s.installedSkills,
        activeSkillId: s.activeSkillId,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[skillsStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useSkillsStore, 'skills-store');
