export type MobileArtifactKind = 'document' | 'code' | 'chart' | 'research';

export interface MobileArtifact {
  id: string;
  title: string;
  kind: MobileArtifactKind;
  content: string;
  ageLabel: string;
  sourceLabel: string;
  accentColor: string;
  previewLines: string[];
}
