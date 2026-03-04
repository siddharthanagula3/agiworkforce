/**
 * MCPB Bundle Store
 *
 * Manages MCP Bundle registry, installation, and updates.
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(subscribeWithSelector(...))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 *
 * Note: This store manages ephemeral bundle state and communicates with
 * the Rust backend via Tauri commands for actual installation operations.
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { McpBundle, McpBundleCategory, BundleInstallProgress } from '../types/mcp';

// API layer for Tauri commands
const mcpbApi = {
  fetchRegistry: () => invoke<McpBundle[]>('mcpb_fetch_registry'),
  searchBundles: (query: string) => invoke<McpBundle[]>('mcpb_search_bundles', { query }),
  installBundle: (bundleId: string) => invoke<void>('mcpb_install_bundle', { bundleId }),
  uninstallBundle: (bundleId: string) => invoke<void>('mcpb_uninstall_bundle', { bundleId }),
  getBundleDetails: (bundleId: string) =>
    invoke<McpBundle>('mcpb_get_bundle_details', { bundleId }),
  checkUpdates: () => invoke<McpBundle[]>('mcpb_check_updates'),
  updateBundle: (bundleId: string) => invoke<void>('mcpb_update_bundle', { bundleId }),
  getInstalledBundles: () => invoke<McpBundle[]>('mcpb_get_installed_bundles'),
  getCategories: () => invoke<McpBundleCategory[]>('mcpb_get_categories'),
  getFeaturedBundles: () => invoke<McpBundle[]>('mcpb_get_featured'),
};

interface McpbState {
  bundles: McpBundle[];
  installedBundles: McpBundle[];
  featuredBundles: McpBundle[];
  categories: McpBundleCategory[];
  selectedCategory: McpBundleCategory | null;
  searchQuery: string;
  isLoading: boolean;
  isInstalling: boolean;
  installProgress: BundleInstallProgress | null;
  error: string | null;

  // Actions
  fetchRegistry: () => Promise<void>;
  searchBundles: (query: string) => Promise<void>;
  filterByCategory: (category: McpBundleCategory | null) => void;
  installBundle: (bundleId: string) => Promise<void>;
  uninstallBundle: (bundleId: string) => Promise<void>;
  getBundleDetails: (bundleId: string) => Promise<McpBundle | null>;
  checkUpdates: () => Promise<void>;
  updateBundle: (bundleId: string) => Promise<void>;
  clearError: () => void;
  setInstallProgress: (progress: BundleInstallProgress | null) => void;
  resetOnLogout: () => void;
}

export const useMcpbStore = create<McpbState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      bundles: [],
      installedBundles: [],
      featuredBundles: [],
      categories: [],
      selectedCategory: null,
      searchQuery: '',
      isLoading: false,
      isInstalling: false,
      installProgress: null,
      error: null,

      fetchRegistry: async () => {
        set({ isLoading: true, error: null });
        try {
          const [bundles, categories, featuredBundles, installedBundles] = await Promise.all([
            mcpbApi.fetchRegistry(),
            mcpbApi.getCategories(),
            mcpbApi.getFeaturedBundles(),
            mcpbApi.getInstalledBundles(),
          ]);
          set({
            bundles,
            categories,
            featuredBundles,
            installedBundles,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch bundle registry',
            isLoading: false,
          });
        }
      },

      searchBundles: async (query: string) => {
        set({ searchQuery: query, isLoading: true, error: null });
        if (!query.trim()) {
          await get().fetchRegistry();
          return;
        }

        try {
          const bundles = await mcpbApi.searchBundles(query);
          set({ bundles, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to search bundles',
            isLoading: false,
          });
        }
      },

      filterByCategory: (category: McpBundleCategory | null) => {
        set({ selectedCategory: category });
      },

      installBundle: async (bundleId: string) => {
        set({ isInstalling: true, error: null });
        try {
          await mcpbApi.installBundle(bundleId);
          // Refresh installed bundles after installation
          const installedBundles = await mcpbApi.getInstalledBundles();
          set({ installedBundles, isInstalling: false, installProgress: null });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : `Failed to install bundle ${bundleId}`,
            isInstalling: false,
            installProgress: null,
          });
        }
      },

      uninstallBundle: async (bundleId: string) => {
        set({ isInstalling: true, error: null });
        try {
          await mcpbApi.uninstallBundle(bundleId);
          // Refresh installed bundles after uninstallation
          const installedBundles = await mcpbApi.getInstalledBundles();
          set({ installedBundles, isInstalling: false });
        } catch (error) {
          set({
            error:
              error instanceof Error ? error.message : `Failed to uninstall bundle ${bundleId}`,
            isInstalling: false,
          });
        }
      },

      getBundleDetails: async (bundleId: string) => {
        set({ isLoading: true, error: null });
        try {
          const bundle = await mcpbApi.getBundleDetails(bundleId);
          set({ isLoading: false });
          return bundle;
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : `Failed to get details for ${bundleId}`,
            isLoading: false,
          });
          return null;
        }
      },

      checkUpdates: async () => {
        set({ isLoading: true, error: null });
        try {
          const bundlesWithUpdates = await mcpbApi.checkUpdates();
          // Update the installed bundles with update availability info
          const { installedBundles } = get();
          const updatedInstalledBundles = installedBundles.map((bundle) => {
            const hasUpdate = bundlesWithUpdates.some((b) => b.id === bundle.id);
            return { ...bundle, updateAvailable: hasUpdate };
          });
          set({ installedBundles: updatedInstalledBundles, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to check for updates',
            isLoading: false,
          });
        }
      },

      updateBundle: async (bundleId: string) => {
        set({ isInstalling: true, error: null });
        try {
          await mcpbApi.updateBundle(bundleId);
          // Refresh installed bundles after update
          const installedBundles = await mcpbApi.getInstalledBundles();
          set({ installedBundles, isInstalling: false, installProgress: null });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : `Failed to update bundle ${bundleId}`,
            isInstalling: false,
            installProgress: null,
          });
        }
      },

      clearError: () => {
        set({ error: null });
      },

      setInstallProgress: (progress: BundleInstallProgress | null) => {
        set({ installProgress: progress });
      },

      resetOnLogout: () => {
        set({
          bundles: [],
          installedBundles: [],
          featuredBundles: [],
          categories: [],
          selectedCategory: null,
          searchQuery: '',
          isLoading: false,
          isInstalling: false,
          installProgress: null,
          error: null,
        });
      },
    })),
    { name: 'McpbStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors for optimized subscriptions
export const selectBundles = (state: McpbState) => state.bundles;
export const selectInstalledBundles = (state: McpbState) => state.installedBundles;
export const selectFeaturedBundles = (state: McpbState) => state.featuredBundles;
export const selectCategories = (state: McpbState) => state.categories;
export const selectSelectedCategory = (state: McpbState) => state.selectedCategory;
export const selectSearchQuery = (state: McpbState) => state.searchQuery;
export const selectIsLoading = (state: McpbState) => state.isLoading;
export const selectIsInstalling = (state: McpbState) => state.isInstalling;
export const selectInstallProgress = (state: McpbState) => state.installProgress;
export const selectError = (state: McpbState) => state.error;

// Derived selectors
export const selectFilteredBundles = (state: McpbState) => {
  const { bundles, selectedCategory, searchQuery } = state;
  let filtered = bundles;

  if (selectedCategory) {
    filtered = filtered.filter((bundle) => bundle.category === selectedCategory);
  }

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (bundle) =>
        bundle.name.toLowerCase().includes(query) ||
        bundle.description.toLowerCase().includes(query) ||
        bundle.tags.some((tag) => tag.toLowerCase().includes(query)),
    );
  }

  return filtered;
};

export const selectBundleById = (bundleId: string) => (state: McpbState) =>
  state.bundles.find((b) => b.id === bundleId) ||
  state.installedBundles.find((b) => b.id === bundleId);

export const selectBundlesWithUpdates = (state: McpbState) =>
  state.installedBundles.filter((bundle) => bundle.updateAvailable);
