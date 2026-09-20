import type { AuditEventType } from '@/lib/security-audit';

/**
 * Why a mutating route emits no audit event. Only `gap` is a defect; the rest
 * are decisions, and each one has to stay true for the route it is claimed for.
 */
export type UnauditedReason =
  | 'own_content'
  | 'dedicated_record'
  | 'no_governed_state'
  | 'inbound_callback'
  | 'pre_account'
  | 'gap';

export interface UnauditedRoute {
  route: string;
  reason: UnauditedReason;
  /** Only for `gap`: the event the route must emit once its owner adds it. */
  expectedEvent?: string;
}

/**
 * Every mutating route that records nothing, with the reason it does not.
 *
 * The test beside this file fails when a route leaves the list without being
 * audited, when a listed route starts emitting, and when a new mutating route
 * lands without a decision, which is the only way this stays true.
 */
export const UNAUDITED_MUTATING_ROUTES: readonly UnauditedRoute[] = [
  { route: 'analytics/events/route.ts', reason: 'own_content' },
  { route: 'artifacts/publish/[token]/route.ts', reason: 'own_content' },
  { route: 'auth/desktop-token/route.ts', reason: 'no_governed_state' },
  { route: 'auth/device/code/route.ts', reason: 'no_governed_state' },
  { route: 'auth/device/token/route.ts', reason: 'no_governed_state' },
  { route: 'beta/apply/route.ts', reason: 'pre_account' },
  { route: 'chat/conversations/[id]/branches/route.ts', reason: 'own_content' },
  {
    route: 'chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts',
    reason: 'own_content',
  },
  { route: 'chat/conversations/[id]/messages/[messageId]/route.ts', reason: 'own_content' },
  { route: 'chat/conversations/[id]/messages/bulk/route.ts', reason: 'own_content' },
  { route: 'chat/conversations/[id]/messages/route.ts', reason: 'own_content' },
  { route: 'chat/conversations/[id]/restore/route.ts', reason: 'own_content' },
  { route: 'chat/conversations/[id]/route.ts', reason: 'own_content' },
  { route: 'chat/conversations/bulk/route.ts', reason: 'own_content' },
  { route: 'chat/conversations/route.ts', reason: 'own_content' },
  { route: 'chat/sync/route.ts', reason: 'no_governed_state' },
  { route: 'claim-offer/route.ts', reason: 'pre_account' },
  { route: 'consent/route.ts', reason: 'dedicated_record' },
  { route: 'device/poll/route.ts', reason: 'no_governed_state' },
  { route: 'devices/heartbeat/route.ts', reason: 'no_governed_state' },
  { route: 'feedback/route.ts', reason: 'own_content' },
  { route: 'files/uploads/[uploadId]/route.ts', reason: 'own_content' },
  { route: 'files/uploads/route.ts', reason: 'own_content' },
  { route: 'github/issues/route.ts', reason: 'own_content' },
  { route: 'interactive-cards/respond/route.ts', reason: 'own_content' },
  {
    route: 'llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts',
    reason: 'no_governed_state',
  },
  { route: 'llm/v1/route/preview/route.ts', reason: 'no_governed_state' },
  { route: 'me/routing-preferences/route.ts', reason: 'own_content' },
  { route: 'media/route.ts', reason: 'own_content' },
  { route: 'media/video/cancel/route.ts', reason: 'own_content' },
  { route: 'media/video/openrouter-webhook/route.ts', reason: 'inbound_callback' },
  { route: 'memory/[id]/route.ts', reason: 'own_content' },
  { route: 'memory/commands/route.ts', reason: 'own_content' },
  { route: 'memory/import/route.ts', reason: 'own_content' },
  { route: 'memory/route.ts', reason: 'own_content' },
  { route: 'memory/sync/route.ts', reason: 'no_governed_state' },
  { route: 'mobile/content-report/route.ts', reason: 'dedicated_record' },
  { route: 'mobile/feedback/route.ts', reason: 'own_content' },
  { route: 'mobile/iap/apple-notifications/route.ts', reason: 'inbound_callback' },
  { route: 'mobile/iap/google-notifications/route.ts', reason: 'inbound_callback' },
  { route: 'mobile/push-token/route.ts', reason: 'no_governed_state' },
  { route: 'notifications/route.ts', reason: 'own_content' },
  { route: 'projects/[id]/duplicate/route.ts', reason: 'own_content' },
  { route: 'projects/[id]/knowledge-files/[fileId]/reindex/route.ts', reason: 'own_content' },
  { route: 'projects/[id]/knowledge-files/[fileId]/route.ts', reason: 'own_content' },
  { route: 'projects/[id]/knowledge-files/route.ts', reason: 'own_content' },
  { route: 'projects/[id]/route.ts', reason: 'own_content' },
  { route: 'projects/sync/route.ts', reason: 'no_governed_state' },
  { route: 'search/route.ts', reason: 'own_content' },
  { route: 'settings/2fa/setup/route.ts', reason: 'no_governed_state' },
  { route: 'settings/organization/active/route.ts', reason: 'no_governed_state' },
  { route: 'settings/preferences/route.ts', reason: 'own_content' },
  { route: 'settings/sync/route.ts', reason: 'no_governed_state' },
  { route: 'settings/workspaces/route.ts', reason: 'no_governed_state' },
  { route: 'stripe-webhook/route.ts', reason: 'inbound_callback' },
  { route: 'study/sessions/route.ts', reason: 'own_content' },
  { route: 'support/ask/route.ts', reason: 'own_content' },
  { route: 'support/diagnostics/route.ts', reason: 'dedicated_record' },
  { route: 'support/handoff/[sessionId]/messages/route.ts', reason: 'own_content' },
  { route: 'support/handoff/[sessionId]/route.ts', reason: 'dedicated_record' },
  { route: 'support/handoff/agent/[sessionId]/claim/route.ts', reason: 'dedicated_record' },
  { route: 'support/handoff/agent/[sessionId]/messages/route.ts', reason: 'own_content' },
  { route: 'support/handoff/agent/presence/route.ts', reason: 'no_governed_state' },
  { route: 'support/handoff/route.ts', reason: 'dedicated_record' },
  { route: 'support/tickets/[ticketId]/escalate/route.ts', reason: 'dedicated_record' },
  { route: 'support/tickets/[ticketId]/route.ts', reason: 'dedicated_record' },
  { route: 'support/tickets/route.ts', reason: 'dedicated_record' },
  { route: 'telemetry/client/route.ts', reason: 'no_governed_state' },
  { route: 'terms/accept/route.ts', reason: 'dedicated_record' },
  { route: 'upgrade/preview/route.ts', reason: 'no_governed_state' },
  { route: 'uploads/chat-attachment/put/route.ts', reason: 'own_content' },
  { route: 'uploads/knowledge-file/put/route.ts', reason: 'own_content' },
  { route: 'uploads/local-project-knowledge/route.ts', reason: 'own_content' },
  { route: 'uploads/presign/route.ts', reason: 'own_content' },
  { route: 'voice/live/sessions/[sessionId]/settings/route.ts', reason: 'own_content' },
  { route: 'waitlist/cloud-managed/route.ts', reason: 'pre_account' },
  { route: 'waitlist/public/route.ts', reason: 'pre_account' },
  { route: 'waitlist/route.ts', reason: 'pre_account' },
  { route: 'web-push/route.ts', reason: 'no_governed_state' },
  { route: 'webhooks/connectors/[triggerId]/route.ts', reason: 'inbound_callback' },
  { route: 'webhooks/gmail/route.ts', reason: 'inbound_callback' },
  { route: 'webhooks/google-calendar/route.ts', reason: 'inbound_callback' },
  { route: 'webhooks/slack/route.ts', reason: 'inbound_callback' },
] as const;

