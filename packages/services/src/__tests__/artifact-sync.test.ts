import { describe, it, expect } from 'vitest';
import {
  mergeCloudArtifacts,
  selectArtifactsToPush,
  isDerivedArtifact,
  type CloudArtifact,
} from '../artifact-sync';
import type { SharedArtifact } from '@agiworkforce/types';

function art(over: Partial<SharedArtifact> = {}): SharedArtifact {
  return {
    id: 'a1',
    type: 'code',
    title: 'x',
    content: 'print(1)',
    version: 1,
    createdAt: '2026-06-21T00:00:00.000Z',
    conversationId: 'c1',
    messageId: 'm1',
    metadata: { derived: true },
    ...over,
  };
}

describe('mergeCloudArtifacts', () => {
  it('cloud wins over a local derived artifact with the same id', () => {
    const local = [art({ id: 'a1', content: 'derived' })];
    const cloud: CloudArtifact[] = [art({ id: 'a1', content: 'edited', version: 2 })];
    const merged = mergeCloudArtifacts(local, cloud);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.content).toBe('edited');
    expect(merged[0]!.version).toBe(2);
  });

  it('keeps local artifacts that have no cloud counterpart', () => {
    const local = [art({ id: 'a1' }), art({ id: 'a2' })];
    const merged = mergeCloudArtifacts(local, []);
    expect(merged.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
  });

  it('adds cloud-only artifacts (desktop-authored, no local copy)', () => {
    const cloud: CloudArtifact[] = [art({ id: 'cloud-only', content: 'desktop' })];
    const merged = mergeCloudArtifacts([], cloud);
    expect(merged.map((a) => a.id)).toEqual(['cloud-only']);
  });

  it('a cloud tombstone removes the artifact even if a local derived copy exists', () => {
    const local = [art({ id: 'a1' }), art({ id: 'a2' })];
    const cloud: CloudArtifact[] = [
      { ...art({ id: 'a1' }), deletedAt: '2026-06-21T01:00:00.000Z' },
    ];
    const merged = mergeCloudArtifacts(local, cloud);
    expect(merged.map((a) => a.id)).toEqual(['a2']);
  });

  it('strips the deletedAt field from the merged (non-tombstoned) cloud artifact', () => {
    const cloud: CloudArtifact[] = [{ ...art({ id: 'a1' }), deletedAt: null }];
    const merged = mergeCloudArtifacts([], cloud);
    expect('deletedAt' in (merged[0] as object)).toBe(false);
  });
});

describe('selectArtifactsToPush', () => {
  it('pushes only non-derived (edited / first-class) artifacts', () => {
    const items = [
      art({ id: 'derived', metadata: { derived: true } }),
      art({ id: 'edited', metadata: { derived: false } }),
      art({ id: 'authored', metadata: {} }),
    ];
    expect(
      selectArtifactsToPush(items)
        .map((a) => a.id)
        .sort(),
    ).toEqual(['authored', 'edited']);
  });

  it('never pushes derived artifacts (re-derivable everywhere)', () => {
    const items = [art({ id: 'd1' }), art({ id: 'd2' })]; // both metadata.derived = true
    expect(selectArtifactsToPush(items)).toEqual([]);
  });
});

describe('isDerivedArtifact', () => {
  it('reads metadata.derived', () => {
    expect(isDerivedArtifact(art({ metadata: { derived: true } }))).toBe(true);
    expect(isDerivedArtifact(art({ metadata: { derived: false } }))).toBe(false);
    expect(isDerivedArtifact(art({ metadata: {} }))).toBe(false);
  });
});
