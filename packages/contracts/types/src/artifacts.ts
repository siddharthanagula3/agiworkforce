/**
 * Shared Artifact Contracts
 *
 * Platform-agnostic interfaces for artifacts generated during AI conversations.
 * Artifacts are structured outputs (code, documents, images, data) that can be
 * versioned, displayed, and exported across all surfaces.
 *
 * @module artifacts
 * @packageDocumentation
 */

import type { ArtifactBase, ArtifactType } from './conversation';

// ============================================================================
// Artifact Types
// ============================================================================

/**
 * Category of artifact content.
 *
 * Superset of the desktop `ArtifactType` — includes the core types that
 * all surfaces must support plus extended types that surfaces may ignore.
 */
export type SharedArtifactType = ArtifactType | 'data';

/**
 * Cross-surface artifact contract.
 *
 * An artifact is a discrete, addressable output produced by the AI during
 * a conversation. Desktop renders these in the canvas panel; web and mobile
 * display them inline or in a dedicated viewer.
 */
export interface SharedArtifact extends Omit<ArtifactBase, 'type'> {
  type: SharedArtifactType;
  title: string;

  /**
   * Version number (1-based, monotonically increasing).
   * Each edit creates a new version; surfaces may show a version history.
   */
  version: number;

  /** ISO 8601 creation timestamp. */
  createdAt: string;

  /** ISO 8601 timestamp of the last update. */
  updatedAt?: string;
}
