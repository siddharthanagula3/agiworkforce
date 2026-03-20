/**
 * Marketplace API — TypeScript wrappers for all 36 marketplace Tauri commands
 *
 * Rust source: `src-tauri/src/sys/commands/marketplace.rs`
 *
 * Rules:
 * - invoke() params: camelCase (Tauri auto-converts to snake_case on Rust side)
 * - Command names: snake_case in both TS and Rust
 * - Every call wrapped in try/catch
 * - Named exports only
 */
import { invoke } from '../lib/tauri-mock';
import type {
  CloneWorkflowRequest,
  PublishedWorkflow,
  PublishWorkflowRequest,
  RateWorkflowRequest,
  WorkflowAnalytics,
  WorkflowReview,
} from '../types/marketplace';

// ── Types (mirror Rust serde output) ──────────────────────────────────────────

export interface WorkflowComment {
  id: string;
  workflowId: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  comment: string;
  createdAt: number;
}

export interface WorkflowStats {
  viewCount: number;
  cloneCount: number;
  favoriteCount: number;
  ratingCount: number;
  avgRating: number;
  commentCount: number;
  totalTimeSaved: number;
  totalCostSaved: number;
}

export interface WorkflowTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  estimatedTimeSaved: number;
  estimatedCostSaved: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  setupInstructions: string;
  sampleResults: string;
  successStories: string[];
  workflowJson: string;
}

export interface WorkflowClone {
  cloneId: string;
  workflowId: string;
  workflowTitle: string;
  workflowDescription: string;
  category: string;
  creatorName: string;
  clonedAt: number;
  originalCloneCount: number;
  originalAvgRating: number;
}

export interface MarketplaceSearchParams {
  searchQuery?: string;
  category?: string;
  minRating?: number;
  tags: string[];
  verifiedOnly: boolean;
  featuredOnly: boolean;
  sortBy: string;
  limit: number;
  offset: number;
}

// ── Publishing ────────────────────────────────────────────────────────────────

export async function publishWorkflow(
  request: PublishWorkflowRequest,
): Promise<PublishedWorkflow> {
  try {
    return await invoke<PublishedWorkflow>('publish_workflow', {
      workflowId: request.workflow_id,
      title: request.title,
      description: request.description,
      category: request.category,
      tags: request.tags,
      thumbnailUrl: request.thumbnail_url ?? null,
      estimatedTimeSaved: request.estimated_time_saved,
      estimatedCostSaved: request.estimated_cost_saved,
      license: request.license,
    });
  } catch (error) {
    console.error('marketplace.publishWorkflow failed:', error);
    throw error;
  }
}

export async function publishWorkflowToMarketplace(params: {
  workflowId: string;
  category: string;
  tags: string[];
  estimatedTimeSaved: number;
  estimatedCostSaved: number;
  thumbnailUrl?: string;
  userId: string;
  userName: string;
}): Promise<PublishedWorkflow> {
  try {
    return await invoke<PublishedWorkflow>('publish_workflow_to_marketplace', {
      workflowId: params.workflowId,
      category: params.category,
      tags: params.tags,
      estimatedTimeSaved: params.estimatedTimeSaved,
      estimatedCostSaved: params.estimatedCostSaved,
      thumbnailUrl: params.thumbnailUrl ?? null,
      userId: params.userId,
      userName: params.userName,
    });
  } catch (error) {
    console.error('marketplace.publishWorkflowToMarketplace failed:', error);
    throw error;
  }
}

export async function unpublishWorkflow(
  workflowId: string,
  userId: string,
): Promise<void> {
  try {
    await invoke('unpublish_workflow', { workflowId, userId });
  } catch (error) {
    console.error('marketplace.unpublishWorkflow failed:', error);
    throw error;
  }
}

export async function getMyPublishedWorkflows(
  userId: string,
): Promise<PublishedWorkflow[]> {
  try {
    return await invoke<PublishedWorkflow[]>('get_my_published_workflows', {
      userId,
    });
  } catch (error) {
    console.error('marketplace.getMyPublishedWorkflows failed:', error);
    throw error;
  }
}

// ── Browsing ──────────────────────────────────────────────────────────────────

export async function getFeaturedWorkflows(
  limit: number = 10,
): Promise<PublishedWorkflow[]> {
  try {
    return await invoke<PublishedWorkflow[]>('get_featured_workflows', {
      limit,
    });
  } catch (error) {
    console.error('marketplace.getFeaturedWorkflows failed:', error);
    throw error;
  }
}

export async function getTrendingWorkflows(
  limit: number = 10,
): Promise<PublishedWorkflow[]> {
  try {
    return await invoke<PublishedWorkflow[]>('get_trending_workflows', {
      limit,
    });
  } catch (error) {
    console.error('marketplace.getTrendingWorkflows failed:', error);
    throw error;
  }
}

export async function getPublishedWorkflows(params: {
  category?: string;
  sortBy: string;
  limit: number;
  offset: number;
}): Promise<PublishedWorkflow[]> {
  try {
    return await invoke<PublishedWorkflow[]>('get_published_workflows', {
      category: params.category ?? null,
      sortBy: params.sortBy,
      limit: params.limit,
      offset: params.offset,
    });
  } catch (error) {
    console.error('marketplace.getPublishedWorkflows failed:', error);
    throw error;
  }
}

