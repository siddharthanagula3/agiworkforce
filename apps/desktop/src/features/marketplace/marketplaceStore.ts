import { create } from 'zustand';
import {
  cloneMarketplaceWorkflow as apiCloneWorkflow,
  commentOnWorkflow as apiCommentOnWorkflow,
  deleteWorkflowComment as apiDeleteComment,
  favoriteWorkflow as apiFavoriteWorkflow,
  getCategoryCounts as apiGetCategoryCounts,
  getFeaturedWorkflows as apiGetFeatured,
  getMyPublishedWorkflows as apiGetMyPublished,
  getPopularTags as apiGetPopularTags,
  getTrendingWorkflows as apiGetTrending,
  getUserWorkflowRating as apiGetUserRating,
  getWorkflowAnalytics as apiGetAnalytics,
  getWorkflowById as apiGetWorkflowById,
  getWorkflowComments as apiGetComments,
  getWorkflowEmbedCode as apiGetEmbedCode,
  getWorkflowReviews as apiGetReviews,
  getWorkflowShareUrl as apiGetShareUrl,
  getWorkflowStats as apiGetStats,
  incrementWorkflowViewCount as apiTrackView,
  isWorkflowFavorited as apiIsFavorited,
  publishWorkflow as apiPublishWorkflow,
  rateWorkflow as apiRateWorkflow,
  searchMarketplaceWorkflows as apiSearchWorkflows,
  shareWorkflow as apiShareWorkflow,
  unfavoriteWorkflow as apiUnfavoriteWorkflow,
  unpublishWorkflow as apiUnpublishWorkflow,
  getPublishedWorkflows as apiGetPublishedWorkflows,
} from '../../api/marketplace';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import type {
  CloneWorkflowRequest,
  MarketplaceFilters,
  PublishedWorkflow,
  PublishWorkflowRequest,
  RateWorkflowRequest,
  WorkflowAnalytics,
  WorkflowReview,
} from '../../types/marketplace';
import type { WorkflowComment, WorkflowStats } from '../../api/marketplace';

interface CategoryCount {
  category: string;
  count: number;
}

interface PopularTag {
  tag: string;
  count: number;
}

interface MarketplaceStore {
  workflows: PublishedWorkflow[];
  featuredWorkflows: PublishedWorkflow[];
  trendingWorkflows: PublishedWorkflow[];
  myPublishedWorkflows: PublishedWorkflow[];
  selectedWorkflow: PublishedWorkflow | null;
  workflowReviews: WorkflowReview[];
  workflowComments: WorkflowComment[];
  workflowAnalytics: WorkflowAnalytics | null;
  marketplaceStats: WorkflowStats | null;
  categoryCounts: CategoryCount[];
  popularTags: PopularTag[];

  filters: MarketplaceFilters;

  isLoading: boolean;
  error: string | null;
  showDetailModal: boolean;
  showShareModal: boolean;
  showCloneSuccessModal: boolean;
  clonedWorkflow: PublishedWorkflow | null;

  currentPage: number;
  totalPages: number;
  pageSize: number;

  fetchWorkflows: () => Promise<void>;
  fetchFeatured: () => Promise<void>;
  fetchTrending: () => Promise<void>;
  fetchMyWorkflows: (userId: string) => Promise<void>;
  fetchWorkflowById: (workflowId: string) => Promise<void>;
  fetchWorkflowReviews: (workflowId: string) => Promise<void>;
  fetchWorkflowComments: (workflowId: string) => Promise<void>;
  fetchWorkflowAnalytics: (workflowId: string) => Promise<void>;
  fetchMarketplaceStats: (workflowId: string) => Promise<void>;
  fetchCategoryCounts: () => Promise<void>;
  fetchPopularTags: () => Promise<void>;

  searchWorkflows: (query: string) => Promise<void>;
  setFilter: <K extends keyof MarketplaceFilters>(key: K, value: MarketplaceFilters[K]) => void;
  resetFilters: () => void;
  applyFilters: () => Promise<void>;

