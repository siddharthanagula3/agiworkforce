/**
 * Workflow Marketplace Store (Global)
 *
 * Wires all 36 marketplace Tauri commands via the api/marketplace.ts layer.
 * Local component store lives at components/Marketplace/marketplaceStore.ts.
 *
 * Uses types from types/marketplace.ts (snake_case fields — matches Tauri serde output).
 * All invoke() params use camelCase per Tauri IPC rules.
 */
import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { storageFallback } from '../lib/storageFallback';
import {
  cloneMarketplaceWorkflow as apiCloneWorkflow,
  commentOnWorkflow as apiCommentOnWorkflow,
  deleteWorkflowComment as apiDeleteComment,
  favoriteWorkflow as apiFavoriteWorkflow,
  forkMarketplaceWorkflow as apiForkWorkflow,
  getCategoryCounts as apiGetCategoryCounts,
  getCreatorWorkflows as apiGetCreatorWorkflows,
  getFeaturedWorkflows as apiGetFeatured,
  getMyPublishedWorkflows as apiGetMyPublished,
  getPopularTags as apiGetPopularTags,
  getPublishedWorkflows as apiGetPublishedWorkflows,
  getTrendingWorkflows as apiGetTrending,
  getUserClones as apiGetUserClones,
  getUserFavorites as apiGetUserFavorites,
  getUserWorkflowRating as apiGetUserRating,
  getWorkflowAnalytics as apiGetAnalytics,
  getWorkflowById as apiGetWorkflowById,
  getWorkflowByShareUrl as apiGetWorkflowByShareUrl,
  getWorkflowComments as apiGetComments,
  getWorkflowEmbedCode as apiGetEmbedCode,
  getWorkflowReviews as apiGetReviews,
  getWorkflowShareUrl as apiGetShareUrl,
  getWorkflowStats as apiGetStats,
  getWorkflowTemplates as apiGetTemplates,
  getWorkflowTemplatesByCategory as apiGetTemplatesByCategory,
  getWorkflowsByCategory as apiGetWorkflowsByCategory,
  incrementWorkflowViewCount as apiTrackView,
  isWorkflowFavorited as apiIsFavorited,
  publishWorkflow as apiPublishWorkflow,
  publishWorkflowToMarketplace as apiPublishToMarketplace,
  rateWorkflow as apiRateWorkflow,
  searchMarketplaceWorkflows as apiSearchWorkflows,
  searchWorkflowTemplates as apiSearchTemplates,
  shareWorkflow as apiShareWorkflow,
  unfavoriteWorkflow as apiUnfavoriteWorkflow,
  unpublishWorkflow as apiUnpublishWorkflow,
  type WorkflowClone,
  type WorkflowComment,
  type WorkflowStats,
  type WorkflowTemplate,
} from '../api/marketplace';
import type {
  CloneWorkflowRequest,
  PublishedWorkflow,
  PublishWorkflowRequest,
  RateWorkflowRequest,
  WorkflowAnalytics,
  WorkflowReview,
} from '../types/marketplace';

// Re-export types for consumers
export type { WorkflowClone, WorkflowComment, WorkflowStats, WorkflowTemplate };
export type { PublishedWorkflow, WorkflowAnalytics, WorkflowReview };

// ── Store ───────────────────────────────────────────────────────────────────

interface MarketplaceState {
  // UI state
  featured: PublishedWorkflow[];
  trending: PublishedWorkflow[];
  searchResults: PublishedWorkflow[];
  templates: WorkflowTemplate[];
  categoryCounts: [string, number][];
  popularTags: [string, number][];
  isLoading: boolean;
  error: string | null;

  // ── Publishing ────────────────────────────────────────────────────────
  publishWorkflow: (request: PublishWorkflowRequest) => Promise<PublishedWorkflow>;

  publishWorkflowToMarketplace: (params: {
    workflowId: string;
    category: string;
    tags: string[];
    estimatedTimeSaved: number;
    estimatedCostSaved: number;
    thumbnailUrl?: string;
    userId: string;
    userName: string;
  }) => Promise<PublishedWorkflow>;

  unpublishWorkflow: (workflowId: string, userId: string) => Promise<void>;

  getMyPublishedWorkflows: (userId: string) => Promise<PublishedWorkflow[]>;

  // ── Browsing ──────────────────────────────────────────────────────────
  fetchFeatured: (limit?: number) => Promise<void>;
  fetchTrending: (limit?: number) => Promise<void>;

  getPublishedWorkflows: (params: {
    category?: string;
    sortBy: string;
    limit: number;
    offset: number;
  }) => Promise<PublishedWorkflow[]>;

  searchMarketplaceWorkflows: (params: {
    searchQuery?: string;
    category?: string;
    minRating?: number;
    tags: string[];
    verifiedOnly: boolean;
    featuredOnly: boolean;
    sortBy: string;
    limit: number;
    offset: number;
  }) => Promise<PublishedWorkflow[]>;

