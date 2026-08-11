/**
 * Workflow-safe timing shared by the request reconciler and durable recovery.
 * Keep this module free of Node.js imports: Workflow orchestration evaluates
 * it outside a `use step` boundary.
 */
export const VIDEO_PROVIDER_TASK_ATTACHMENT_GRACE_MS = 12 * 60 * 1_000;
