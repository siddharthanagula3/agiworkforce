/**
 * Artifact Store — compatibility re-export.
 *
 * The canonical artifact store is `@features/chat/stores/artifacts-store`.
 * This module re-exports the store under the name previously used here so
 * that existing imports (authentication-store, shared/stores/index, etc.)
 * continue to work without changes.
 *
 * NOTE: The singular `useArtifactStore` name is aliased to the canonical
 * plural `useArtifactsStore`. Both names now point to the same store instance.
 */

export {
  useArtifactsStore as useArtifactStore,
  type Artifact,
} from '@features/chat/stores/artifacts-store';

export type {
  ArtifactData,
  ArtifactVersion,
} from '@features/chat/components/artifacts/ArtifactPreview';

import type { useArtifactsStore } from '@features/chat/stores/artifacts-store';
/** ArtifactState — compatibility alias for callers that imported this type. */
export type ArtifactState = ReturnType<typeof useArtifactsStore.getState>;