  getWorkflowById: (workflowId: string) => Promise<PublishedWorkflow | null>;
  getWorkflowByShareUrl: (shareUrl: string) => Promise<PublishedWorkflow | null>;
  getCreatorWorkflows: (creatorId: string) => Promise<PublishedWorkflow[]>;
  getWorkflowsByCategory: (category: string, limit: number) => Promise<PublishedWorkflow[]>;
  fetchCategoryCounts: () => Promise<void>;
  fetchPopularTags: (limit?: number) => Promise<void>;

  // ── Cloning / Forking ─────────────────────────────────────────────────
  cloneMarketplaceWorkflow: (request: CloneWorkflowRequest) => Promise<string>;

  forkMarketplaceWorkflow: (params: {
    workflowId: string;
    userId: string;
    userName: string;
  }) => Promise<string>;

  getUserClones: (userId: string) => Promise<WorkflowClone[]>;

  // ── Social (ratings, comments, favorites) ─────────────────────────────
  rateWorkflow: (request: RateWorkflowRequest) => Promise<void>;
  getUserWorkflowRating: (workflowId: string, userId: string) => Promise<number | null>;
  getWorkflowReviews: (workflowId: string) => Promise<WorkflowReview[]>;

  commentOnWorkflow: (params: {
    workflowId: string;
    userId: string;
    userName: string;
    comment: string;
  }) => Promise<string>;
  getWorkflowComments: (
    workflowId: string,
    limit: number,
    offset: number,
  ) => Promise<WorkflowComment[]>;
  deleteWorkflowComment: (commentId: string, userId: string) => Promise<void>;

  favoriteWorkflow: (workflowId: string, userId: string) => Promise<void>;
  unfavoriteWorkflow: (workflowId: string, userId: string) => Promise<void>;
  isWorkflowFavorited: (workflowId: string, userId: string) => Promise<boolean>;
  getUserFavorites: (userId: string) => Promise<PublishedWorkflow[]>;

  // ── Sharing ───────────────────────────────────────────────────────────
  shareWorkflow: (workflowId: string, platform: string) => Promise<string>;
  getWorkflowShareUrl: (workflowId: string) => Promise<string>;
  getWorkflowEmbedCode: (workflowId: string) => Promise<string>;

  // ── Analytics / Stats ─────────────────────────────────────────────────
  getWorkflowStats: (workflowId: string) => Promise<WorkflowStats>;
  getWorkflowAnalytics: (workflowId: string) => Promise<WorkflowAnalytics>;
  incrementWorkflowViewCount: (workflowId: string) => Promise<void>;

  // ── Templates ─────────────────────────────────────────────────────────
  fetchTemplates: () => Promise<void>;
  getWorkflowTemplatesByCategory: (category: string) => Promise<WorkflowTemplate[]>;
  searchWorkflowTemplates: (query: string) => Promise<WorkflowTemplate[]>;
}

