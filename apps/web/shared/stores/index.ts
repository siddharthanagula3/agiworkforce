/**
 * Central store exports for AGI
 * State management using Zustand for client state and React Query for server state
 */

// ========================================
// Zustand Stores
// ========================================

// Auth Store - Authentication and user management (unified)
export { useAuthStore, type AuthState, type AuthResult } from './authentication-store';

// Cowork Folder Store - local-only working directory (File System Access API)
export {
  useCoworkFolderStore,
  supportsDirectoryPicker,
  type CoworkFolderStore,
  type CoworkFolderState,
  type CoworkFolderActions,
} from './cowork-folder-store';

// Notification Store - App notifications and toasts
export {
  useNotificationStore,
  type NotificationStore,
  type NotificationState,
  type NotificationActions,
  type Notification,
  type Toast,
} from './notification-store';

// Layout Store - sidebar collapse state for the chat shell
export { useUIStore, type UIStore, type UIState, type UIActions } from './layout-store';

// User Profile Store
export {
  useUserProfileStore,
  useUser,
  useUserPlan,
  useUserUsage,
  useUserBilling,
  useUserProfile,
  useUserProfileDetails,
  useUserProfileLoading,
  useUserProfileError,
  type UserProfile,
  type UserProfileState,
  type UserProfileActions,
  type UserProfileStore,
} from './user-profile-store';

// Agent Metrics Store - Real-time metrics from agent activity
export {
  useAgentMetricsStore,
  type ChatSession as AgentChatSession,
  type AgentMetrics,
  type AgentMetricsState,
  type AgentActivityType,
  type SessionStatusType,
} from './agent-metrics-store';

// Company Hub Store - Workspace collaboration
export {
  useCompanyHubStore,
  type CompanyHubStore,
  type CompanyHubState,
  type CompanyHubActions,
  type CompanyHubSession,
  type AgentAssignment,
  type HubMessage,
  type UpsellRequest,
} from './company-hub-store';

// Artifact Store - Code artifacts and generated content
export { useArtifactStore, type ArtifactState } from './artifact-store';

// Usage Warning Store - Token usage warnings and limits

// Mission Control Store - Mission orchestration state
export {
  useMissionStore,
  useMissionStatus,
  useMissionPlan,
  useActiveEmployees,
  useMissionMessages,
  useCollaborativeMode,
  useEmployee,
  useCurrentMissionId,
  startMissionCleanupInterval,
  stopMissionCleanupInterval,
  type MissionState,
  type MissionStateData,
  type Task,
  type ActiveEmployee,
  type EmployeeLogEntry,
  type MissionMessage,
  type MissionStatusType,
  type EmployeeStatusType,
  type LogEntryType,
  type MissionModeType,
} from './mission-control-store';

// Company Hub Store Selectors
export {
  useActiveSession,
  useAssignedAgentsRecord,
  useAssignedAgents,
  useAssignedAgent,
  useTokenUsage,
  useHubMessages,
  usePendingUpsell,
  useOrchestrationStatus,
  useActiveSessionId,
  useUpsellQueue,
  useLastUpdate,
} from './company-hub-store';

// Notification Store Selectors
export {
  useNotificationsRecord,
  useNotifications,
  useUnreadNotifications,
  useToastsRecord,
  useToasts,
  useUnreadCount,
  useNotificationSettings,
  useNotificationUIState,
} from './notification-store';

// Layout Store Selectors — removed with the members they selected (PP-24).
// `useTheme`/`useNotifications` here shadowed the real ones (`useAppTheme` and
// `notification-store`); re-exporting them from a barrel nothing imports was
// the only thing keeping them alive.

// ========================================
// React Query Configuration
// ========================================

export { queryClient, queryKeys, useQuery, useMutation, useInfiniteQuery } from './query-client';

// ========================================
// Type Definitions
// ========================================

export * from '@shared/types/store-types';