export async function searchMarketplaceWorkflows(
  params: MarketplaceSearchParams,
): Promise<PublishedWorkflow[]> {
  try {
    return await invoke<PublishedWorkflow[]>('search_marketplace_workflows', {
      searchQuery: params.searchQuery ?? null,
      category: params.category ?? null,
      minRating: params.minRating ?? null,
      tags: params.tags,
      verifiedOnly: params.verifiedOnly,
      featuredOnly: params.featuredOnly,
      sortBy: params.sortBy,
      limit: params.limit,
      offset: params.offset,
    });
  } catch (error) {
    console.error('marketplace.searchMarketplaceWorkflows failed:', error);
    throw error;
  }
}

export async function getWorkflowById(
  workflowId: string,
): Promise<PublishedWorkflow> {
  try {
    return await invoke<PublishedWorkflow>('get_workflow_by_id', {
      workflowId,
    });
  } catch (error) {
    console.error('marketplace.getWorkflowById failed:', error);
    throw error;
  }
}

export async function getWorkflowByShareUrl(
  shareUrl: string,
): Promise<PublishedWorkflow> {
  try {
    return await invoke<PublishedWorkflow>('get_workflow_by_share_url', {
      shareUrl,
    });
  } catch (error) {
    console.error('marketplace.getWorkflowByShareUrl failed:', error);
    throw error;
  }
}

export async function getCreatorWorkflows(
  creatorId: string,
): Promise<PublishedWorkflow[]> {
  try {
    return await invoke<PublishedWorkflow[]>('get_creator_workflows', {
      creatorId,
    });
  } catch (error) {
    console.error('marketplace.getCreatorWorkflows failed:', error);
    throw error;
  }
}

export async function getWorkflowsByCategory(
  category: string,
  limit: number,
): Promise<PublishedWorkflow[]> {
  try {
    return await invoke<PublishedWorkflow[]>('get_workflows_by_category', {
      category,
      limit,
    });
  } catch (error) {
    console.error('marketplace.getWorkflowsByCategory failed:', error);
    throw error;
  }
}

export async function getCategoryCounts(): Promise<[string, number][]> {
  try {
    return await invoke<[string, number][]>('get_category_counts');
  } catch (error) {
    console.error('marketplace.getCategoryCounts failed:', error);
    throw error;
  }
}

export async function getPopularTags(
  limit: number = 20,
): Promise<[string, number][]> {
  try {
    return await invoke<[string, number][]>('get_popular_tags', { limit });
  } catch (error) {
    console.error('marketplace.getPopularTags failed:', error);
    throw error;
  }
}

// ── Cloning / Forking ─────────────────────────────────────────────────────────

export async function cloneMarketplaceWorkflow(
  request: CloneWorkflowRequest,
): Promise<string> {
  try {
    return await invoke<string>('clone_marketplace_workflow', {
      workflowId: request.workflow_id,
      userId: request.user_id,
      userName: request.user_name,
      customizeTitle: request.customize_title ?? null,
    });
  } catch (error) {
    console.error('marketplace.cloneMarketplaceWorkflow failed:', error);
    throw error;
  }
}

export async function forkMarketplaceWorkflow(params: {
  workflowId: string;
  userId: string;
  userName: string;
}): Promise<string> {
  try {
    return await invoke<string>('fork_marketplace_workflow', {
      workflowId: params.workflowId,
      userId: params.userId,
      userName: params.userName,
    });
  } catch (error) {
    console.error('marketplace.forkMarketplaceWorkflow failed:', error);
    throw error;
  }
}

export async function getUserClones(
  userId: string,
): Promise<WorkflowClone[]> {
  try {
    return await invoke<WorkflowClone[]>('get_user_clones', { userId });
  } catch (error) {
    console.error('marketplace.getUserClones failed:', error);
    throw error;
  }
}

// ── Social (ratings, comments, favorites) ─────────────────────────────────────

export async function rateWorkflow(
  request: RateWorkflowRequest,
): Promise<void> {
  try {
    await invoke('rate_workflow', {
      workflowId: request.workflow_id,
      userId: request.user_id,
      rating: request.rating,
      comment: request.review_text ?? null,
    });
  } catch (error) {
    console.error('marketplace.rateWorkflow failed:', error);
    throw error;
  }
}

export async function getUserWorkflowRating(
  workflowId: string,
  userId: string,
): Promise<number | null> {
  try {
    return await invoke<number | null>('get_user_workflow_rating', {
      workflowId,
      userId,
    });
  } catch (error) {
    console.error('marketplace.getUserWorkflowRating failed:', error);
    return null;
  }
}

export async function getWorkflowReviews(
  workflowId: string,
): Promise<WorkflowReview[]> {
  try {
    return await invoke<WorkflowReview[]>('get_workflow_reviews', {
      workflowId,
    });
  } catch (error) {
    console.error('marketplace.getWorkflowReviews failed:', error);
    throw error;
  }
}