export interface RequiredRouteAuditEvents {
  route: string;
  eventTypes: readonly AuditEventType[];
}

export const REQUIRED_ROUTE_AUDIT_EVENTS: readonly RequiredRouteAuditEvents[] = [
  {
    route: 'code/sessions/[sessionId]/agent/cancel/route.ts',
    eventTypes: ['code_session_lifecycle_changed'],
  },
  {
    route: 'code/sessions/[sessionId]/close/route.ts',
    eventTypes: ['code_session_lifecycle_changed'],
  },
  {
    route: 'code/sessions/[sessionId]/route.ts',
    eventTypes: ['code_session_lifecycle_changed'],
  },
  {
    route: 'connectors/[connectorId]/mcp/route.ts',
    eventTypes: ['data_accessed', 'tool_executed'],
  },
  {
    route: 'connectors/permissions/route.ts',
    eventTypes: ['connector_setting_changed'],
  },
  {
    route: 'llm/v1/chat/completions/runs/[runId]/archive/route.ts',
    eventTypes: ['agent_run_lifecycle_changed'],
  },
  {
    route: 'llm/v1/chat/completions/runs/[runId]/pause/route.ts',
    eventTypes: ['agent_run_lifecycle_changed'],
  },
  {
    route: 'llm/v1/chat/completions/runs/[runId]/route.ts',
    eventTypes: ['agent_run_lifecycle_changed'],
  },
  { route: 'mobile/iap/verify/route.ts', eventTypes: ['mobile_purchase_verified'] },
  { route: 'plugins/[id]/settings/route.ts', eventTypes: ['plugin_setting_changed'] },
  {
    route: 'plugins/authored/route.ts',
    eventTypes: ['plugin_marketplace_changed'],
  },
  {
    route: 'plugins/marketplace-installations/[id]/settings/route.ts',
    eventTypes: ['plugin_setting_changed'],
  },
  {
    route: 'plugins/marketplaces/[id]/refresh/route.ts',
    eventTypes: ['plugin_marketplace_changed'],
  },
  {
    route: 'plugins/marketplaces/[id]/route.ts',
    eventTypes: ['plugin_marketplace_changed'],
  },
  {
    route: 'plugins/marketplaces/route.ts',
    eventTypes: ['plugin_marketplace_changed'],
  },
  { route: 'plugins/uploads/route.ts', eventTypes: ['plugin_marketplace_changed'] },
  { route: 'privacy/requests/route.ts', eventTypes: ['privacy_request_submitted'] },
  {
    route: 'settings/organization/shared/artifacts/[artifactId]/route.ts',
    eventTypes: ['organization_share_revoked'],
  },
  {
    route: 'settings/organization/shared/connectors/[connectorId]/route.ts',
    eventTypes: ['organization_share_granted', 'organization_share_revoked'],
  },
  {
    route: 'settings/organization/shared/conversations/[sharedSessionId]/route.ts',
    eventTypes: ['organization_share_revoked'],
  },
  {
    route: 'settings/team/invitations/accept/route.ts',
    eventTypes: ['member_joined', 'member_invitation_declined'],
  },
  {
    route: 'support/actions/confirm/route.ts',
    eventTypes: ['support_action_confirmed'],
  },
  {
    route: 'support/actions/propose/route.ts',
    eventTypes: ['support_action_proposed'],
  },
] as const;

