/**
 * Type definitions for state management
 * Shared types used across stores and API
 *
 * Note: Common types like Status, BaseEntity, ApiError, MessageRole, etc.
 * are now defined in ./common.ts and re-exported from ./index.ts
 */

export type { Status, BaseEntity, ApiError } from './common';
export type { PaginatedResponse } from './common';

export interface StorePaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export type UserRole = 'user' | 'admin' | 'moderator';
export type UserPlan = BillingPlanTier;

export interface UserProfile {
  firstName: string;
  lastName: string;
  company?: string;
  bio?: string;
  timezone: string;
  avatar?: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  theme: 'light' | 'dark' | 'system';
  language: string;
}

export interface UserUsage {
  tokensUsed: number;
  tokensLimit: number;
  jobsCompleted: number;
  employeesPurchased: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface UserBilling {
  customerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
  trialEndsAt?: Date;
  currentPeriodEnd?: Date;
  paymentMethodId?: string;
}

// Note: MessageRole is now exported from ./common.ts with 'tool' as an additional option
export type StoreMessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface StoreMessageMetadata {
  model?: string;
  tokensUsed?: number;
  cost?: number;
  processingTime?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface ConversationSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  systemPrompt?: string;
}

export interface ConversationMetadata {
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  lastMessageAt: Date;
  tags: string[];
  starred: boolean;
  pinned: boolean;
  archived: boolean;
  shared: boolean;
}

export type EmployeeTier = 'free' | 'pro' | 'premium';
export type EmployeeStatus = 'active' | 'inactive' | 'pending' | 'suspended';

export interface EmployeeCapabilities {
  maxTokensPerRequest: number;
  supportedLanguages: string[];
  specializations: string[];
  availableHours: {
    timezone: string;
    schedule: Array<{
      day: number;
      start: string;
      end: string;
    }>;
  };
}

export interface EmployeePerformance {
  successRate: number;
  averageResponseTime: number;
  totalJobsCompleted: number;
  averageRating: number;
  totalReviews: number;
  uptime: number;
}

export interface EmployeePricing {
  basePrice: number;
  currency: 'USD' | 'EUR' | 'GBP';
  billingType: 'one-time' | 'subscription' | 'usage-based';
  trialPeriod?: number;
  discount?: {
    percentage: number;
    validUntil: Date;
    reason?: string;
  };
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
export type JobPriority = 'low' | 'medium' | 'high' | 'urgent';
export type WorkerStatus = 'idle' | 'working' | 'offline' | 'maintenance';

export interface JobRequirements {
  skills: string[];
  minimumRating: number;
  maxBudget?: number;
  deadline?: Date;
  preferredWorkers?: string[];
  excludedWorkers?: string[];
}

export interface JobProgress {
  percentage: number;
  currentStep: string;
  totalSteps: number;
  estimatedCompletion: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface JobResult {
  output: unknown;
  artifacts: Array<{
    id: string;
    name: string;
    type: 'file' | 'data' | 'report';
    url?: string;
    size?: number;
    mimeType?: string;
  }>;
  metrics: {
    tokensUsed: number;
    processingTime: number;
    qualityScore?: number;
  };
}

export interface SubTask {
  id: string;
  title: string;
  description?: string;
  assignedTo: string;
  status: JobStatus;
  progress: number;
  dependencies: string[];
  estimatedDuration: number;
  actualDuration?: number;
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';
export type NotificationCategory =
  | 'system'
  | 'auth'
  | 'chat'
  | 'workforce'
  | 'employee'
  | 'billing'
  | 'security';

export interface NotificationAction {
  label: string;
  action: string | (() => void);
  style?: 'primary' | 'secondary' | 'danger';
}

export interface NotificationSettings {
  enabled: boolean;
  channels: {
    inApp: boolean;
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  categories: Record<
    NotificationCategory,
    {
      enabled: boolean;
      channels: NotificationSettings['channels'];
    }
  >;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
}

export type Theme = 'light' | 'dark' | 'system';
export type ColorScheme = 'blue' | 'green' | 'purple' | 'orange' | 'red';
export type FontSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl';
export type Density = 'compact' | 'comfortable' | 'spacious';

export interface ThemeConfig {
  mode: Theme;
  colorScheme: ColorScheme;
  primaryColor: string;
  fontSize: FontSize;
  density: Density;
  borderRadius: number;
  animations: boolean;
  reducedMotion: boolean;
}

export interface LayoutConfig {
  sidebarPosition: 'left' | 'right';
  sidebarWidth: number;
  headerHeight: number;
  footerHeight: number;
  containerMaxWidth: number;
}

export type FileType = 'image' | 'document' | 'audio' | 'video' | 'code' | 'data';

export interface FileUpload {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
  result?: {
    url: string;
    publicUrl?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
  mimeType: string;
  dimensions?: { width: number; height: number };
  duration?: number;
  encoding?: string;
  checksum: string;
}

export interface MetricPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface TimeSeries {
  name: string;
  unit?: string;
  data: MetricPoint[];
}

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'text';
  title: string;
  description?: string;
  config: Record<string, unknown>;
  data?: unknown;
  refreshInterval?: number;
  position: { x: number; y: number; w: number; h: number };
}

export interface Integration {
  id: string;
  name: string;
  type: 'oauth' | 'api_key' | 'webhook';
  status: 'active' | 'inactive' | 'error' | 'pending';
  config: Record<string, unknown>;
  capabilities: string[];
  lastSync?: Date;
  errorCount: number;
}

export interface WebhookEvent {
  id: string;
  event: string;
  payload: unknown;
  timestamp: Date;
  source: string;
  processed: boolean;
  retryCount: number;
}

export interface SearchFilters {
  query?: string;
  categories?: string[];
  tags?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  priceRange?: {
    min: number;
    max: number;
  };
  rating?: {
    min: number;
    max: number;
  };
  status?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult<T = unknown> {
  items: T[];
  total: number;
  facets: Record<string, Array<{ value: string; count: number }>>;
  suggestions: string[];
  searchTime: number;
}

// Note: Individual store types are exported from their respective files
import type { BillingPlanTier } from '@agiworkforce/types';
