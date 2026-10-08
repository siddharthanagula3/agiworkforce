/**
 * @agiworkforce/types
 *
 * Shared TypeScript types for the AGI Workforce platform.
 *
 * @packageDocumentation
 */

export * from './context';

export * from './prompt-enhancement';

export * from './signaling';

export * from './tauri';

export * from './errors';

export * from './error-taxonomy';

export * from './connector-vocabulary';

export * from './connector-release';

export * from './message-block-kinds';

export * from './customModel';

export * from './tool-events';

export * from './tool-status';

export * from './account-eligibility';

export * from './agent-status';

export * from './auth';

export * from './voice';

export * from './visual-session';
export * from './visual-session-capture';

export * from './time-focus';
export * from './tool-approval-policy';
export * from './routing-profile-choice';
export * from './auto-route-explanation';
export * from './tool-request-diff';
export * from './tool-approval-stakes';
export * from './phone-steps';
export * from './surface-binding';

export * from './content-safety';

export * from './ai-act-provenance';

export * from './conversation';

export * from './workflow';

export * from './provider';

export * from './model-catalog';

export * from './provider-offering-label';

export * from './flagship-routing';

export * from './harness-protocol';

import modelsCatalogJson from './models.json' with { type: 'json' };

export { modelsCatalogJson };

export * from './runtime';

export * from './interaction-modes';

export * from './artifacts';

export * from './artifact-csp';

export * from './web-offline';

export * from './web-hooks';

export {
  type AgentConfig,
  type AgentLifecycleStatus,
  type Agent,
  type ToolExecution,
  type AgentApprovalRequest,
} from './agent';

export * from './chat';

export * from './pairing';

export * from './model';

export * from './user';

export * from './billing-catalog';
export * from './billing-plan-catalog';
export * from './product-plan';
export * from './credits';
export * from './model-price-copy';
export * from './billing-topups';
export * from './money-format';
export * from './managed-usage-limits';
export * from './rate-card';
export * from './mobile-iap';
export * from './url';
export * from './usage-vocabulary';
export * from './quick-start-intents';
export * from './paywall-vocabulary';
export * from './interactive-cards';
export * from './places-search';
export * from './project-file-citations';
export * from './project-templates';
export * from './web-search-citations';
export * from './search-provider';

export * from './subscription-entitlement';

export * from './managed-usage-balance';
export * from './account-usage-client';
export * from './account-usage-wire';

export * from './cloud-code';
export * from './cloud-code-agent-model';
export * from './project-instructions';

export * from './scheduler';

export * from './memory';
export * from './memory-wire';

export * from './research';

export * from './plugins';

export * from './council';

export * from './audit';

export * from './event-triggers';

export * from './notifications';

export * from './a2a';

export * from './cross-device';

export * from './dispatch';

export * from './remote-code';

export * from './workspace';

export * from './workspace-analytics';

export * from './product-analytics';

export * from './enterprise';

export * from './command-capabilities';

export * from './provider-adapter';

export * from './design-system';

export * from './on-device-models';

export * from './suite-contracts';

export * from './lifecycle-status';

export * from './provider-state';
export * from './sync';

export * from './dependency-registry';

export * from './trust-mode-contract';

export {
  CONCEPT_NAMES,
  CONCEPT_REGISTRY,
  ORIGIN_SURFACES,
  RESOURCE_COLUMN_CONTRACT,
  conceptByAlias,
  conceptForTable,
  getConcept,
  isConceptName,
  isOriginSurface,
  resourceColumn,
  tableDisposition,
  type ConceptAccessRule,
  type ConceptDataClass,
  type ConceptRecord,
  type ConceptRegistry,
  type ConceptRetention,
  type ConceptStorageScope,
  type OriginSurface,
  type ResourceColumnContract,
  type ResourceColumnRole,
  type TableDisposition,
  type TableDispositionRecord,
} from './concept-registry';

export * from './resource-lifecycle';

export * from './client-capability-manifest';
export * from './experiment-registry';
export * from './feature-release';
export { featureDefinition, featureMaturityLabel } from './feature-registry';
export * from './request-identity';

export * from './file-reference';
export * from './file-model';
export * from './external-resource-reference';

export * from './browser-bridge';
export * from './context-handoff-uri';
export * from './cloud-task-handoff-uri';
export * from './developer-session-handoff-uri';
export * from './capabilities';
export * from './client-failures';
export * from './network-state';

export * from './tool-display';

export * from './tool-primitive';

export type {
  AgentEvent,
  AgentEventApprovalDecision,
  AgentEventApprovalRiskLevel,
  AgentEventEnvelope,
  AgentEventFileChangeKind,
  AgentEventSource,
  AgentEventStopReason,
  AgentEventToolCategory,
  AgentTaskState,
  AppServerCapabilities,
  AppServerNotification,
  ApprovalResponseParams,
  DeveloperReasoningEffort,
  DeveloperRoutingTaskType,
  InitializeResponse,
  LocalModelListResponse,
  LocalModelProvider,
  LocalModelSummary,
  ThreadListParams,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadStartParams,
  ThreadSummary,
  TurnInterruptParams,
  TurnSteerParams,
  TurnStartParams,
  TurnSummary,
  UserInput,
} from './generated/protocol/index';

export * from './sessions';

export * from './capability-handshake';

