/**
 * Command capability types for runtime-aware dispatch.
 *
 * Used by @agiworkforce/runtime to determine which commands can run
 * in cloud (web) mode vs requiring the desktop app.
 */

/** Runtime tier classification for Tauri commands. */
export type RuntimeTier =
  | 'cloud' // Can run via API gateway (chat, models, settings, billing)
  | 'desktop-only' // Requires native desktop (file system, terminal, browser automation)
  | 'desktop-preferred'; // Has cloud fallback but works better on desktop (MCP, research, email)

/** Resolved capability information for a single command. */
export interface CommandCapability {
  /** Which runtime tier this command belongs to. */
  tier: RuntimeTier;
  /** Human-readable feature group for UI display (e.g., "Chat", "Browser Automation"). */
  featureGroup: string;
  /** The command name this capability was resolved for. */
  commandName: string;
}

/** Feature availability summary for LLM context injection. */
export interface RuntimeFeatureContext {
  /** Features available in the current runtime. */
  available: string[];
  /** Features that require the desktop app. */
  unavailable: string[];
  /** The current runtime environment. */
  runtime: 'tauri' | 'cloud-web' | 'test';
}
