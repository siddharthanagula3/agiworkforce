/**
 * src/features — chat, models, sync, auth, billing, artifacts, marketing, settings
 *
 * Layer: features
 * Depends on: core, platform, integrations, data, ui
 * Must NOT be imported by: entry, core
 *
 * Each feature is a self-contained slice with its own components, hooks, stores,
 * services, and schemas. Features expose a public API via their own index.ts barrel.
 *
 * Feature index (normalized):
 *   analytics/   — token/usage analytics UI (PILOT - migrated 2026-05-18)
 *   billing/     — billing flows (pending migration)
 *   chat/        — core chat experience (pending migration)
 *   connectors/  — third-party connector management (pending migration)
 *   media/       — media generation (pending migration)
 *   pages/       — marketing page components (pending migration)
 *   projects/    — project management (pending migration)
 *   schedules/   — scheduled tasks (pending migration)
 *   settings/    — user/app settings (pending migration)
 *   support/     — support flows (pending migration)
 *   teams/       — team management (pending migration)
 */

export {};
