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

export type SharedArtifactType = ArtifactType | 'data';

export interface SharedArtifact extends Omit<ArtifactBase, 'type'> {
  type: SharedArtifactType;
  title: string;

  version: number;

  createdAt: string;

  updatedAt?: string;
}
