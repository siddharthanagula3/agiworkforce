import { create } from 'zustand';
import { invoke } from '../../lib/tauri-mock';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import type {
  CloneWorkflowRequest,
  MarketplaceFilters,
  PublishedWorkflow,
  PublishWorkflowRequest,
  RateWorkflowRequest,
  WorkflowAnalytics,
  WorkflowReview,
  WorkflowStats,
} from '../../types/marketplace';

interface CategoryCount {
  category: string;
  count: number;
}

interface PopularTag {
  tag: string;
  count: number;
}

interface WorkflowComment {
  id: string;
  workflow_id: string;
  user_id: string;
  user_name: string;
  comment: string;
  created_at: number;
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
  fetchMarketplaceStats: () => Promise<void>;
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

  fetchWorkflows: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters, currentPage, pageSize } = get();
      const workflows = await invoke<PublishedWorkflow[]>('get_published_workflows', {
        category: filters.category === 'all' ? null : filters.category,
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
      const featured = await invoke<PublishedWorkflow[]>('get_featured_workflows', { limit: 6 });
      set({ featuredWorkflows: featured });
    } catch (error) {
      console.error('Failed to fetch featured workflows:', error);
    }
  },

  fetchTrending: async () => {
    try {
      const trending = await invoke<PublishedWorkflow[]>('get_trending_workflows', { limit: 10 });
      set({ trendingWorkflows: trending });
    } catch (error) {
      console.error('Failed to fetch trending workflows:', error);
    }
  },

  fetchMyWorkflows: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const workflows = await invoke<PublishedWorkflow[]>('get_my_published_workflows', {
        userId,
      });
      set({ myPublishedWorkflows: workflows, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch my workflows:', error);
      set({ error: getSimpleErrorMessage(error), isLoading: false });
    }
  },

  fetchWorkflowById: async (workflowId: string) => {
    set({ isLoading: true, error: null });
    try {
      const workflow = await invoke<PublishedWorkflow>('get_workflow_by_id', {
        workflowId,
      });
      set({ selectedWorkflow: workflow, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch workflow:', error);
      set({ error: getSimpleErrorMessage(error), isLoading: false });
    }
  },

  fetchWorkflowReviews: async (workflowId: string) => {
    try {
      const reviews = await invoke<WorkflowReview[]>('get_workflow_reviews', {
        workflowId,
      });
      set({ workflowReviews: reviews });
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    }
  },

  fetchWorkflowComments: async (workflowId: string) => {
    try {
      const comments = await invoke<WorkflowComment[]>('get_workflow_comments', {
        workflowId,
      });
      set({ workflowComments: comments });
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    }
  },

  fetchWorkflowAnalytics: async (workflowId: string) => {
    try {
      const analytics = await invoke<WorkflowAnalytics>('get_workflow_analytics', {
        workflowId,
      });
      set({ workflowAnalytics: analytics });
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  },

  fetchMarketplaceStats: async () => {
    try {
      const stats = await invoke<WorkflowStats>('get_workflow_stats');
      set({ marketplaceStats: stats });
    } catch (error) {
      console.error('Failed to fetch marketplace stats:', error);
    }
  },

  fetchCategoryCounts: async () => {
    try {
      const counts = await invoke<CategoryCount[]>('get_category_counts');
      set({ categoryCounts: counts });
    } catch (error) {
      console.error('Failed to fetch category counts:', error);
    }
  },

  fetchPopularTags: async () => {
    try {
      const tags = await invoke<PopularTag[]>('get_popular_tags', { limit: 20 });
      set({ popularTags: tags });
    } catch (error) {
      console.error('Failed to fetch popular tags:', error);
    }
  },

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
      const workflows = await invoke<PublishedWorkflow[]>('search_marketplace_workflows', {
        searchQuery: filters.searchQuery || null,
        category: filters.category === 'all' ? null : filters.category,
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

  cloneWorkflow: async (request: CloneWorkflowRequest) => {
    set({ isLoading: true, error: null });
    try {
      // MKT-007 fix: Use explicit parameter object to avoid type bypass
      const clonedId = await invoke<string>('clone_marketplace_workflow', {
        workflowId: request.workflow_id,
        userId: request.user_id,
        userName: request.user_name,
        customizeTitle: request.customize_title,
      });

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

  publishWorkflow: async (request: PublishWorkflowRequest) => {
    set({ isLoading: true, error: null });
    try {
      // MKT-007 fix: Use explicit parameter object to avoid type bypass
      const published = await invoke<PublishedWorkflow>('publish_workflow', {
        workflowId: request.workflow_id,
        title: request.title,
        description: request.description,
        category: request.category,
        tags: request.tags,
        thumbnailUrl: request.thumbnail_url,
        estimatedTimeSaved: request.estimated_time_saved,
        estimatedCostSaved: request.estimated_cost_saved,
        license: request.license,
      });
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
      await invoke('unpublish_workflow', { workflowId, userId: 'default' });
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

  rateWorkflow: async (request: RateWorkflowRequest) => {
    try {
      // MKT-007 fix: Use explicit parameter object to avoid type bypass
      await invoke('rate_workflow', {
        workflowId: request.workflow_id,
        userId: request.user_id,
        rating: request.rating,
        comment: request.review_text,
      });

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
      await invoke('favorite_workflow', { workflowId, userId });
    } catch (error) {
      console.error('Failed to favorite workflow:', error);
      throw error;
    }
  },

  unfavoriteWorkflow: async (workflowId: string, userId: string) => {
    try {
      await invoke('unfavorite_workflow', { workflowId, userId });
    } catch (error) {
      console.error('Failed to unfavorite workflow:', error);
      throw error;
    }
  },

  isFavorited: async (workflowId: string, userId: string) => {
    try {
      const favorited = await invoke<boolean>('is_workflow_favorited', {
        workflowId,
        userId,
      });
      return favorited;
    } catch (error) {
      console.error('Failed to check favorite status:', error);
      return false;
    }
  },

  getUserRating: async (workflowId: string, userId: string) => {
    try {
      const rating = await invoke<number | null>('get_user_workflow_rating', {
        workflowId,
        userId,
      });
      return rating;
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
      await invoke('comment_on_workflow', {
        workflowId,
        userId,
        userName,
        comment,
      });

      await get().fetchWorkflowComments(workflowId);
    } catch (error) {
      console.error('Failed to comment on workflow:', error);
      throw error;
    }
  },

  deleteComment: async (commentId: string) => {
    try {
      await invoke('delete_workflow_comment', { commentId, userId: 'default' });

      set((state) => ({
        workflowComments: state.workflowComments.filter((c) => c.id !== commentId),
      }));
    } catch (error) {
      console.error('Failed to delete comment:', error);
      throw error;
    }
  },

  getShareUrl: async (workflowId: string) => {
    try {
      const url = await invoke<string>('get_workflow_share_url', { workflowId });
      return url;
    } catch (error) {
      console.error('Failed to get share URL:', error);
      throw error;
    }
  },

  shareWorkflow: async (workflowId: string, platform: string) => {
    try {
      const url = await invoke<string>('share_workflow', { workflowId, platform });
      return url;
    } catch (error) {
      console.error('Failed to generate share link:', error);
      throw error;
    }
  },

  getEmbedCode: async (workflowId: string) => {
    try {
      const embedCode = await invoke<string>('get_workflow_embed_code', {
        workflowId,
      });
      return embedCode;
    } catch (error) {
      console.error('Failed to get embed code:', error);
      throw error;
    }
  },

  trackWorkflowView: async (workflowId: string) => {
    try {
      await invoke('increment_workflow_view_count', { workflowId });
    } catch (error) {
      console.error('Failed to track view:', error);
    }
  },

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