export async function commentOnWorkflow(params: {
  workflowId: string;
  userId: string;
  userName: string;
  comment: string;
}): Promise<string> {
  try {
    return await invoke<string>('comment_on_workflow', {
      workflowId: params.workflowId,
      userId: params.userId,
      userName: params.userName,
      comment: params.comment,
    });
  } catch (error) {
    console.error('marketplace.commentOnWorkflow failed:', error);
    throw error;
  }
}

export async function getWorkflowComments(
  workflowId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<WorkflowComment[]> {
  try {
    return await invoke<WorkflowComment[]>('get_workflow_comments', {
      workflowId,
      limit,
      offset,
    });
  } catch (error) {
    console.error('marketplace.getWorkflowComments failed:', error);
    throw error;
  }
}

export async function deleteWorkflowComment(
  commentId: string,
  userId: string,
): Promise<void> {
  try {
    await invoke('delete_workflow_comment', { commentId, userId });
  } catch (error) {
    console.error('marketplace.deleteWorkflowComment failed:', error);
    throw error;
  }
}

export async function favoriteWorkflow(
  workflowId: string,
  userId: string,
): Promise<void> {
  try {
    await invoke('favorite_workflow', { workflowId, userId });
  } catch (error) {
    console.error('marketplace.favoriteWorkflow failed:', error);
    throw error;
  }
}

export async function unfavoriteWorkflow(
  workflowId: string,
  userId: string,
): Promise<void> {
  try {
    await invoke('unfavorite_workflow', { workflowId, userId });
  } catch (error) {
    console.error('marketplace.unfavoriteWorkflow failed:', error);
    throw error;
  }
}

export async function isWorkflowFavorited(
  workflowId: string,
  userId: string,
): Promise<boolean> {
  try {
    return await invoke<boolean>('is_workflow_favorited', {
      workflowId,
      userId,
    });
  } catch (error) {
    console.error('marketplace.isWorkflowFavorited failed:', error);
    return false;
  }
}

export async function getUserFavorites(
  userId: string,
): Promise<PublishedWorkflow[]> {
  try {
    return await invoke<PublishedWorkflow[]>('get_user_favorites', { userId });
  } catch (error) {
    console.error('marketplace.getUserFavorites failed:', error);
    throw error;
  }
}

// ── Sharing ───────────────────────────────────────────────────────────────────

export async function shareWorkflow(
  workflowId: string,
  platform: string,
): Promise<string> {
  try {
    return await invoke<string>('share_workflow', { workflowId, platform });
  } catch (error) {
    console.error('marketplace.shareWorkflow failed:', error);
    throw error;
  }
}

export async function getWorkflowShareUrl(
  workflowId: string,
): Promise<string> {
  try {
    return await invoke<string>('get_workflow_share_url', { workflowId });
  } catch (error) {
    console.error('marketplace.getWorkflowShareUrl failed:', error);
    throw error;
  }
}

export async function getWorkflowEmbedCode(
  workflowId: string,
): Promise<string> {
  try {
    return await invoke<string>('get_workflow_embed_code', { workflowId });
  } catch (error) {
    console.error('marketplace.getWorkflowEmbedCode failed:', error);
    throw error;
  }
}

// ── Analytics / Stats ─────────────────────────────────────────────────────────

export async function getWorkflowStats(
  workflowId: string,
): Promise<WorkflowStats> {
  try {
    return await invoke<WorkflowStats>('get_workflow_stats', { workflowId });
  } catch (error) {
    console.error('marketplace.getWorkflowStats failed:', error);
    throw error;
  }
}

export async function getWorkflowAnalytics(
  workflowId: string,
): Promise<WorkflowAnalytics> {
  try {
    return await invoke<WorkflowAnalytics>('get_workflow_analytics', {
      workflowId,
    });
  } catch (error) {
    console.error('marketplace.getWorkflowAnalytics failed:', error);
    throw error;
  }
}

export async function incrementWorkflowViewCount(
  workflowId: string,
): Promise<void> {
  try {
    await invoke('increment_workflow_view_count', { workflowId });
  } catch (error) {
    console.error('marketplace.incrementWorkflowViewCount failed:', error);
    // Non-fatal — don't throw for view tracking
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function getWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  try {
    return await invoke<WorkflowTemplate[]>('get_workflow_templates');
  } catch (error) {
    console.error('marketplace.getWorkflowTemplates failed:', error);
    throw error;
  }
}

export async function getWorkflowTemplatesByCategory(
  category: string,
): Promise<WorkflowTemplate[]> {
  try {
    return await invoke<WorkflowTemplate[]>(
      'get_workflow_templates_by_category',
      { category },
    );
  } catch (error) {
    console.error('marketplace.getWorkflowTemplatesByCategory failed:', error);
    throw error;
  }
}

export async function searchWorkflowTemplates(
  query: string,
): Promise<WorkflowTemplate[]> {
  try {
    return await invoke<WorkflowTemplate[]>('search_workflow_templates', {
      query,
    });
  } catch (error) {
    console.error('marketplace.searchWorkflowTemplates failed:', error);
    throw error;
  }
}