export {
  AGENT_EVENT_SCHEMA_VERSION,
  DEVELOPER_SESSION_PROTOCOL_VERSION,
  MINIMUM_SUPPORTED_RUNTIME_VERSION,
  PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
  isSupportedRuntimeVersion,
} from './developer-session-versioning';

export {
  decodeTextFileBlock,
  inlineFileBlockAsText,
  isTextLikeFileMediaType,
  renderFileBlockAsText,
  UnsupportedFileInputError,
  UNSUPPORTED_FILE_INPUT_ERROR_NAME,
  type FileInputBlock,
  type UnsupportedFileInputReason,
} from './file-input';

export {
  AUTH_ROUTE_PREFIXES,
  PRODUCT_ROUTE_PREFIXES,
  SESSION_AUTH_ROUTE_PREFIXES,
  isAuthPath,
  isProductPath,
  routeMatcherPatterns,
  type AuthRoutePrefix,
  type ProductRoutePrefix,
} from './product-routes';

export {
  PRODUCT_LINK_PATH_PREFIX,
  PRODUCT_LINK_TARGETS,
  PRODUCT_LINK_UNAVAILABLE_STATES,
  isProductLinkId,
  isProductLinkTarget,
  parseProductLinkPath,
  productLinkPath,
  productLinkUrl,
  type ProductLink,
  type ProductLinkTarget,
  type ProductLinkUnavailableState,
} from './product-links';

export {
  BROWSER_SESSION_CAPABILITIES,
  BROWSER_SESSION_KINDS,
  CLOUD_BROWSER_UNAVAILABLE_REASON,
  browserSessionCapability,
  isBrowserSessionKind,
  resolveBrowserSession,
  type BrowserSessionCapability,
  type BrowserSessionKind,
  type BrowserSessionResolution,
} from './browser-session';

export {
  BROWSER_SELECTION_ORDER,
  BROWSER_SITE_ACCESS,
  broadensSiteAccess,
  browserSessionLabel,
  browserSiteAccess,
  browserSiteAccessRank,
  selectBrowser,
  type BrowserDeclineReason,
  type BrowserDeclined,
  type BrowserSelected,
  type BrowserSelection,
  type BrowserSelectionRefused,
  type BrowserSelectionRequest,
  type BrowserSiteAccess,
} from './browser-selection';

export {
  BROWSER_PROFILE_CAPABILITIES,
  BROWSER_PROFILE_REFUSALS,
  authorizeProfileRequest,
  findVisibleProfile,
  isBrowserProfileCapability,
  liveSessionsOnProfile,
  normalizeProfileSite,
  profileAdmits,
  profileIsLive,
  profilesVisibleTo,
  revokeProfile,
  revokeProfileAndEndSessions,
  sameProfileScope,
  selectProfileForRequest,
  type BrowserPermissionProfile,
  type BrowserProfileCapability,
  type BrowserProfileDecision,
  type BrowserProfileRefusal,
  type BrowserProfileRequest,
  type BrowserProfileScope,
  type BrowserProfileSession,
  type ProfileRevocationEffect,
} from './browser-permission-profile';

export {
  AUTOMATION_OUTCOME_MAX_BATCH,
  AUTOMATION_OUTCOME_MAX_REASON_CHARS,
  AUTOMATION_OUTCOME_MAX_TARGET_CHARS,
  AUTOMATION_OUTCOME_STATUSES,
  AUTOMATION_SURFACES,
  UNVERIFIED_SUCCESS_REASON,
  attemptedAutomationOutcome,
  automationOutcomeSuccessRate,
  isAutomationOutcomeStatus,
  settleAutomationAttempt,
  startAutomationAttempt,
  summarizeAutomationOutcomes,
  type AutomationAttempt,
  type AutomationOutcome,
  type AutomationOutcomeStatus,
  type AutomationOutcomeSummary,
  type AutomationSettlement,
  type AutomationSurface,
  type AutomationVerification,
  type StartAutomationAttemptInput,
} from './automation-outcome';

export {
  SITE_POLICY_ADMIN_UNAVAILABLE,
  SITE_POLICY_CAPABILITIES,
  evaluateSitePolicy,
  isSitePolicyCapability,
  parseAdminSitePolicy,
  parseSitePolicyPattern,
  sitePolicyDenialMessage,
  type AdminSitePolicy,
  type AdminSitePolicyParseResult,
  type SitePolicyAdminState,
  type SitePolicyCapability,
  type SitePolicyEvaluation,
  type SitePolicyInput,
  type SitePolicyReason,
  type SitePolicyRule,
} from './site-policy';

export {
  MAX_CUSTOM_INSTRUCTIONS_CHARS,
  PREFERRED_FORMATTINGS,
  PREFERRED_LENGTHS,
  PREFERRED_LENGTH_GUIDANCE,
  RESPONSE_LANGUAGE_AUTO,
  RESPONSE_STYLES,
  RESPONSE_STYLE_GUIDANCE,
  RESPONSE_STYLE_PREFERENCE_DEFAULTS,
  RESPONSE_STYLE_TRAIT_KEYS,
  TECHNICAL_LEVELS,
  normalizeResponseStylePreference,
  responseStyleLines,
  type PreferredFormatting,
  type PreferredLength,
  type ResponseStyle,
  type ResponseStylePreference,
  type TechnicalLevel,
} from './response-style-preferences';
export * from './chart-spec';
export * from './connector-connect-required';
export * from './image-jobs';
export * from './media-jobs';
