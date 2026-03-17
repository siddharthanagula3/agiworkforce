/**
 * Route parameter types for Expo Router typed routes.
 *
 * The app uses file-based routing (Expo Router) with the following structure:
 *
 * (auth)/
 *   login          -- Sign in / sign up
 *
 * (app)/
 *   (tabs)/
 *     index        -- Home dashboard (agents, conversations, quick actions)
 *     chat         -- Chat list + new chat input
 *     agents       -- Agent grid with live status
 *     settings     -- Full settings screen
 *   chat/[id]      -- Individual chat conversation
 *   agents/[id]    -- Agent detail view
 *   companion/     -- QR pairing + desktop companion
 *   profile/       -- User profile + subscription + stats
 *   schedules/     -- Schedule list + create
 *   settings/memory -- Memory management
 *   messaging/     -- External messaging integrations
 *
 * onboarding       -- First-launch onboarding slides
 */

// ---------------------------------------------------------------------------
// Route params
// ---------------------------------------------------------------------------

/** Params for chat conversation screen: /(app)/chat/[id] */
export interface ChatRouteParams {
  id: string;
}

/** Params for agent detail screen: /(app)/agents/[id] */
export interface AgentDetailRouteParams {
  agentId: string;
}

/** Params for companion screen when opened via deep link */
export interface CompanionRouteParams {
  pairingCode?: string;
}

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------

/** Tab route names within (tabs) layout */
export type TabRouteName = 'index' | 'chat' | 'agents' | 'settings';

// ---------------------------------------------------------------------------
// Type map for typed navigation
// ---------------------------------------------------------------------------

/**
 * Complete route param map. Used for type-safe navigation with
 * Expo Router's typed routes feature (experiments.typedRoutes in app.json).
 */
export interface AppRouteParams {
  '/(auth)/login': undefined;
  '/(app)': undefined;
  '/(app)/(tabs)': undefined;
  '/(app)/(tabs)/index': undefined;
  '/(app)/(tabs)/chat': undefined;
  '/(app)/(tabs)/agents': undefined;
  '/(app)/(tabs)/settings': undefined;
  '/(app)/chat/[id]': ChatRouteParams;
  '/(app)/agents/[id]': AgentDetailRouteParams;
  '/(app)/companion': CompanionRouteParams | undefined;
  '/(app)/profile': undefined;
  '/(app)/schedules': undefined;
  '/(app)/schedules/create': undefined;
  '/(app)/settings/memory': undefined;
  '/(app)/messaging': undefined;
  '/onboarding': undefined;
}