export const useMarketplaceStore = create<MarketplaceState>()(
  devtools(
    persist(
      immer((set) => ({
        featured: [],
        trending: [],
        searchResults: [],
        templates: [],
        categoryCounts: [],
        popularTags: [],
        isLoading: false,
        error: null,

        // ── Publishing ──────────────────────────────────────────────────────

        publishWorkflow: async (request) => {
          return apiPublishWorkflow(request);
        },

        publishWorkflowToMarketplace: async (params) => {
          return apiPublishToMarketplace({
            workflowId: params.workflowId,
            category: params.category,
            tags: params.tags,
            estimatedTimeSaved: params.estimatedTimeSaved,
            estimatedCostSaved: params.estimatedCostSaved,
            thumbnailUrl: params.thumbnailUrl,
            userId: params.userId,
            userName: params.userName,
          });
        },

        unpublishWorkflow: async (workflowId, userId) => {
          await apiUnpublishWorkflow(workflowId, userId);
        },

        getMyPublishedWorkflows: async (userId) => {
          return apiGetMyPublished(userId);
        },

        // ── Browsing ────────────────────────────────────────────────────────

        fetchFeatured: async (limit = 10) => {
          set({ isLoading: true, error: null });
          try {
            const featured = await apiGetFeatured(limit);
            set({ featured, isLoading: false });
          } catch (err) {
            set({
              error: err instanceof Error ? err.message : 'Failed to fetch featured',
              isLoading: false,
            });
          }
        },

        fetchTrending: async (limit = 10) => {
          set({ isLoading: true, error: null });
          try {
            const trending = await apiGetTrending(limit);
            set({ trending, isLoading: false });
          } catch (err) {
            set({
              error: err instanceof Error ? err.message : 'Failed to fetch trending',
              isLoading: false,
            });
          }
        },

        getPublishedWorkflows: async (params) => {
          return apiGetPublishedWorkflows({
            category: params.category,
            sortBy: params.sortBy,
            limit: params.limit,
            offset: params.offset,
          });
        },

        searchMarketplaceWorkflows: async (params) => {
          const results = await apiSearchWorkflows({
            searchQuery: params.searchQuery,
            category: params.category,
            minRating: params.minRating,
            tags: params.tags,
            verifiedOnly: params.verifiedOnly,
            featuredOnly: params.featuredOnly,
            sortBy: params.sortBy,
            limit: params.limit,
            offset: params.offset,
          });
          set({ searchResults: results });
          return results;
        },

        getWorkflowById: async (workflowId) => {
          try {
            return await apiGetWorkflowById(workflowId);
          } catch (error) {
            console.warn('[marketplace] getWorkflowById failed:', error);
            return null;
          }
        },

        getWorkflowByShareUrl: async (shareUrl) => {
          try {
            return await apiGetWorkflowByShareUrl(shareUrl);
          } catch (error) {
            console.warn('[marketplace] getWorkflowByShareUrl failed:', error);
            return null;
          }
        },

        getCreatorWorkflows: async (creatorId) => {
          return apiGetCreatorWorkflows(creatorId);
        },

        getWorkflowsByCategory: async (category, limit) => {
          return apiGetWorkflowsByCategory(category, limit);
        },

        fetchCategoryCounts: async () => {
          try {
            const categoryCounts = await apiGetCategoryCounts();
            set({ categoryCounts });
          } catch (error) {
            console.warn('[marketplace] fetchCategoryCounts failed:', error);
          }
        },

        fetchPopularTags: async (limit = 20) => {
          try {
            const popularTags = await apiGetPopularTags(limit);
            set({ popularTags });
          } catch (error) {
            console.warn('[marketplace] fetchPopularTags failed:', error);
          }
        },

        // ── Cloning / Forking ───────────────────────────────────────────────

        cloneMarketplaceWorkflow: async (request) => {
          return apiCloneWorkflow(request);
        },

        forkMarketplaceWorkflow: async (params) => {
          return apiForkWorkflow({
            workflowId: params.workflowId,
            userId: params.userId,
            userName: params.userName,
          });
        },

        getUserClones: async (userId) => {
          return apiGetUserClones(userId);
        },

        // ── Social ──────────────────────────────────────────────────────────

        rateWorkflow: async (request) => {
          await apiRateWorkflow(request);
        },

        getUserWorkflowRating: async (workflowId, userId) => {
          return apiGetUserRating(workflowId, userId);
        },

        getWorkflowReviews: async (workflowId) => {
          return apiGetReviews(workflowId);
        },

        commentOnWorkflow: async (params) => {
          return apiCommentOnWorkflow({
            workflowId: params.workflowId,
            userId: params.userId,
            userName: params.userName,
            comment: params.comment,
          });
        },

        getWorkflowComments: async (workflowId, limit, offset) => {
          return apiGetComments(workflowId, limit, offset);
        },

        deleteWorkflowComment: async (commentId, userId) => {
          await apiDeleteComment(commentId, userId);
        },

        favoriteWorkflow: async (workflowId, userId) => {
          await apiFavoriteWorkflow(workflowId, userId);
        },

        unfavoriteWorkflow: async (workflowId, userId) => {
          await apiUnfavoriteWorkflow(workflowId, userId);
        },

        isWorkflowFavorited: async (workflowId, userId) => {
          try {
            return await apiIsFavorited(workflowId, userId);
          } catch (error) {
            console.warn('[marketplace] isWorkflowFavorited failed:', error);
            return false;
          }
        },

        getUserFavorites: async (userId) => {
          return apiGetUserFavorites(userId);
        },

        // ── Sharing ─────────────────────────────────────────────────────────

        shareWorkflow: async (workflowId, platform) => {
          return apiShareWorkflow(workflowId, platform);
        },

        getWorkflowShareUrl: async (workflowId) => {
          return apiGetShareUrl(workflowId);
        },

        getWorkflowEmbedCode: async (workflowId) => {
          return apiGetEmbedCode(workflowId);
        },

        // ── Analytics / Stats ───────────────────────────────────────────────

        getWorkflowStats: async (workflowId) => {
          return apiGetStats(workflowId);
        },

        getWorkflowAnalytics: async (workflowId) => {
          return apiGetAnalytics(workflowId);
        },

        incrementWorkflowViewCount: async (workflowId) => {
          await apiTrackView(workflowId);
        },

        // ── Templates ───────────────────────────────────────────────────────

        fetchTemplates: async () => {
          set({ isLoading: true, error: null });
          try {
            const templates = await apiGetTemplates();
            set({ templates, isLoading: false });
          } catch (err) {
            set({
              error: err instanceof Error ? err.message : 'Failed to fetch templates',
              isLoading: false,
            });
          }
        },

        getWorkflowTemplatesByCategory: async (category) => {
          return apiGetTemplatesByCategory(category);
        },

        searchWorkflowTemplates: async (query) => {
          return apiSearchTemplates(query);
        },
      })),
      {
        name: 'agiworkforce-marketplace',
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          featured: state.featured,
          trending: state.trending,
          templates: state.templates,
          categoryCounts: state.categoryCounts,
          popularTags: state.popularTags,
        }),
      },
    ),
    { name: 'MarketplaceStore', enabled: import.meta.env.DEV },
  ),
);