export type AuditedSurface = 'chrome' | 'vscode' | 'cli' | 'desktop' | 'mobile';

export interface SurfaceAuditCoverage {
  surface: AuditedSurface;
  action: string;
  /** The web route the surface calls; the audit record is written there. */
  route: string;
  /** The module that calls recordAuditEvent, which is rarely the route itself. */
  emitter: string;
  eventType: AuditEventType;
  /** The path the surface's own source must contain, proving it reaches the route. */
  endpoint: string;
}

/**
 * The governed actions each non-web surface performs, and the web route whose
 * audit record covers it. No surface writes the enterprise trail itself: they
 * all act through the same API, which is what makes one trail complete.
 */
export const SURFACE_AUDIT_COVERAGE: readonly SurfaceAuditCoverage[] = [
  {
    surface: 'cli',
    action: 'run a tool the workspace governs',
    route: 'llm/v1/chat/completions/route.ts',
    emitter: 'app/api/llm/v1/chat/completions/lib/tool-loop.ts',
    eventType: 'tool_executed',
    endpoint: '/api/llm/v1/chat/completions',
  },
  {
    surface: 'cli',
    action: 'sign in from a terminal through the device flow',
    route: 'auth/device/approve/route.ts',
    emitter: 'app/api/auth/device/approve/route.ts',
    eventType: 'device_authorization_approved',
    endpoint: '/api/auth/device/code',
  },
  {
    surface: 'cli',
    action: 'change the workspace connector policy',
    route: 'settings/organization/connector-policy/route.ts',
    emitter: 'app/api/settings/organization/connector-policy/route.ts',
    eventType: 'admin_policy_changed',
    endpoint: '/api/settings/organization/connector-policy',
  },
  {
    surface: 'chrome',
    action: 'act on a page under browser automation',
    route: 'llm/v1/chat/completions/route.ts',
    emitter: 'app/api/llm/v1/chat/completions/lib/tool-loop.ts',
    eventType: 'browser_action',
    endpoint: '/api/llm/v1/chat/completions',
  },
  {
    surface: 'chrome',
    action: 'revoke a browser session from the extension',
    route: 'settings/sessions/route.ts',
    emitter: 'app/api/settings/sessions/route.ts',
    eventType: 'session_revoked',
    endpoint: '/api/settings/sessions/',
  },
  {
    surface: 'vscode',
    action: 'run a tool the workspace governs',
    route: 'llm/v1/chat/completions/route.ts',
    emitter: 'app/api/llm/v1/chat/completions/lib/tool-loop.ts',
    eventType: 'tool_executed',
    endpoint: '/api/llm/v1',
  },
  {
    surface: 'vscode',
    action: 'sign in from the editor through the device flow',
    route: 'auth/device/approve/route.ts',
    emitter: 'app/api/auth/device/approve/route.ts',
    eventType: 'device_authorization_approved',
    endpoint: '/api/auth/device/code',
  },
] as const;
