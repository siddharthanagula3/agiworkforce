/**
 * src/integrations — supabase, stripe, providers, mcp, vercel, posthog, sentry
 *
 * Layer: integrations
 * Depends on: data
 * Must NOT be imported by: data, ui
 *
 * This barrel will re-export third-party integration clients as they are migrated
 * from apps/web/lib/ (supabase.ts, stripe-config.ts, mcp-client.ts, etc.)
 * and apps/web/services/.
 *
 * External service clients ONLY. No business logic.
 */

export {};
