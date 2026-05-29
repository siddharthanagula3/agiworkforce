/**
 * Artifact Store Tests
 *
 * Tests for the consolidated artifact store via the compatibility re-export.
 * The canonical implementation lives in
 * `features/chat/stores/artifacts-store.ts`; this file tests it through the
 * `shared/stores/artifact-store` shim to ensure the re-export contract holds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useArtifactStore } from './artifact-store';
import type { ArtifactData } from '@features/chat/components/artifacts/ArtifactPreview';

// Mock cloudDb so shareArtifact DB calls do not hang in tests
vi.mock('@shared/lib/cloud-db-client', () => ({
  cloudDb: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('@shared/lib/logger', () => ({
  logger: { warn: vi.fn(), auth: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArtifact(overrides: Partial<ArtifactData> = {}): ArtifactData {
  return {
    id: `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'code',
    title: 'Test Artifact',
    content: 'console.log("hello");',
    language: 'javascript',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Artifact Store (consolidated)', () => {
  beforeEach(() => {
    useArtifactStore.getState().reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('Initial State', () => {
    it('should start with no artifacts', () => {
      const { artifacts, selectedArtifactId, panelOpen } = useArtifactStore.getState();
      expect(artifacts).toHaveLength(0);
      expect(selectedArtifactId).toBeNull();
      expect(panelOpen).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // addArtifactForMessage — message-keyed add
  // -------------------------------------------------------------------------

  describe('addArtifactForMessage', () => {
    it('should add artifact associated with a message', () => {
      const { addArtifactForMessage, getMessageArtifacts } = useArtifactStore.getState();
      const messageId = 'msg-123';
      const artifact = makeArtifact();

      addArtifactForMessage(messageId, artifact);

      const found = getMessageArtifacts(messageId);
      expect(found).toHaveLength(1);
      expect(found[0]!.id).toBe(artifact.id);
    });

    it('should add multiple artifacts to the same message', () => {
      const { addArtifactForMessage, getMessageArtifacts } = useArtifactStore.getState();
      const messageId = 'msg-123';

      addArtifactForMessage(messageId, makeArtifact({ id: 'a1', title: 'First' }));
      addArtifactForMessage(messageId, makeArtifact({ id: 'a2', title: 'Second' }));
      addArtifactForMessage(messageId, makeArtifact({ id: 'a3', title: 'Third' }));

      expect(getMessageArtifacts(messageId)).toHaveLength(3);
    });

    it('should isolate artifacts across different messages', () => {
      const { addArtifactForMessage, getMessageArtifacts } = useArtifactStore.getState();

      addArtifactForMessage('msg-1', makeArtifact({ id: 'x1', title: 'Msg1' }));
      addArtifactForMessage('msg-2', makeArtifact({ id: 'x2', title: 'Msg2' }));

      expect(getMessageArtifacts('msg-1')).toHaveLength(1);
      expect(getMessageArtifacts('msg-2')).toHaveLength(1);
    });

    it('should be idempotent for the same artifact id', () => {
      const { addArtifactForMessage, getMessageArtifacts } = useArtifactStore.getState();
      const artifact = makeArtifact({ id: 'dedup' });

      addArtifactForMessage('msg-1', artifact);
      addArtifactForMessage('msg-1', artifact); // duplicate

      expect(getMessageArtifacts('msg-1')).toHaveLength(1);
    });

    it('should auto-select the first artifact added', () => {
      const { addArtifactForMessage } = useArtifactStore.getState();
      const artifact = makeArtifact({ id: 'first' });

      addArtifactForMessage('msg-1', artifact);

      expect(useArtifactStore.getState().selectedArtifactId).toBe('first');
    });
  });

  // -------------------------------------------------------------------------
  // getMessageArtifacts
  // -------------------------------------------------------------------------

  describe('getMessageArtifacts', () => {
    it('should return empty array for unknown messageId', () => {
      expect(useArtifactStore.getState().getMessageArtifacts('nope')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // upsertArtifact — update-or-insert
  // -------------------------------------------------------------------------

  describe('upsertArtifact', () => {
    it('should update title/content of an existing artifact', () => {
      const { addArtifactForMessage, upsertArtifact, getMessageArtifacts } =
        useArtifactStore.getState();
      const messageId = 'msg-u';
      const artifact = makeArtifact({ id: 'upd' });

      addArtifactForMessage(messageId, artifact);
      upsertArtifact({ ...artifact, messageId, title: 'Updated', language: 'typescript' });

      const found = getMessageArtifacts(messageId);
      expect(found[0]!.title).toBe('Updated');
      expect(found[0]!.language).toBe('typescript');
    });
  });

  // -------------------------------------------------------------------------
  // Version control
  // -------------------------------------------------------------------------

  describe('Version Control', () => {
    it('should add a version to an artifact', () => {
      const { addArtifactForMessage, addVersion, getMessageArtifacts } =
        useArtifactStore.getState();
      const messageId = 'msg-v';
      const artifact = makeArtifact({ id: 'art-v1' });

      addArtifactForMessage(messageId, artifact);
      addVersion(artifact.id, {
        id: 'v1',
        content: 'Version 1 content',
        timestamp: new Date(),
        description: 'Initial version',
      });

      const found = getMessageArtifacts(messageId);
      expect(found[0]!.versions).toHaveLength(1);
      expect(found[0]!.versions![0]!.content).toBe('Version 1 content');
      expect(found[0]!.currentVersion).toBe(0);
    });

    it('should track the latest version index after multiple adds', () => {
      const { addArtifactForMessage, addVersion, getMessageArtifacts } =
        useArtifactStore.getState();
      const messageId = 'msg-vm';
      const artifact = makeArtifact({ id: 'art-vm' });

      addArtifactForMessage(messageId, artifact);
      addVersion(artifact.id, { id: 'va1', content: 'V1', timestamp: new Date() });
      addVersion(artifact.id, { id: 'va2', content: 'V2', timestamp: new Date() });
      addVersion(artifact.id, { id: 'va3', content: 'V3', timestamp: new Date() });

      const found = getMessageArtifacts(messageId);
      expect(found[0]!.versions).toHaveLength(3);
      expect(found[0]!.currentVersion).toBe(2);
    });

    it('should switch current version and update content', () => {
      const { addArtifactForMessage, addVersion, setCurrentVersion, getMessageArtifacts } =
        useArtifactStore.getState();
      const messageId = 'msg-vc';
      const artifact = makeArtifact({ id: 'art-vc' });

      addArtifactForMessage(messageId, artifact);
      addVersion(artifact.id, { id: 'vb0', content: 'Version 0', timestamp: new Date() });
      addVersion(artifact.id, { id: 'vb1', content: 'Version 1', timestamp: new Date() });
      addVersion(artifact.id, { id: 'vb2', content: 'Version 2', timestamp: new Date() });

      setCurrentVersion(artifact.id, 1);

      const found = getMessageArtifacts(messageId);
      expect(found[0]!.currentVersion).toBe(1);
      expect(found[0]!.content).toBe('Version 1');
    });

    it('should not change version for an out-of-range index', () => {
      const { addArtifactForMessage, addVersion, setCurrentVersion, getMessageArtifacts } =
        useArtifactStore.getState();
      const messageId = 'msg-voor';
      const artifact = makeArtifact({ id: 'art-voor' });

      addArtifactForMessage(messageId, artifact);
      addVersion(artifact.id, { id: 'vc0', content: 'Version 0', timestamp: new Date() });

      setCurrentVersion(artifact.id, 999);

      expect(getMessageArtifacts(messageId)[0]!.currentVersion).toBe(0);
    });

    it('should not change version for a negative index', () => {
      const { addArtifactForMessage, addVersion, setCurrentVersion, getMessageArtifacts } =
        useArtifactStore.getState();
      const messageId = 'msg-vneg';
      const artifact = makeArtifact({ id: 'art-vneg' });

      addArtifactForMessage(messageId, artifact);
      addVersion(artifact.id, { id: 'vd0', content: 'Version 0', timestamp: new Date() });

      setCurrentVersion(artifact.id, -1);

      expect(getMessageArtifacts(messageId)[0]!.currentVersion).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Sharing
  // -------------------------------------------------------------------------

  describe('shareArtifact', () => {
    it('should return a share ID string', async () => {
      const { addArtifactForMessage, shareArtifact } = useArtifactStore.getState();
      const artifact = makeArtifact({ id: 'share1' });

      addArtifactForMessage('msg-s1', artifact);
      vi.setSystemTime(new Date('2024-01-01'));

      const shareId = await shareArtifact(artifact.id);

      expect(shareId).toMatch(/^share-/);
    });

    it('should store shareId on the artifact', async () => {
      const { addArtifactForMessage, shareArtifact, getMessageArtifacts } =
        useArtifactStore.getState();
      const artifact = makeArtifact({ id: 'share2' });

      addArtifactForMessage('msg-s2', artifact);
      const shareId = await shareArtifact(artifact.id);

      const found = getMessageArtifacts('msg-s2');
      expect(found[0]!.shareId).toBe(shareId);
    });

    it('should throw when artifact does not exist', async () => {
      const { shareArtifact } = useArtifactStore.getState();

      let error: Error | undefined;
      try {
        await shareArtifact('non-existent');
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeDefined();
      expect(error!.message).toBe('Artifact not found');
    });
  });

  // -------------------------------------------------------------------------
  // Panel selection
  // -------------------------------------------------------------------------

  describe('selectArtifact / panelOpen', () => {
    it('should update selectedArtifactId', () => {
      const { addArtifactForMessage, selectArtifact } = useArtifactStore.getState();
      const a = makeArtifact({ id: 'sel1' });
      const b = makeArtifact({ id: 'sel2' });

      addArtifactForMessage('m', a);
      addArtifactForMessage('m', b);
      selectArtifact('sel2');

      expect(useArtifactStore.getState().selectedArtifactId).toBe('sel2');
    });

    it('should toggle panelOpen', () => {
      const { togglePanel } = useArtifactStore.getState();
      expect(useArtifactStore.getState().panelOpen).toBe(false);
      togglePanel();
      expect(useArtifactStore.getState().panelOpen).toBe(true);
      togglePanel();
      expect(useArtifactStore.getState().panelOpen).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Clear operations
  // -------------------------------------------------------------------------

  describe('clearArtifactsForMessage', () => {
    it('should remove only artifacts for the given messageId', () => {
      const { addArtifactForMessage, clearArtifactsForMessage, getMessageArtifacts } =
        useArtifactStore.getState();

      addArtifactForMessage('msg-c1', makeArtifact({ id: 'c1' }));
      addArtifactForMessage('msg-c2', makeArtifact({ id: 'c2' }));

      clearArtifactsForMessage('msg-c1');

      expect(getMessageArtifacts('msg-c1')).toHaveLength(0);
      expect(getMessageArtifacts('msg-c2')).toHaveLength(1);
    });
  });

  describe('reset', () => {
    it('should clear all artifacts and reset state', async () => {
      const { addArtifactForMessage, reset } = useArtifactStore.getState();

      addArtifactForMessage('msg-r1', makeArtifact({ id: 'r1' }));
      addArtifactForMessage('msg-r2', makeArtifact({ id: 'r2' }));

      reset();

      const state = useArtifactStore.getState();
      expect(state.artifacts).toHaveLength(0);
      expect(state.selectedArtifactId).toBeNull();
      expect(state.panelOpen).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should handle adding a version to an artifact with no versions array', () => {
      const { addArtifactForMessage, addVersion, getMessageArtifacts } =
        useArtifactStore.getState();
      const artifact = makeArtifact({ id: 'edge1' });
      delete (artifact as Partial<ArtifactData>).versions;

      addArtifactForMessage('msg-e', artifact);
      addVersion(artifact.id, { id: 've0', content: 'New version', timestamp: new Date() });

      const found = getMessageArtifacts('msg-e');
      expect(found[0]!.versions).toHaveLength(1);
    });

    it('getMessageArtifacts should return empty array for unknown message', () => {
      expect(useArtifactStore.getState().getMessageArtifacts('unknown')).toEqual([]);
    });
  });
});
