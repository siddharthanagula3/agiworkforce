import { describe, expect, it } from 'vitest';
import {
  describeWorkspaceInterruptions,
  EMPTY_WORKSPACE_WORK,
  WORKSPACE_INTERRUPTION_KINDS,
  type WorkspaceInterruptionKind,
  type WorkspaceWorkSnapshot,
} from './workspace-switch-interruptions';

// Built at run time: a literal long dash in source fails the copy guard.
const LONG_DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);

const TRIGGERS: Record<WorkspaceInterruptionKind, Partial<WorkspaceWorkSnapshot>> = {
  draft: { unsentDraftCount: 1 },
  upload: { activeUploadCount: 1 },
  reply: { replyInFlight: true },
  voice: { voiceSessionLive: true },
  'computer-control': { computerControlRunning: true },
  approval: { pendingApprovalCount: 1 },
  artifact: { artifactUnsaved: true },
};

describe('describeWorkspaceInterruptions', () => {
  it('says nothing when no work would be lost', () => {
    expect(describeWorkspaceInterruptions(EMPTY_WORKSPACE_WORK)).toEqual([]);
  });

  it.each(WORKSPACE_INTERRUPTION_KINDS)('names the work a %s interrupts', (kind) => {
    const found = describeWorkspaceInterruptions({ ...EMPTY_WORKSPACE_WORK, ...TRIGGERS[kind] });

    expect(found.map((interruption) => interruption.kind)).toEqual([kind]);
    expect(found[0]?.description).toMatch(/\S/);
    expect(found[0]?.description).not.toMatch(LONG_DASHES);
  });

  it('keeps every kind reachable so none can be added without its own sentence', () => {
    const reachable = WORKSPACE_INTERRUPTION_KINDS.flatMap((kind) =>
      describeWorkspaceInterruptions({ ...EMPTY_WORKSPACE_WORK, ...TRIGGERS[kind] }).map(
        (interruption) => interruption.kind,
      ),
    );

    expect(new Set(reachable)).toEqual(new Set(WORKSPACE_INTERRUPTION_KINDS));
  });

  it('counts plural work rather than reporting one of each', () => {
    const found = describeWorkspaceInterruptions({
      ...EMPTY_WORKSPACE_WORK,
      unsentDraftCount: 3,
      activeUploadCount: 2,
      pendingApprovalCount: 4,
    });

    expect(found.map((interruption) => interruption.description)).toEqual([
      'You have 3 unsent messages.',
      '2 files are still uploading.',
      '4 tools are waiting for your approval.',
    ]);
  });

  it('lists every concurrent interruption, not only the first', () => {
    const found = describeWorkspaceInterruptions({
      unsentDraftCount: 1,
      activeUploadCount: 1,
      replyInFlight: true,
      voiceSessionLive: true,
      computerControlRunning: true,
      pendingApprovalCount: 1,
      artifactUnsaved: true,
    });

    expect(found).toHaveLength(WORKSPACE_INTERRUPTION_KINDS.length);
  });
});
