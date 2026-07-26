export type MobileArtifactKind = 'document' | 'code' | 'chart' | 'research' | 'image';

/**
 * Trust-boundary provenance for artifacts persisted on this device.
 *
 * `ownerId` is the Clerk user id captured when a Managed Cloud turn starts.
 * It is deliberately absent for Local artifacts: Local data is device-owned
 * and must survive Cloud sign-out and account switching.
 */
export type MobileArtifactProvenance = { scope: 'local' } | { scope: 'cloud'; ownerId: string };

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
  /**
   * Optional only so persisted records written by older app versions can be
   * decoded and discarded safely. Every new artifact writer must provide it.
   */
  provenance?: MobileArtifactProvenance;
}

/** A newly-created artifact that is safe to persist. */
export type ScopedMobileArtifact = MobileArtifact & {
  provenance: MobileArtifactProvenance;
};
