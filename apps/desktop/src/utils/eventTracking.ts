/**
 * Event Tracking Utilities
 *
 * Helper functions for tracking events throughout the app
 */

import { analytics } from '../services/analytics';
import { performanceMonitor } from '../services/performance';
import { EventName } from '../types/analytics';

/**
 * Track app lifecycle events
 */
export const trackAppEvents = {
  appOpened: () => {
    analytics.track('app_opened', {
      timestamp: Date.now(),
    });
  },

  appClosed: () => {
    analytics.track('app_closed', {
      timestamp: Date.now(),
    });
  },

  appUpdated: (fromVersion: string, toVersion: string) => {
    analytics.track('app_updated', {
      from_version: fromVersion,
      to_version: toVersion,
    });
  },
};

/**
 * Track automation events
 */
export const trackAutomationEvents = {
  created: (automationType: string, actionsCount: number) => {
    analytics.track('automation_created', {
      automation_type: automationType,
      actions_count: actionsCount,
    });
  },

  executed: (automationId: string, duration: number, success: boolean) => {
    analytics.track('automation_executed', {
      automation_id: automationId,
      duration_ms: duration,
      success,
    });

    performanceMonitor.trackAutomationExecution(automationId, duration, success);
  },

  failed: (automationId: string, errorType: string) => {
    analytics.track('automation_failed', {
      automation_id: automationId,
      error_type: errorType,
    });
  },

  deleted: (automationId: string) => {
    analytics.track('automation_deleted', {
      automation_id: automationId,
    });
  },
};

/**
 * Track AGI and goal events
 */
export const trackGoalEvents = {
  submitted: (goalType: string, parallelAgents: number) => {
    analytics.track('goal_submitted', {
      goal_type: goalType,
      parallel_agents: parallelAgents,
    });
  },

  completed: (
    goalId: string,
    duration: number,
    stepsCount: number,
    toolsUsed: string[]
  ) => {
    analytics.track('goal_completed', {
      goal_id: goalId,
      duration_ms: duration,
      steps_count: stepsCount,
      tools_used: toolsUsed,
      success: true,
    });

    performanceMonitor.trackGoalExecution(goalId, duration, true, stepsCount);
  },

  failed: (goalId: string, duration: number, errorType: string) => {
    analytics.track('goal_failed', {
      goal_id: goalId,
      duration_ms: duration,
      error_type: errorType,
      success: false,
    });

    performanceMonitor.trackGoalExecution(goalId, duration, false);
  },

  stepExecuted: (stepName: string, duration: number) => {
    analytics.track('step_executed', {
      step_name: stepName,
      duration_ms: duration,
    });
  },
};

/**
 * Track chat events
 */
export const trackChatEvents = {
  messageSent: (messageLength: number, hasCodeBlock: boolean, provider: string) => {
    analytics.track('chat_message_sent', {
      message_length: messageLength,
      has_code_block: hasCodeBlock,
      provider,
    });
  },

  conversationStarted: () => {
    analytics.track('chat_conversation_started', {
      timestamp: Date.now(),
    });
  },

  cleared: (conversationLength: number) => {
    analytics.track('chat_cleared', {
      conversation_length: conversationLength,
    });
  },

  exported: (format: string) => {
    analytics.track('chat_exported', {
      format,
    });
  },
};

/**
 * Track file operations
 */
export const trackFileEvents = {
  uploaded: (fileType: string, fileSize: number) => {
    analytics.track('file_uploaded', {
      file_type: fileType,
      file_size_bytes: fileSize,
    });
  },

  downloaded: (fileType: string, fileSize: number) => {
    analytics.track('file_downloaded', {
      file_type: fileType,
      file_size_bytes: fileSize,
    });
  },

  created: (fileType: string) => {
    analytics.track('file_created', {
      file_type: fileType,
    });
  },

  deleted: (fileType: string) => {
    analytics.track('file_deleted', {
      file_type: fileType,
    });
  },
};

/**
 * Track browser automation events
 */
export const trackBrowserEvents = {
  started: (url: string) => {
    analytics.track('browser_automation_started', {
      url_domain: new URL(url).hostname, // Only hostname, not full URL (privacy)
    });
  },

  completed: (duration: number, actionsCount: number) => {
    analytics.track('browser_automation_completed', {
      duration_ms: duration,
      actions_count: actionsCount,
    });
  },

  screenshotTaken: () => {
    analytics.track('browser_screenshot_taken', {
      timestamp: Date.now(),
    });
  },
};

/**
 * Track MCP tool events
 */
