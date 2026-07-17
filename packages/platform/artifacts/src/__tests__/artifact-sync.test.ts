import { describe, it, expect } from 'vitest';
import {
  mergeCloudArtifacts,
  selectArtifactsToPush,
  isDerivedArtifact,
  applyArtifactDeltas,
  wireToCloudArtifact,
  type CloudArtifact,
  type ArtifactWireDelta,
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

describe('applyArtifactDeltas + wireToCloudArtifact', () => {
  const wire = (over: Partial<ArtifactWireDelta> = {}): ArtifactWireDelta => ({
    id: 'a1',
    conversation_id: 'c1',
    message_id: 'm1',
    title: 'T',
    artifact_type: 'code',
    language: 'python',
    content: 'print(1)',
    current_version: 1,
    pinned: false,
    tags: [],
    created_at: '2026-06-21T00:00:00.000Z',
    updated_at: '2026-06-21T00:00:00.000Z',
    deleted_at: null,
    server_version: '10',
    ...over,
  });

  it('maps a wire delta to a CloudArtifact (snake_case → camelCase)', () => {
    const c = wireToCloudArtifact(wire({ message_id: null, language: null }));
    expect(c.conversationId).toBe('c1');
    expect(c.messageId).toBeUndefined();
    expect(c.language).toBeUndefined();
    expect(c.version).toBe(1);
    expect(c.deletedAt).toBeNull();
  });

  it('upserts new + replaces existing by id', () => {
    const out = applyArtifactDeltas(
      [wireToCloudArtifact(wire({ id: 'a1', content: 'old' }))],
      [wire({ id: 'a1', content: 'new', current_version: 2 }), wire({ id: 'a2' })],
    );
    expect(out.find((a) => a.id === 'a1')?.content).toBe('new');
    expect(out.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
  });

  it('retains a tombstone so merging cannot resurrect a locally derived artifact', () => {
    const out = applyArtifactDeltas(
      [wireToCloudArtifact(wire({ id: 'a1' })), wireToCloudArtifact(wire({ id: 'a2' }))],
      [wire({ id: 'a1', deleted_at: '2026-06-21T01:00:00.000Z' })],
    );
    expect(out.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
    expect(out.find((a) => a.id === 'a1')?.deletedAt).toBe('2026-06-21T01:00:00.000Z');
    expect(mergeCloudArtifacts([art({ id: 'a1' })], out)).toEqual([
      expect.objectContaining({ id: 'a2' }),
    ]);
  });
});
