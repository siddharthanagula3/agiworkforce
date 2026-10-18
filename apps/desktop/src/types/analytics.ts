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

export interface ErrorEventProperties extends Record<string, unknown> {
  error_type: string;
  error_message?: string;
  error_stack?: string;
  component?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recovered?: boolean;
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

export interface PrivacyConsent {
  analytics_enabled: boolean;
  error_reporting_enabled: boolean;
  performance_monitoring_enabled: boolean;
  consent_date: string;
  consent_version: string;
}
