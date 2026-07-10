/**
 * @agiworkforce/services
 *
 * Shared cross-surface service layer for the AGI Workforce platform.
 * Houses canonical business-logic services that surface adapters consume.
 *
 * @packageDocumentation
 */

// Artifact publish service — local export now, BYOK/managed publish gated until
// the managed artifact publishing boundary is proven.
export * from './artifacts';

// Artifact derivation service — the ONE canonical place artifacts are derived
// from message content (deterministic ids; consumed by web/desktop/mobile).
export * from './artifact-derivation';

// Model-switch cache-penalty assessment — pure logic for warning users that
// switching models mid-conversation resets the prompt cache (consumed by all surfaces).
export * from './model-switch-cache';

// Artifact cloud-sync merge — the pure render-overlay + push-selection rules every
// surface applies to reconcile locally-derived artifacts with pulled cloud artifacts.
export * from './artifact-sync';

// Cloud API contracts — the ONE canonical schema per cloud endpoint served by
// apps/web. Clients validate against these instead of hand-declaring shapes.
export * from './cloud-contracts/me';
export * from './cloud-contracts/sync';

// Signed org-policy contract (enterprise Local, design §2.2) — schema + offline
// verifier + monotonic-tightening rule. Root of trust is the org license
// (@agiworkforce/licensing); this is the contract + verifier only, not wired
// into any surface enforcement path yet.
export * from './cloud-contracts/org-policy';

// Delta-sync apply logic — the pure, cross-surface rules for applying pulled
// cloud-sync deltas (conversations/messages/memory/projects/settings/cursor
// math) that used to be hand-duplicated across mobile (TS) and desktop
// (Rust). See sync-apply/index.ts for what's shared vs. surface-owned.
export * from './sync-apply';