  cloneWorkflow: (request: CloneWorkflowRequest) => Promise<string>;
  publishWorkflow: (request: PublishWorkflowRequest) => Promise<PublishedWorkflow>;
  unpublishWorkflow: (workflowId: string) => Promise<void>;
  rateWorkflow: (request: RateWorkflowRequest) => Promise<void>;
  favoriteWorkflow: (workflowId: string, userId: string) => Promise<void>;
  unfavoriteWorkflow: (workflowId: string, userId: string) => Promise<void>;
  isFavorited: (workflowId: string, userId: string) => Promise<boolean>;
  getUserRating: (workflowId: string, userId: string) => Promise<number | null>;
  commentOnWorkflow: (
    workflowId: string,
    userId: string,
    userName: string,
    comment: string,
  ) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;

  getShareUrl: (workflowId: string) => Promise<string>;
  shareWorkflow: (workflowId: string, platform: string) => Promise<string>;
  getEmbedCode: (workflowId: string) => Promise<string>;
  trackWorkflowView: (workflowId: string) => Promise<void>;

  setSelectedWorkflow: (workflow: PublishedWorkflow | null) => void;
  openDetailModal: (workflow: PublishedWorkflow) => void;
  closeDetailModal: () => void;
  openShareModal: (workflow: PublishedWorkflow) => void;
  closeShareModal: () => void;
  showCloneSuccess: (workflow: PublishedWorkflow) => void;
  closeCloneSuccess: () => void;

  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
}

const defaultFilters: MarketplaceFilters = {
  searchQuery: '',
  category: 'all',
  sortBy: 'popular',
  minRating: undefined,
  tags: [],
  verifiedOnly: false,
  featuredOnly: false,
};

