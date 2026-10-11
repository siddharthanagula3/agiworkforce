import { describe, expect, it } from 'vitest';

import { artifactLineage, buildVersionTimeline } from './artifact-lineage';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 11, 12, minute));

describe('artifactLineage', () => {
  const first = { id: 'a1', type: 'html', title: 'Desk Calculator', createdAt: at(1) };
  const edited = { id: 'a2', type: 'html', title: 'desk calculator ', createdAt: at(5) };
  const other = { id: 'b1', type: 'html', title: 'Timer', createdAt: at(3) };
  const sameTitleOtherKind = { id: 'c1', type: 'svg', title: 'Desk Calculator', createdAt: at(4) };

  it('groups the same kind under the same title, oldest first', () => {
    expect(
      artifactLineage([edited, other, first, sameTitleOtherKind], edited).map((a) => a.id),
    ).toEqual(['a1', 'a2']);
  });

  it('never groups untitled artifacts', () => {
    const untitled = { id: 'u1', type: 'html', title: 'Untitled', createdAt: at(1) };
    const another = { id: 'u2', type: 'html', title: 'Untitled', createdAt: at(2) };
    expect(artifactLineage([untitled, another], another).map((a) => a.id)).toEqual(['u2']);
  });
});

describe('buildVersionTimeline', () => {
  const members = [
    { id: 'a1', versionCount: 2 },
    { id: 'a2', versionCount: 1 },
  ];

  it('counts every stored version across the lineage', () => {
    expect(buildVersionTimeline(members, 'a2', 0)).toMatchObject({ position: 3, total: 3 });
    expect(buildVersionTimeline(members, 'a1', 0)).toMatchObject({ position: 1, total: 3 });
  });

  it('steps back from an artifact to the previous one at its latest version', () => {
    expect(buildVersionTimeline(members, 'a2', 0).previous).toEqual({
      artifactId: 'a1',
      versionIndex: null,
    });
    expect(buildVersionTimeline(members, 'a1', 1).previous).toEqual({
      artifactId: 'a1',
      versionIndex: 0,
    });
  });

  it('steps forward into the next artifact at its first version', () => {
    expect(buildVersionTimeline(members, 'a1', 1).next).toEqual({
      artifactId: 'a2',
      versionIndex: null,
    });
    expect(buildVersionTimeline(members, 'a1', 0).next).toEqual({
      artifactId: 'a1',
      versionIndex: null,
    });
    expect(
      buildVersionTimeline(
        [
          { id: 'a1', versionCount: 1 },
          { id: 'a2', versionCount: 3 },
        ],
        'a1',
        0,
      ).next,
    ).toEqual({ artifactId: 'a2', versionIndex: 0 });
  });

  it('has nowhere to go at either end of a single artifact', () => {
    expect(buildVersionTimeline([{ id: 'a1', versionCount: 1 }], 'a1', 0)).toEqual({
      position: 1,
      total: 1,
      previous: null,
      next: null,
    });
  });
});
