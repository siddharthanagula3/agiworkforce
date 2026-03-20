/**
 * Marketplace API — typed wrappers for workflow marketplace commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface PublishedWorkflow {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  creatorId: string;
  creatorName: string;
  rating: number;
  ratingCount: number;
  cloneCount: number;
  shareUrl: string;
  verified: boolean;
  featured: boolean;
  estimatedTimeSaved?: number;
  estimatedCostSaved?: number;
  thumbnailUrl?: string;
  createdAt: string;
}
export interface WorkflowComment {
  id: string;
  userId: string;
  userName: string;
  comment: string;
  createdAt: string;
}
export interface WorkflowStats {
  views: number;
  clones: number;
  favorites: number;
  rating: number;
  ratingCount: number;
}
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: unknown[];
}
export interface WorkflowRating {
  userId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}
export interface WorkflowAnalytics {
  views: number;
  clones: number;
  uniqueUsers: number;
  retentionRate: number;
}

// ---- Commands ----

export async function publishWorkflowToMarketplace(
  workflowId: string,
  category: string,
  tags: string[],
  userId: string,
  userName: string,
  estimatedTimeSaved?: number,
  estimatedCostSaved?: number,
  thumbnailUrl?: string,
): Promise<PublishedWorkflow> {
  return command<PublishedWorkflow>('publish_workflow_to_marketplace', {
    workflowId,
    category,
    tags,
    estimatedTimeSaved,
    estimatedCostSaved,
    thumbnailUrl,
    userId,
    userName,
  });
}
export async function unpublishWorkflow(workflowId: string, userId: string): Promise<void> {
  return command<void>('unpublish_workflow', { workflowId, userId });
}
export async function getFeaturedWorkflows(limit: number): Promise<PublishedWorkflow[]> {
  return command<PublishedWorkflow[]>('get_featured_workflows', { limit });
}
export async function getTrendingWorkflows(limit: number): Promise<PublishedWorkflow[]> {
  return command<PublishedWorkflow[]>('get_trending_workflows', { limit });
}
export async function searchMarketplaceWorkflows(
  searchQuery: string,
  opts?: {
    category?: string;
    minRating?: number;
    tags?: string[];
    verifiedOnly?: boolean;
    featuredOnly?: boolean;
    sortBy?: string;
    limit?: number;
    offset?: number;
  },
): Promise<PublishedWorkflow[]> {
  return command<PublishedWorkflow[]>('search_marketplace_workflows', { searchQuery, ...opts });
}
export async function getWorkflowByShareUrl(shareUrl: string): Promise<PublishedWorkflow> {
  return command<PublishedWorkflow>('get_workflow_by_share_url', { shareUrl });
}
export async function getCreatorWorkflows(creatorId: string): Promise<PublishedWorkflow[]> {
  return command<PublishedWorkflow[]>('get_creator_workflows', { creatorId });
}
export async function getMyPublishedWorkflows(userId: string): Promise<PublishedWorkflow[]> {
  return command<PublishedWorkflow[]>('get_my_published_workflows', { userId });
}
export async function getWorkflowsByCategory(
  category: string,
  limit: number,
): Promise<PublishedWorkflow[]> {
  return command<PublishedWorkflow[]>('get_workflows_by_category', { category, limit });
}
export async function getCategoryCounts(): Promise<[string, number][]> {
  return command<[string, number][]>('get_category_counts');
}
export async function getPopularTags(limit: number): Promise<[string, number][]> {
  return command<[string, number][]>('get_popular_tags', { limit });
}
export async function cloneMarketplaceWorkflow(
  workflowId: string,
  userId: string,
  userName: string,
): Promise<string> {
  return command<string>('clone_marketplace_workflow', { workflowId, userId, userName });
}
export async function forkMarketplaceWorkflow(
  workflowId: string,
  userId: string,
  userName: string,
): Promise<string> {
  return command<string>('fork_marketplace_workflow', { workflowId, userId, userName });
}
export async function rateWorkflow(
  workflowId: string,
  userId: string,
  rating: number,
  comment?: string,
): Promise<void> {
  return command<void>('rate_workflow', { workflowId, userId, rating, comment });
}
export async function getUserWorkflowRating(
  workflowId: string,
  userId: string,
): Promise<number | null> {
  return command<number | null>('get_user_workflow_rating', { workflowId, userId });
}
export async function commentOnWorkflow(
  workflowId: string,
  userId: string,
  userName: string,
  comment: string,
): Promise<string> {
  return command<string>('comment_on_workflow', { workflowId, userId, userName, comment });
}
export async function getWorkflowComments(
  workflowId: string,
  limit: number,
  offset: number,
): Promise<WorkflowComment[]> {
  return command<WorkflowComment[]>('get_workflow_comments', { workflowId, limit, offset });
}
export async function deleteWorkflowComment(commentId: string, userId: string): Promise<void> {
  return command<void>('delete_workflow_comment', { commentId, userId });
}
export async function favoriteWorkflow(workflowId: string, userId: string): Promise<void> {
  return command<void>('favorite_workflow', { workflowId, userId });
}
export async function unfavoriteWorkflow(workflowId: string, userId: string): Promise<void> {
  return command<void>('unfavorite_workflow', { workflowId, userId });
}
export async function isWorkflowFavorited(workflowId: string, userId: string): Promise<boolean> {
  return command<boolean>('is_workflow_favorited', { workflowId, userId });
}
export async function getUserFavorites(userId: string): Promise<PublishedWorkflow[]> {
  return command<PublishedWorkflow[]>('get_user_favorites', { userId });
}
export async function getUserClones(userId: string): Promise<unknown[]> {
  return command<unknown[]>('get_user_clones', { userId });
}
export async function shareWorkflow(workflowId: string, platform: string): Promise<string> {
  return command<string>('share_workflow', { workflowId, platform });
}
export async function getWorkflowStats(workflowId: string): Promise<WorkflowStats> {
  return command<WorkflowStats>('get_workflow_stats', { workflowId });
}
export async function getWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  return command<WorkflowTemplate[]>('get_workflow_templates');
}
export async function getWorkflowTemplatesByCategory(
  category: string,
): Promise<WorkflowTemplate[]> {
  return command<WorkflowTemplate[]>('get_workflow_templates_by_category', { category });
}
export async function searchWorkflowTemplates(query: string): Promise<WorkflowTemplate[]> {
  return command<WorkflowTemplate[]>('search_workflow_templates', { query });
}
export async function getPublishedWorkflows(opts?: {
  category?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
}): Promise<PublishedWorkflow[]> {
  return command<PublishedWorkflow[]>('get_published_workflows', opts);
}
export async function getWorkflowById(workflowId: string): Promise<PublishedWorkflow> {
  return command<PublishedWorkflow>('get_workflow_by_id', { workflowId });
}
export async function getWorkflowReviews(workflowId: string): Promise<WorkflowRating[]> {
  return command<WorkflowRating[]>('get_workflow_reviews', { workflowId });
}
export async function getWorkflowAnalytics(workflowId: string): Promise<WorkflowAnalytics> {
  return command<WorkflowAnalytics>('get_workflow_analytics', { workflowId });
}
export async function publishWorkflow(
  workflowId: string,
  category: string,
  tags: string[],
  estimatedTimeSaved?: number,
  estimatedCostSaved?: number,
  thumbnailUrl?: string,
): Promise<PublishedWorkflow> {
  return command<PublishedWorkflow>('publish_workflow', {
    workflowId,
    category,
    tags,
    thumbnailUrl,
    estimatedTimeSaved,
    estimatedCostSaved,
  });
}
export async function getWorkflowShareUrl(workflowId: string): Promise<string> {
  return command<string>('get_workflow_share_url', { workflowId });
}
export async function getWorkflowEmbedCode(workflowId: string): Promise<string> {
  return command<string>('get_workflow_embed_code', { workflowId });
}
export async function incrementWorkflowViewCount(workflowId: string): Promise<void> {
  return command<void>('increment_workflow_view_count', { workflowId });
}
