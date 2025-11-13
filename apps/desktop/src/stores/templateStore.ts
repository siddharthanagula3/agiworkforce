import { create } from 'zustand';
import type { AgentTemplate, TemplateCategory } from '../types/templates';
import { TemplateService } from '../services/templateService';

interface TemplateStore {
  // State
  templates: AgentTemplate[];
  installedTemplates: AgentTemplate[];
  selectedTemplate: AgentTemplate | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedCategory: TemplateCategory | null;

  // Actions
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

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  // Initial state
  templates: [],
  installedTemplates: [],
  selectedTemplate: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  selectedCategory: null,

  // Fetch all templates
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

  // Fetch installed templates
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

  // Install a template
  installTemplate: async (templateId: string) => {
    set({ isLoading: true, error: null });
    try {
      await TemplateService.installTemplate(templateId);
      // Refresh installed templates
      await get().fetchInstalledTemplates();
      // Update install count in templates list
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

  // Uninstall a template
  uninstallTemplate: async (templateId: string) => {
    set({ isLoading: true, error: null });
    try {
      await TemplateService.uninstallTemplate(templateId);
      // Refresh installed templates
      await get().fetchInstalledTemplates();
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to uninstall template',
        isLoading: false,
      });
    }
  },

  // Search templates
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

  // Filter by category
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

  // Select a template
  selectTemplate: (template: AgentTemplate | null) => {
    set({ selectedTemplate: template });
  },

  // Execute a template
  executeTemplate: async (templateId: string, params: Record<string, string>): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      const result = await TemplateService.executeTemplate(templateId, params);
      set({ isLoading: false });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute template';
      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));
