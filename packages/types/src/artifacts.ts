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

import type { ArtifactType } from './conversation';

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
export interface SharedArtifact {
  /** Unique artifact identifier. */
  id: string;

  /** Artifact category. */
  type: SharedArtifactType;

  /** Human-readable title. */
  title: string;

  /** The artifact content (source code, markdown, SVG, JSON, etc.). */
  content: string;

  /** Programming language identifier (for `code` type). */
  language?: string;

  /**
   * Version number (1-based, monotonically increasing).
   * Each edit creates a new version; surfaces may show a version history.
   */
  version: number;

  /** ISO 8601 creation timestamp. */
  createdAt: string;

  /** ISO 8601 timestamp of the last update. */
  updatedAt?: string;

  /** Conversation that produced this artifact. */
  conversationId?: string;

  /** Message that produced this artifact. */
  messageId?: string;

  /** Extensible metadata (e.g., dimensions for images, row count for data). */
  metadata?: Record<string, unknown>;
}
