import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { AgentTemplate, TemplateCategory } from '../types/templates';
import { TemplateService } from '../services/templateService';

interface TemplateStore {
  templates: AgentTemplate[];
  installedTemplates: AgentTemplate[];
  selectedTemplate: AgentTemplate | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedCategory: TemplateCategory | null;

  fetchTemplates: () => Promise<void>;
  fetchInstalledTemplates: () => Promise<void>;
  installTemplate: (templateId: string) => Promise<void>;
  uninstallTemplate: (templateId: string) => Promise<void>;
  searchTemplates: (query: string) => Promise<void>;
  filterByCategory: (category: TemplateCategory | null) => void;
  selectTemplate: (template: AgentTemplate | null) => void;
  executeTemplate: (templateId: string, params: Record<string, string>) => Promise<string>;
  clearError: () => void;
}

export const useTemplateStore = create<TemplateStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      templates: [],
      installedTemplates: [],
      selectedTemplate: null,
      isLoading: false,
      error: null,
      searchQuery: '',
      selectedCategory: null,

      fetchTemplates: async () => {
        set({ isLoading: true, error: null });
        try {
          const templates = await TemplateService.getAllTemplates();
          set({ templates, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch templates',
            isLoading: false,
          });
        }
      },

      fetchInstalledTemplates: async () => {
        set({ isLoading: true, error: null });
        try {
          const installedTemplates = await TemplateService.getInstalledTemplates();
          set({ installedTemplates, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch installed templates',
            isLoading: false,
          });
        }
      },

      installTemplate: async (templateId: string) => {
        set({ isLoading: true, error: null });
        try {
          await TemplateService.installTemplate(templateId);

          await get().fetchInstalledTemplates();

          const templates = get().templates.map((t) =>
            t.id === templateId ? { ...t, install_count: t.install_count + 1 } : t,
          );
          set({ templates, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to install template',
            isLoading: false,
          });
        }
      },

      uninstallTemplate: async (templateId: string) => {
        set({ isLoading: true, error: null });
        try {
          await TemplateService.uninstallTemplate(templateId);

          await get().fetchInstalledTemplates();
          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to uninstall template',
            isLoading: false,
          });
        }
      },

      searchTemplates: async (query: string) => {
        set({ searchQuery: query, isLoading: true, error: null });
        try {
          if (query.trim() === '') {
            await get().fetchTemplates();
          } else {
            const templates = await TemplateService.searchTemplates(query);
            set({ templates, isLoading: false });
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to search templates',
            isLoading: false,
          });
        }
      },

      filterByCategory: (category: TemplateCategory | null) => {
        set({ selectedCategory: category, isLoading: true, error: null });
        if (category === null) {
          get().fetchTemplates();
        } else {
          TemplateService.getTemplatesByCategory(category)
            .then((templates) => set({ templates, isLoading: false }))
            .catch((error) =>
              set({
                error: error instanceof Error ? error.message : 'Failed to filter templates',
                isLoading: false,
              }),
            );
        }
      },

      selectTemplate: (template: AgentTemplate | null) => {
        set({ selectedTemplate: template });
      },

      executeTemplate: async (
        templateId: string,
        params: Record<string, string>,
      ): Promise<string> => {
        set({ isLoading: true, error: null });
        try {
          const result = await TemplateService.executeTemplate(templateId, params);
          set({ isLoading: false });
          return result;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to execute template';
          set({ error: errorMessage, isLoading: false });
          throw new Error(errorMessage);
        }
      },

      clearError: () => {
        set({ error: null });
      },
    })),
    { name: 'TemplateStore', enabled: import.meta.env.DEV },
  ),
);
