/**
 * Honest interim copy for desktop managed cloud (PA-3 / DESK-CLOUD-COPY-01).
 *
 * Managed cloud is PUBLIC ALPHA on Web & Mobile. Desktop managed-cloud
 * persistence is NOT implemented yet: the Rust cloud commands in
 * `src-tauri/src/sys/commands/chat/cloud.rs` fail closed with
 * `ERR_CLOUD_NOT_IMPLEMENTED`, and the shared-backend wiring lands in a
 * fast-follow (runbook DCL-1..4). Until then:
 *
 *   - The desktop runtime must NEVER enter Cloud mode (otherwise
 *     `chatStore.isCloudMode()` routes chat persistence into the unimplemented
 *     command).
 *   - All desktop managed-cloud copy must be the honest interim below — never
 *     "available on desktop", and never invite / waitlist / private-beta
 *     framing (the product is public alpha, not invite-gated).
 *
 * Local + BYOK both live in Local mode on desktop and are unaffected.
 */
export const DESKTOP_CLOUD_COMING_SOON =
  'AGI Cloud is available on Web & Mobile — desktop support is coming soon.';

/** Short label for compact UI (toggle pill titles, badges, buttons). */
export const DESKTOP_CLOUD_COMING_SOON_SHORT = 'Cloud coming soon to desktop';
