
export {
  useArtifactsStore as useArtifactStore,
  type Artifact,
} from '@features/chat/stores/artifacts-store';

// `ArtifactVersion` was re-exported here too. It described the synthesised
export type { ArtifactData } from '@features/chat/components/artifacts/ArtifactPreview';

import type { useArtifactsStore } from '@features/chat/stores/artifacts-store';
export type ArtifactState = ReturnType<typeof useArtifactsStore.getState>;
