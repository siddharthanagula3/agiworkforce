/**
 * Centralized timeout and retry constants for the desktop application.
 * This file consolidates all magic numbers related to timeouts, delays, and retries
 * to improve maintainability and consistency across the codebase.
 */

// =============================================================================
// API Request Timeouts
// =============================================================================

/** Default timeout for general API requests (30 seconds) */
export const DEFAULT_API_TIMEOUT_MS = 30_000;

/** Timeout for device linking poll operations - longer due to user interaction (60 seconds) */
export const DEVICE_LINK_POLL_TIMEOUT_MS = 60_000;

/** Timeout for Supabase auth session check (5 seconds) */
export const SESSION_CHECK_TIMEOUT_MS = 5_000;

/** Timeout for auth sign-in operations (30 seconds) */
export const AUTH_SIGN_IN_TIMEOUT_MS = 30_000;

/** Timeout for auth sign-out operations (2 seconds) */
export const AUTH_SIGN_OUT_TIMEOUT_MS = 2_000;

/** Timeout for setSession operations (10 seconds) */
export const SET_SESSION_TIMEOUT_MS = 10_000;

/** Timeout for profile fetch operations (15 seconds) */
export const PROFILE_FETCH_TIMEOUT_MS = 15_000;

/** Timeout for subscription fetch operations (30 seconds) */
export const SUBSCRIPTION_FETCH_TIMEOUT_MS = 30_000;

/** Timeout for feature flags fetch operations (15 seconds) */
export const FEATURE_FLAGS_FETCH_TIMEOUT_MS = 15_000;

/** Timeout for database warm-up operations (30 seconds) */
export const DATABASE_WARMUP_TIMEOUT_MS = 30_000;

/** Timeout for web API fallback requests (30 seconds) */
export const WEB_API_FALLBACK_TIMEOUT_MS = 30_000;

// =============================================================================
// Automation Timeouts
// =============================================================================

/** Default timeout for automation operations (30 seconds) */
export const AUTOMATION_TIMEOUT_MS = 30_000;

/** Timeout for automation execution operations (2 minutes) */
export const AUTOMATION_EXECUTE_TIMEOUT_MS = 120_000;

/** Timeout for browser automation navigation (30 seconds) */
export const BROWSER_AUTOMATION_TIMEOUT_MS = 30_000;

// =============================================================================
// MCP (Model Context Protocol) Timeouts
// =============================================================================

/** Default timeout for MCP operations (30 seconds) */
export const MCP_TIMEOUT_MS = 30_000;

/** Timeout for MCP tool call operations (2 minutes) */
export const MCP_TOOL_CALL_TIMEOUT_MS = 120_000;

/** Timeout for MCP initialization (1 minute) */
export const MCP_INIT_TIMEOUT_MS = 60_000;

/** Timeout for MCP OAuth operations (1 minute) */
export const MCP_OAUTH_TIMEOUT_MS = 60_000;

// =============================================================================
// Completion Provider Timeouts
// =============================================================================

/** Timeout for completion provider operations (500ms) */
export const COMPLETION_TIMEOUT_MS = 500;

// =============================================================================
// Embedding Timeouts
// =============================================================================

/** Default timeout for embedding operations (30 seconds) */
export const EMBEDDINGS_TIMEOUT_MS = 30_000;

/** Timeout for embedding generation operations (2 minutes) */
export const EMBEDDINGS_GENERATE_TIMEOUT_MS = 120_000;

/** Timeout for embedding index operations (10 minutes) */
export const EMBEDDINGS_INDEX_TIMEOUT_MS = 600_000;

// =============================================================================
// Ollama Timeouts
// =============================================================================

/** Default timeout for Ollama operations (10 seconds) */
export const OLLAMA_TIMEOUT_MS = 10_000;

/** Timeout for Ollama model pull operations (1 minute) */
export const OLLAMA_PULL_TIMEOUT_MS = 60_000;

// =============================================================================
// Privacy/Data Export Timeouts
// =============================================================================

/** Default timeout for privacy operations (30 seconds) */
export const PRIVACY_TIMEOUT_MS = 30_000;

/** Timeout for data export operations (1 minute) */
export const EXPORT_TIMEOUT_MS = 60_000;

/** Timeout for account deletion operations (1 minute) */
export const DELETE_TIMEOUT_MS = 60_000;

// =============================================================================
// Migration Timeouts
// =============================================================================

/** Default timeout for migration operations (1 minute) */
export const MIGRATION_TIMEOUT_MS = 60_000;

/** Timeout for migration launch operations (5 minutes) */
export const MIGRATION_LAUNCH_TIMEOUT_MS = 300_000;

// =============================================================================
// Streaming/Execution Timeouts
// =============================================================================

/** Timeout for stuck streams (1 minute) */
export const STREAM_TIMEOUT_MS = 60_000;

/** Timeout for invoke operations in agentic events (10 seconds) */
export const INVOKE_TIMEOUT_MS = 10_000;

/** Default timeout for IPC operations (30 seconds) */
export const IPC_TIMEOUT_MS = 30_000;

// =============================================================================
// UI Feedback Delays
// =============================================================================

/** Duration to show success/copied feedback (2 seconds) */
export const UI_FEEDBACK_DURATION_MS = 2_000;

/** Duration to show success feedback for longer operations (3 seconds) */
export const UI_FEEDBACK_LONG_DURATION_MS = 3_000;

/** Duration to show export success/error messages (5 seconds) */
export const EXPORT_FEEDBACK_DURATION_MS = 5_000;

/** Duration to show error messages before auto-clearing (4 seconds) */
export const ERROR_AUTO_CLEAR_DURATION_MS = 4_000;

/** Delay before revoking blob Object URLs after triggering download (60 seconds) */
export const URL_REVOKE_DELAY_MS = 60_000;

/** Debounce delay for subscription change handlers (2 seconds) */
export const SUBSCRIPTION_CHANGE_DEBOUNCE_MS = 2_000;

/** Resend cooldown for auth codes (1 second countdown tick) */
export const AUTH_RESEND_TICK_MS = 1_000;

/** Session timer update interval (1 second) */
export const SESSION_TIMER_INTERVAL_MS = 1_000;

// =============================================================================
// Retry Configuration
// =============================================================================

/** Maximum number of retry attempts for general operations */
export const DEFAULT_MAX_RETRIES = 3;

/** Maximum consecutive failures before circuit breaker activates */
export const CIRCUIT_BREAKER_MAX_FAILURES = 5;

/** Cooldown period for circuit breaker (1 minute) */
export const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;

/** Base delay for exponential backoff (100ms) */
export const EXPONENTIAL_BACKOFF_BASE_MS = 100;

// =============================================================================
// Cache Configuration
// =============================================================================

/** Maximum age for auth cache entries (2 hours) */
export const AUTH_CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

// =============================================================================
// AGI Reasoning Configuration
// =============================================================================

/** Default timeout for approval modal (2 minutes) */
export const APPROVAL_MODAL_TIMEOUT_SECONDS = 120;

// =============================================================================
// File Upload Configuration
// =============================================================================

/** Delay between upload retries (500ms) */
export const UPLOAD_RETRY_DELAY_MS = 500;

/** Delay for feedback dialog simulation (500ms) */
export const FEEDBACK_DIALOG_DELAY_MS = 500;

/** Delay for chat message retry (500ms) */
export const CHAT_RETRY_DELAY_MS = 500;

/** Delay for mission control refresh (500ms) */
export const MISSION_CONTROL_REFRESH_DELAY_MS = 500;
