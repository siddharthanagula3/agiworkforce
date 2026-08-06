/**
 * Web re-export of the canonical client-side "connect required" reader.
 *
 * The verification logic is surface-neutral (structure, tool binding, and
 * same-origin destination checks over a tool result string) and both chat
 * renderers in this repo need it — web's `ToolTimeline` and the shared
 * `AgentActivityTimeline`, which Desktop and Mobile also render. It therefore
 * lives in `@agiworkforce/unified-chat`; this module keeps
 * `@/features/chat/lib/...` working as the web import site.
 *
 * See `packages/ui/unified-chat/src/lib/connector-connect-required.ts` for why
 * an untrusted tool result cannot forge a Connect card.
 */

export {
  CONNECTOR_AUTHORIZATION_REQUIRED_KEY,
  CONNECTOR_OAUTH_START_PATH,
  buildConnectHref,
  readConnectorConnectRequest,
} from '@agiworkforce/unified-chat';
export type {
  ConnectorAuthorizationReason,
  ConnectorConnectRequest,
} from '@agiworkforce/unified-chat';