export const trackMCPEvents = {
  toolCalled: (toolName: string, serverName: string, duration: number) => {
    analytics.track('mcp_tool_called', {
      tool_name: toolName,
      server_name: serverName,
      duration_ms: duration,
    });
  },

  serverStarted: (serverName: string) => {
    analytics.track('mcp_server_started', {
      server_name: serverName,
    });
  },

  serverStopped: (serverName: string, uptime: number) => {
    analytics.track('mcp_server_stopped', {
      server_name: serverName,
      uptime_ms: uptime,
    });
  },
};

/**
 * Track database operations
 */
export const trackDatabaseEvents = {
  queryExecuted: (dbType: string, duration: number, success: boolean) => {
    analytics.track('db_query_executed', {
      db_type: dbType,
      duration_ms: duration,
      success,
    });
  },

  connectionCreated: (dbType: string) => {
    analytics.track('db_connection_created', {
      db_type: dbType,
    });
  },
};

/**
 * Track API operations
 */
export const trackAPIEvents = {
  callMade: (endpoint: string, method: string, duration: number, success: boolean) => {
    analytics.track('api_call_made', {
      endpoint_path: endpoint, // Don't include query params (privacy)
      method,
      duration_ms: duration,
      success,
    });

    performanceMonitor.trackApiCall(endpoint, duration, success);
  },

  keyAdded: (provider: string) => {
    analytics.track('api_key_added', {
      provider,
    });
  },
};

/**
 * Track feature discovery and usage
 */
export const trackFeatureEvents = {
  discovered: (featureName: string, discoveryMethod: string, fromPage?: string) => {
    analytics.track('feature_discovered', {
      feature_name: featureName,
      discovery_method: discoveryMethod,
      from_page: fromPage,
    });
  },

  enabled: (featureName: string) => {
    analytics.track('feature_enabled', {
      feature_name: featureName,
    });
  },

  disabled: (featureName: string) => {
    analytics.track('feature_disabled', {
      feature_name: featureName,
    });
  },
};

/**
 * Track settings changes
 */
export const trackSettingsEvents = {
  changed: (settingType: string, newValue: any) => {
    analytics.track('settings_changed', {
      setting_type: settingType,
      // Don't log the actual value if it might be sensitive
    });
  },

  themeChanged: (theme: string) => {
    analytics.track('theme_changed', {
      theme,
    });
  },

  providerConfigured: (provider: string) => {
    analytics.track('provider_configured', {
      provider,
    });
  },
};

/**
 * Track onboarding events
 */
export const trackOnboardingEvents = {
  completed: (duration: number) => {
    analytics.track('onboarding_completed', {
      duration_ms: duration,
    });
  },

  skipped: (stepNumber: number) => {
    analytics.track('onboarding_skipped', {
      step_number: stepNumber,
    });
  },
};

/**
 * Track subscription events
 */
export const trackSubscriptionEvents = {
  upgraded: (fromTier: string, toTier: string) => {
    analytics.track('subscription_upgraded', {
      from_tier: fromTier,
      to_tier: toTier,
    });
  },

  downgraded: (fromTier: string, toTier: string) => {
    analytics.track('subscription_downgraded', {
      from_tier: fromTier,
      to_tier: toTier,
    });
  },

  cancelled: (tier: string, reason?: string) => {
    analytics.track('subscription_cancelled', {
      tier,
      reason,
    });
  },
};

/**
 * Track data export/import
 */
export const trackDataEvents = {
  exported: (dataType: string, format: string) => {
    analytics.track('data_exported', {
      data_type: dataType,
      format,
    });
  },

  imported: (dataType: string, format: string, itemsCount: number) => {
    analytics.track('data_imported', {
      data_type: dataType,
      format,
      items_count: itemsCount,
    });
  },

  backupCreated: (backupSize: number) => {
    analytics.track('backup_created', {
      backup_size_bytes: backupSize,
    });
  },
};

/**
 * Helper to track page views
 */
export const trackPageView = (pageName: string, referrer?: string) => {
  analytics.trackPageView(pageName, {
    referrer,
    timestamp: Date.now(),
  });
};

/**
 * Helper to track timed operations
 */
export const trackTimedOperation = async <T,>(
  operationName: string,
  operation: () => Promise<T>,
  eventName: EventName,
  additionalProps?: Record<string, any>
): Promise<T> => {
  return await performanceMonitor.timeOperation(operationName, async () => {
    const result = await operation();
    analytics.track(eventName, {
      operation: operationName,
      ...additionalProps,
    });
    return result;
  });
};
