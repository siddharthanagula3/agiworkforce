/**
 * Cloud contracts — the cross-device delta-sync family served by apps/web:
 *
 *   GET/POST /api/chat/sync      (conversations + messages + artifacts)
 *   GET/POST /api/memory/sync    (user_memories)
 *   GET/POST /api/projects/sync  (user_projects)
 *   GET/POST /api/settings/sync  (single cloud-safe settings document)
 *
 * These schemas describe what clients RECEIVE (pull pages and push acks).
 * Push request bodies are validated server-side by each route's own Zod
 * schema — the server stays the enforcement point for writes; these
 * contracts make reads drift-proof.
 *
 * Wire conventions (server contract):
 *   - snake_case field names on pull; camelCase on push bodies.
 *   - `server_version` is a Postgres bigint serialized as a string.
 *   - timestamps are ISO strings (timestamptz through JSON serialization).
 *   - deltas arrive ordered by `server_version asc`; tombstones are included
 *     (`deleted_at` / `is_deleted`) so deletes propagate.
 *
 * Enforcement anchors: apps/web/app/api/{chat,memory,projects,settings}/sync/
 * __tests__/route.contract.test.ts assert live route output parses against
 * these schemas. Mobile's cloudSyncEngine validates every pulled page with
 * them; desktop's Rust sync clients (src-tauri data/cloud_sync.rs,
 * memory_sync.rs) are the remaining follow-up leg (fixture-based serde tests).
 */

import { z } from 'zod';

/** `{ id, server_version }` ack row returned for each applied push item. */
export const AppliedRowSchema = z.object({
  id: z.string(),
  server_version: z.string(),
});
export type AppliedRow = z.infer<typeof AppliedRowSchema>;

// ---------------------------------------------------------------------------
// /api/chat/sync
// ---------------------------------------------------------------------------

export const ConversationWireDeltaSchema = z.object({
  id: z.string(),
  title: z.string(),
  model: z.string().nullable(),
  project_id: z.string().nullable(),
  pinned: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  server_version: z.string(),
});
export type ConversationWireDelta = z.infer<typeof ConversationWireDeltaSchema>;

export const MessageWireDeltaSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  // numeric column — some pg drivers serialize numerics as strings.
  cost_cents: z.union([z.number(), z.string()]),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  server_version: z.string(),
});
export type MessageWireDelta = z.infer<typeof MessageWireDeltaSchema>;

export const ArtifactWireDeltaSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  message_id: z.string().nullable(),
  title: z.string().nullable(),
  artifact_type: z.string(),
  language: z.string().nullable(),
  content: z.string(),
  current_version: z.number(),
  pinned: z.boolean(),
  tags: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  server_version: z.string(),
});
export type ArtifactWireDelta = z.infer<typeof ArtifactWireDeltaSchema>;

export const ChatSyncPullResponseSchema = z.object({
  conversations: z.array(ConversationWireDeltaSchema),
  messages: z.array(MessageWireDeltaSchema),
  artifacts: z.array(ArtifactWireDeltaSchema),
  cursor: z.string(),
  hasMore: z.boolean(),
});
export type ChatSyncPullResponse = z.infer<typeof ChatSyncPullResponseSchema>;

export const ChatSyncPushResponseSchema = z.object({
  applied: z.object({
    conversations: z.array(AppliedRowSchema),
    messages: z.array(AppliedRowSchema),
    artifacts: z.array(AppliedRowSchema),
  }),
  cursor: z.string(),
});
export type ChatSyncPushResponse = z.infer<typeof ChatSyncPushResponseSchema>;

// ---------------------------------------------------------------------------
// /api/memory/sync
// ---------------------------------------------------------------------------

export const MemoryWireDeltaSchema = z.object({
  id: z.string(),
  content: z.string(),
  category: z.string().nullable(),
  /** Free-form on the wire ('mobile' | 'desktop' | 'web' | 'auto' | null today). */
  source: z.string().nullable(),
  pinned: z.boolean(),
  is_deleted: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  server_version: z.string(),
});
export type MemoryWireDelta = z.infer<typeof MemoryWireDeltaSchema>;

export const MemorySyncPullResponseSchema = z.object({
  memories: z.array(MemoryWireDeltaSchema),
  cursor: z.string(),
  hasMore: z.boolean(),
});
export type MemorySyncPullResponse = z.infer<typeof MemorySyncPullResponseSchema>;

export const MemorySyncPushResponseSchema = z.object({
  applied: z.array(AppliedRowSchema),
  cursor: z.string(),
});
export type MemorySyncPushResponse = z.infer<typeof MemorySyncPushResponseSchema>;

// ---------------------------------------------------------------------------
// /api/projects/sync
// ---------------------------------------------------------------------------

export const ProjectWireDeltaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  color: z.string().nullable(),
  is_archived: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  server_version: z.string(),
});
export type ProjectWireDelta = z.infer<typeof ProjectWireDeltaSchema>;

export const ProjectsSyncPullResponseSchema = z.object({
  projects: z.array(ProjectWireDeltaSchema),
  cursor: z.string(),
  hasMore: z.boolean(),
});
export type ProjectsSyncPullResponse = z.infer<typeof ProjectsSyncPullResponseSchema>;

export const ProjectsSyncPushResponseSchema = z.object({
  applied: z.array(AppliedRowSchema),
  cursor: z.string(),
});
export type ProjectsSyncPushResponse = z.infer<typeof ProjectsSyncPushResponseSchema>;

// ---------------------------------------------------------------------------
// /api/settings/sync (single document — no pagination)
// ---------------------------------------------------------------------------

export const SettingsSyncPullResponseSchema = z.object({
  /** Cloud-safe namespaces only — the server allowlist-filters and secret-scrubs. */
  settings: z.record(z.string(), z.unknown()),
  cursor: z.string(),
  hasMore: z.boolean(),
});
export type SettingsSyncPullResponse = z.infer<typeof SettingsSyncPullResponseSchema>;

export const SettingsSyncPushResponseSchema = z.object({
  /** true = merged; false = stale (server LWW skipped this push). */
  applied: z.boolean(),
  cursor: z.string(),
});
export type SettingsSyncPushResponse = z.infer<typeof SettingsSyncPushResponseSchema>;