export const useMarketplaceStore = create<MarketplaceStore>((set, get) => ({
  workflows: [],
  featuredWorkflows: [],
  trendingWorkflows: [],
  myPublishedWorkflows: [],
  selectedWorkflow: null,
  workflowReviews: [],
  workflowComments: [],
  workflowAnalytics: null,
  marketplaceStats: null,
  categoryCounts: [],
  popularTags: [],

  filters: defaultFilters,

  isLoading: false,
  error: null,
  showDetailModal: false,
  showShareModal: false,
  showCloneSuccessModal: false,
  clonedWorkflow: null,

  currentPage: 1,
  totalPages: 1,
  pageSize: 20,

  // ── Browsing ────────────────────────────────────────────────────────────────

  fetchWorkflows: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters, currentPage, pageSize } = get();
      const workflows = await apiGetPublishedWorkflows({
        category: filters.category === 'all' ? undefined : filters.category,
        sortBy: filters.sortBy,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      });
      set({ workflows, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
      set({ error: getSimpleErrorMessage(error), isLoading: false });
    }
  },

  fetchFeatured: async () => {
    try {
      const featured = await apiGetFeatured(6);
      set({ featuredWorkflows: featured });
    } catch (error) {
      console.error('Failed to fetch featured workflows:', error);
    }
  },

  fetchTrending: async () => {
    try {
      const trending = await apiGetTrending(10);
      set({ trendingWorkflows: trending });
    } catch (error) {
      console.error('Failed to fetch trending workflows:', error);
    }
  },

  fetchMyWorkflows: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const workflows = await apiGetMyPublished(userId);
      set({ myPublishedWorkflows: workflows, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch my workflows:', error);
      set({ error: getSimpleErrorMessage(error), isLoading: false });
    }
  },

  fetchWorkflowById: async (workflowId: string) => {
    set({ isLoading: true, error: null });
    try {
      const workflow = await apiGetWorkflowById(workflowId);
      set({ selectedWorkflow: workflow, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch workflow:', error);
      set({ error: getSimpleErrorMessage(error), isLoading: false });
    }
  },

  fetchWorkflowReviews: async (workflowId: string) => {
    try {
      const reviews = await apiGetReviews(workflowId);
      set({ workflowReviews: reviews });
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    }
  },

  fetchWorkflowComments: async (workflowId: string) => {
    try {
      const comments = await apiGetComments(workflowId, 50, 0);
      set({ workflowComments: comments });
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    }
  },

  fetchWorkflowAnalytics: async (workflowId: string) => {
    try {
      const analytics = await apiGetAnalytics(workflowId);
      set({ workflowAnalytics: analytics });
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  },

  fetchMarketplaceStats: async (workflowId: string) => {
    try {
      const stats = await apiGetStats(workflowId);
      set({ marketplaceStats: stats });
    } catch (error) {
      console.error('Failed to fetch marketplace stats:', error);
    }
  },

  fetchCategoryCounts: async () => {
    try {
      const raw = await apiGetCategoryCounts();
      const categoryCounts = raw.map(([category, count]) => ({ category, count }));
      set({ categoryCounts });
    } catch (error) {
      console.error('Failed to fetch category counts:', error);
    }
  },

  fetchPopularTags: async () => {
    try {
      const raw = await apiGetPopularTags(20);
      const popularTags = raw.map(([tag, count]) => ({ tag, count }));
      set({ popularTags });
    } catch (error) {
      console.error('Failed to fetch popular tags:', error);
    }
  },

  // ── Search / Filters ────────────────────────────────────────────────────────

  searchWorkflows: async (query: string) => {
    set((state) => ({
      filters: { ...state.filters, searchQuery: query },
      currentPage: 1,
    }));
    await get().applyFilters();
  },

  setFilter: <K extends keyof MarketplaceFilters>(key: K, value: MarketplaceFilters[K]) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value },
      currentPage: 1,
    }));
  },

  resetFilters: () => {
    set({ filters: defaultFilters, currentPage: 1 });
  },

  applyFilters: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters, currentPage, pageSize } = get();
      const workflows = await apiSearchWorkflows({
        searchQuery: filters.searchQuery || undefined,
        category: filters.category === 'all' ? undefined : filters.category,
        sortBy: filters.sortBy,
        minRating: filters.minRating,
        tags: filters.tags,
        verifiedOnly: filters.verifiedOnly,
        featuredOnly: filters.featuredOnly,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      });
      set({ workflows, isLoading: false });
    } catch (error) {
      console.error('Failed to apply filters:', error);
      set({ error: getSimpleErrorMessage(error), isLoading: false });
    }
  },

  // ── Cloning / Forking ───────────────────────────────────────────────────────

  cloneWorkflow: async (request: CloneWorkflowRequest) => {
    set({ isLoading: true, error: null });
    try {
      const clonedId = await apiCloneWorkflow(request);

      const { workflows, featuredWorkflows, trendingWorkflows } = get();
      const updateCloneCount = (w: PublishedWorkflow) =>
        w.id === request.workflow_id ? { ...w, clone_count: w.clone_count + 1 } : w;

      set({
        workflows: workflows.map(updateCloneCount),
        featuredWorkflows: featuredWorkflows.map(updateCloneCount),
        trendingWorkflows: trendingWorkflows.map(updateCloneCount),
        isLoading: false,
      });

      return clonedId;
    } catch (error) {
      console.error('Failed to clone workflow:', error);
      set({ error: getSimpleErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  // ── Publishing ──────────────────────────────────────────────────────────────

  publishWorkflow: async (request: PublishWorkflowRequest) => {
    set({ isLoading: true, error: null });
    try {
      const published = await apiPublishWorkflow(request);
      set((state) => ({
        myPublishedWorkflows: [published, ...state.myPublishedWorkflows],
        isLoading: false,
      }));
      return published;
    } catch (error) {
      console.error('Failed to publish workflow:', error);
      set({ error: getSimpleErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  unpublishWorkflow: async (workflowId: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiUnpublishWorkflow(workflowId, 'default');
      set((state) => ({
        myPublishedWorkflows: state.myPublishedWorkflows.filter((w) => w.id !== workflowId),
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to unpublish workflow:', error);
      set({ error: getSimpleErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  // ── Social ──────────────────────────────────────────────────────────────────

  rateWorkflow: async (request: RateWorkflowRequest) => {
    try {
      await apiRateWorkflow(request);
      await get().fetchWorkflowReviews(request.workflow_id);

      if (get().selectedWorkflow?.id === request.workflow_id) {
        await get().fetchWorkflowById(request.workflow_id);
      }
    } catch (error) {
      console.error('Failed to rate workflow:', error);
      throw error;
    }
  },

  favoriteWorkflow: async (workflowId: string, userId: string) => {
    try {
      await apiFavoriteWorkflow(workflowId, userId);
    } catch (error) {
      console.error('Failed to favorite workflow:', error);
      throw error;
    }
  },

  unfavoriteWorkflow: async (workflowId: string, userId: string) => {
    try {
      await apiUnfavoriteWorkflow(workflowId, userId);
    } catch (error) {
      console.error('Failed to unfavorite workflow:', error);
      throw error;
    }
  },

  isFavorited: async (workflowId: string, userId: string) => {
    try {
      return await apiIsFavorited(workflowId, userId);
    } catch (error) {
      console.error('Failed to check favorite status:', error);
      return false;
    }
  },

  getUserRating: async (workflowId: string, userId: string) => {
    try {
      return await apiGetUserRating(workflowId, userId);
    } catch (error) {
      console.error('Failed to get user rating:', error);
      return null;
    }
  },

  commentOnWorkflow: async (
    workflowId: string,
    userId: string,
    userName: string,
    comment: string,
  ) => {
    try {
      await apiCommentOnWorkflow({ workflowId, userId, userName, comment });
      await get().fetchWorkflowComments(workflowId);
    } catch (error) {
      console.error('Failed to comment on workflow:', error);
      throw error;
    }
  },

  deleteComment: async (commentId: string) => {
    try {
      await apiDeleteComment(commentId, 'default');
      set((state) => ({
        workflowComments: state.workflowComments.filter((c) => c.id !== commentId),
      }));
    } catch (error) {
      console.error('Failed to delete comment:', error);
      throw error;
    }
  },

  // ── Sharing ─────────────────────────────────────────────────────────────────

  getShareUrl: async (workflowId: string) => {
    try {
      return await apiGetShareUrl(workflowId);
    } catch (error) {
      console.error('Failed to get share URL:', error);
      throw error;
    }
  },

  shareWorkflow: async (workflowId: string, platform: string) => {
    try {
      return await apiShareWorkflow(workflowId, platform);
    } catch (error) {
      console.error('Failed to generate share link:', error);
      throw error;
    }
  },

  getEmbedCode: async (workflowId: string) => {
    try {
      return await apiGetEmbedCode(workflowId);
    } catch (error) {
      console.error('Failed to get embed code:', error);
      throw error;
    }
  },

  // ── Analytics / View Tracking ───────────────────────────────────────────────

  trackWorkflowView: async (workflowId: string) => {
    try {
      await apiTrackView(workflowId);
    } catch (error) {
      console.error('Failed to track view:', error);
    }
  },

  // ── UI State ────────────────────────────────────────────────────────────────

  setSelectedWorkflow: (workflow: PublishedWorkflow | null) => {
    set({ selectedWorkflow: workflow });
  },

  openDetailModal: (workflow: PublishedWorkflow) => {
    set({ selectedWorkflow: workflow, showDetailModal: true });
    get().trackWorkflowView(workflow.id);
    get().fetchWorkflowReviews(workflow.id);
  },

  closeDetailModal: () => {
    set({ showDetailModal: false });
  },

  openShareModal: (workflow: PublishedWorkflow) => {
    set({ selectedWorkflow: workflow, showShareModal: true });
  },

  closeShareModal: () => {
    set({ showShareModal: false });
  },

  showCloneSuccess: (workflow: PublishedWorkflow) => {
    set({ clonedWorkflow: workflow, showCloneSuccessModal: true });
  },

  closeCloneSuccess: () => {
    set({ showCloneSuccessModal: false, clonedWorkflow: null });
  },

  // ── Pagination ──────────────────────────────────────────────────────────────

  setPage: (page: number) => {
    set({ currentPage: page });
    get().applyFilters();
  },

  nextPage: () => {
    const { currentPage, totalPages } = get();
    if (currentPage < totalPages) {
      get().setPage(currentPage + 1);
    }
  },

  prevPage: () => {
    const { currentPage } = get();
    if (currentPage > 1) {
      get().setPage(currentPage - 1);
    }
  },
}));
