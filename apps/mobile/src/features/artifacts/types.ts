export type MobileArtifactKind = 'document' | 'code' | 'chart' | 'research';

export interface MobileArtifact {
  id: string;
  title: string;
  kind: MobileArtifactKind;
  /** Optional finer-grained language label, e.g. "HTML", "Python". Falls back to kind. */
  language?: string;
  content: string;
  ageLabel: string;
  sourceLabel: string;
  accentColor: string;
  previewLines: string[];
}
