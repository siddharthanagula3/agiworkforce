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
