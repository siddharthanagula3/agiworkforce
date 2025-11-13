export type WorkflowCategory =
  | 'CustomerSupport'
  | 'SalesMarketing'
  | 'Development'
  | 'Operations'
  | 'PersonalProductivity'
  | 'DataAnalysis'
  | 'ContentCreation'
  | 'Finance';

export interface PublishedWorkflow {
  id: string;
  title: string;
  description: string;
  category: WorkflowCategory;
  creator_id: string;
  creator_name: string;
  creator_avatar?: string;
  workflow_definition: string; // JSON serialized WorkflowDefinition
  share_url: string;
  thumbnail_url?: string;
  clone_count: number;
  view_count: number;
  avg_rating: number;
  total_reviews: number;
  is_featured: boolean;
  is_trending: boolean;
  tags: string[];
  estimated_time_saved: number; // in minutes
  estimated_cost_saved: number; // in dollars
  license: WorkflowLicense;
  created_at: number;
  updated_at: number;
}

export interface WorkflowReview {
  id: string;
  workflow_id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  rating: number; // 1-5
  review_text?: string;
  helpful_count: number;
  created_at: number;
}

export type WorkflowLicense = 'cc0' | 'mit' | 'private';

export interface WorkflowAnalytics {
  workflow_id: string;
  total_views: number;
  total_clones: number;
  total_favorites: number;
  views_last_7_days: number;
  clones_last_7_days: number;
  conversion_rate: number; // clones / views
  avg_rating: number;
  total_reviews: number;
  trending_score: number;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version_number: number;
  changelog: string;
  created_at: number;
}

export interface MarketplaceFilters {
  searchQuery: string;
  category: WorkflowCategory | 'all';
  sortBy: 'popular' | 'recent' | 'trending' | 'highest_rated';
  minRating?: number;
  tags: string[];
  verifiedOnly: boolean;
  featuredOnly: boolean;
}

export interface SharePlatform {
  id: string;
  name: string;
  icon: string;
  url_template: string;
}

export const SHARE_PLATFORMS: SharePlatform[] = [
  {
    id: 'twitter',
    name: 'Twitter/X',
    icon: 'Twitter',
    url_template: 'https://twitter.com/intent/tweet?text={title}&url={url}',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'Linkedin',
    url_template: 'https://www.linkedin.com/sharing/share-offsite/?url={url}',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    icon: 'MessageSquare',
    url_template: 'https://reddit.com/submit?url={url}&title={title}',
  },
  {
    id: 'hackernews',
    name: 'Hacker News',
    icon: 'Newspaper',
    url_template: 'https://news.ycombinator.com/submitlink?u={url}&t={title}',
  },
  {
    id: 'email',
    name: 'Email',
    icon: 'Mail',
    url_template: 'mailto:?subject={title}&body={url}',
  },
  {
    id: 'direct',
    name: 'Copy Link',
    icon: 'Link',
    url_template: '{url}',
  },
];

export interface CloneWorkflowRequest {
  workflow_id: string;
  user_id: string;
  user_name: string;
  customize_title?: string;
}

export interface PublishWorkflowRequest {
  workflow_id: string;
  title: string;
  description: string;
  category: WorkflowCategory;
  tags: string[];
  thumbnail_url?: string;
  estimated_time_saved: number;
  estimated_cost_saved: number;
  license: WorkflowLicense;
}

export interface RateWorkflowRequest {
  workflow_id: string;
  user_id: string;
  rating: number;
  review_text?: string;
}

export interface WorkflowStats {
  total_workflows: number;
  total_clones: number;
  total_creators: number;
  workflows_this_week: number;
}

export const WORKFLOW_CATEGORIES: { value: WorkflowCategory; label: string; description: string }[] = [
  {
    value: 'CustomerSupport',
    label: 'Customer Support',
    description: 'Automate customer service tasks and responses',
  },
  {
    value: 'SalesMarketing',
    label: 'Sales & Marketing',
    description: 'Lead generation, outreach, and marketing automation',
  },
  {
    value: 'Development',
    label: 'Development',
    description: 'Code generation, testing, and deployment workflows',
  },
  {
    value: 'Operations',
    label: 'Operations',
    description: 'Business operations and process automation',
  },
  {
    value: 'PersonalProductivity',
    label: 'Personal Productivity',
    description: 'Personal task management and productivity hacks',
  },
  {
    value: 'DataAnalysis',
    label: 'Data Analysis',
    description: 'Data processing, analysis, and reporting',
  },
  {
    value: 'ContentCreation',
    label: 'Content Creation',
    description: 'Content writing, editing, and publishing',
  },
  {
    value: 'Finance',
    label: 'Finance',
    description: 'Financial analysis, reporting, and automation',
  },
];
