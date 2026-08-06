'use client';

/**
 * Web re-export of the shared inline Connect card (lazy authentication).
 *
 * The card renders in two places that must look and behave identically — web's
 * `ToolTimeline` and the shared `AgentActivityTimeline` (also rendered by
 * Desktop and Mobile) — so the component lives in `@agiworkforce/unified-chat`.
 * This module keeps `@/features/chat/components/ConnectorConnectCard` working
 * as the web import site and marks it a client component.
 */

export { ConnectorConnectCard } from '@agiworkforce/unified-chat';
export type { ConnectorConnectCardProps } from '@agiworkforce/unified-chat';
