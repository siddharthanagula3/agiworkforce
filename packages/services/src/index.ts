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
