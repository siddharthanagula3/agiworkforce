export type EventName =
  | 'app_opened'
  | 'app_closed'
  | 'app_updated'
  | 'session_started'
  | 'session_ended'
  | 'automation_created'
  | 'automation_edited'
  | 'automation_deleted'
  | 'automation_executed'
  | 'automation_failed'
  | 'automation_scheduled'
  | 'goal_submitted'
  | 'goal_completed'
  | 'goal_failed'
  | 'step_executed'
  | 'parallel_agents_started'
  | 'chat_message_sent'
  | 'chat_conversation_started'
  | 'chat_cleared'
  | 'chat_exported'
  | 'file_uploaded'
  | 'file_downloaded'
  | 'file_created'
  | 'file_deleted'
  | 'folder_created'
  | 'browser_automation_started'
  | 'browser_automation_completed'
  | 'browser_tab_opened'
  | 'browser_screenshot_taken'
  | 'mcp_tool_called'
  | 'mcp_server_started'
  | 'mcp_server_stopped'
  | 'db_query_executed'
  | 'db_connection_created'
  | 'api_call_made'
  | 'api_key_added'
  | 'error_occurred'
  | 'error_recovered'
  | 'subscription_upgraded'
  | 'subscription_downgraded'
  | 'subscription_cancelled'
  | 'payment_method_added'
  | 'feature_discovered'
  | 'feature_enabled'
  | 'feature_disabled'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'settings_changed'
  | 'theme_changed'
  | 'provider_configured'
  | 'data_exported'
  | 'data_imported'
  | 'backup_created';

export interface AnalyticsEvent {
  name: EventName;
  properties: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
  userId?: string;
}

export interface AutomationEventProperties {
  automation_type?: 'desktop' | 'browser' | 'api' | 'hybrid';
  actions_count?: number;
  has_loop?: boolean;
  has_condition?: boolean;
  duration_ms?: number;
  success?: boolean;
  error_type?: string;
}

export interface GoalEventProperties {
  goal_type?: 'coding_task' | 'automation' | 'research' | 'general';
  parallel_agents?: number;
  duration_ms?: number;
  steps_count?: number;
  success?: boolean;
  tools_used?: string[];
  llm_provider?: string;
}

export interface ChatEventProperties {
  message_length?: number;
  has_code_block?: boolean;
  has_attachment?: boolean;
  conversation_length?: number;
  provider?: string;
  model?: string;
}

export interface MCPEventProperties {
  tool_name?: string;
  server_name?: string;
  duration_ms?: number;
  success?: boolean;
  error_type?: string;
}

export interface ErrorEventProperties extends Record<string, unknown> {
  error_type: string;
  error_message?: string;
  error_stack?: string;
  component?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recovered?: boolean;
}

export interface FeatureEventProperties {
  feature_name: string;
  from_page?: string;
  discovery_method?: 'tooltip' | 'onboarding' | 'menu' | 'search' | 'other';
}

export interface PerformanceMetrics {
  app_startup_time_ms?: number;
  page_load_time_ms?: number;
  api_response_time_ms?: number;
  automation_execution_time_ms?: number;
  goal_execution_time_ms?: number;

  lcp?: number;
  fid?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;

  memory_used_mb?: number;
  cpu_usage_percent?: number;
  network_latency_ms?: number;

  marks?: PerformanceMark[];
  measures?: PerformanceMeasure[];
}

export interface PerformanceMark {
  name: string;
  timestamp: number;
}

export interface PerformanceMeasure {
  name: string;
  duration: number;
  startMark: string;
  endMark: string;
}

export interface SessionInfo {
  sessionId: string;
  userId?: string;
  startTime: number;
  endTime?: number;
  duration_ms?: number;
  page_views: number;
  events_count: number;
  device_type?: 'desktop' | 'mobile' | 'tablet';
  os?: string;
  app_version?: string;
}

export interface UserProperties {
  userId?: string;
  plan_tier?: 'free' | 'pro' | 'enterprise';
  install_date?: string;
  app_version?: string;
  os_version?: string;
  language?: string;
  timezone?: string;
  features_enabled?: string[];
  total_automations?: number;
  total_goals?: number;
  days_active?: number;
  last_active?: string;
}

export interface AnalyticsConfig {
  enabled: boolean;
  allowErrorReporting: boolean;
  allowPerformanceMonitoring: boolean;
  allowUsageTracking: boolean;
  batchSize: number;
  batchInterval: number;
  offline: boolean;
  endpoint?: string;
}

export interface EventBatch {
  events: AnalyticsEvent[];
  batchId: string;
  timestamp: number;
  userId?: string;
  sessionId: string;
}

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage?: number;
  targetUserIds?: string[];
  targetPlanTiers?: ('free' | 'pro' | 'enterprise')[];
  enabledForAll?: boolean;
  description?: string;
}

export interface FeatureFlagConfig {
  flags: Record<string, FeatureFlag>;
  environment: 'development' | 'staging' | 'production';
  lastUpdated: number;
}

export interface UsageStats {
  dau: number;
  mau: number;
  total_users: number;
  new_users_today: number;
  new_users_this_week: number;
  new_users_this_month: number;
  avg_session_duration_ms: number;
  total_events: number;
  events_today: number;
  retention_rate?: number;
}

export interface FeatureUsageStats {
  feature_name: string;
  usage_count: number;
  unique_users: number;
  avg_duration_ms?: number;
  last_used?: string;
  trend?: 'up' | 'down' | 'stable';
}

export interface RetentionCohort {
  cohort_date: string;
  users_count: number;
  day_1_retention: number;
  day_7_retention: number;
  day_30_retention: number;
}

export interface FunnelStep {
  step_name: string;
  step_order: number;
  users_count: number;
  conversion_rate: number;
  avg_time_to_next_step_ms?: number;
}

export interface ErrorStats {
  error_type: string;
  count: number;
  unique_users: number;
  first_seen: string;
  last_seen: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved?: boolean;
}

export interface TimeSeriesData {
  timestamp: number;
  value: number;
  label?: string;
}

export interface CategoryData {
  category: string;
  value: number;
  percentage?: number;
}

export interface SystemMetrics {
  cpu_usage: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  uptime_seconds: number;
}

export interface AppMetrics {
  automations_count: number;
  goals_count: number;
  mcp_servers_count: number;
  cache_hit_rate: number;
  avg_goal_duration_ms: number;
  active_sessions: number;
  total_api_calls: number;
  failed_operations: number;
}

export interface AnalyticsExport {
  user_id?: string;
  export_date: string;
  session_info: SessionInfo[];
  events: AnalyticsEvent[];
  user_properties: UserProperties;
  performance_metrics: PerformanceMetrics[];
}

export interface PrivacyConsent {
  analytics_enabled: boolean;
  error_reporting_enabled: boolean;
  performance_monitoring_enabled: boolean;
  consent_date: string;
  consent_version: string;
}
