export type MobileArtifactKind = 'document' | 'code' | 'chart' | 'research' | 'image';

export type MobileArtifactProvenance = { scope: 'local' } | { scope: 'cloud'; ownerId: string };

export interface MobileArtifact {
  id: string;
  messageId?: string;
  title: string;
  kind: MobileArtifactKind;
  language?: string;
  content: string;
  ageLabel: string;
  sourceLabel: string;
  accentColor: string;
  previewLines: string[];
  provenance?: MobileArtifactProvenance;
}

export type ScopedMobileArtifact = MobileArtifact & {
  provenance: MobileArtifactProvenance;
};
