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
  // addArtifactForMessage · message-keyed add
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
  // upsertArtifact · update-or-insert
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
  // AUDIT-FIX ART-21: the "Version Control" and "shareArtifact" suites were
  // deleted together with the API they covered.
  //
  //   - addVersion / setCurrentVersion drove a web-only `versions[]` side-map
  //     with revert-by-index semantics. No non-test caller ever wrote to it,
  //     so no user could ever produce one of these versions. Real edit history
  //     is the shared engine's content-keyed `versionsById`, read through
  //     getArtifactVersions (and now persisted across reloads — see ART-19).
  //   - shareArtifact minted a `share-<timestamp>-<random>` id client-side and
  //     POSTed it to /api/artifacts/publish. It also had no non-test callers.
  //     The canonical publish boundary is @agiworkforce/artifacts
  //     `publishArtifact` (covered by that package's own tests), which as of
  //     ART-27 returns a real cloud result or an honest "unavailable" — not a
  //     waitlist gate.
  // -------------------------------------------------------------------------
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
    it('getMessageArtifacts should return empty array for unknown message', () => {
      expect(useArtifactStore.getState().getMessageArtifacts('unknown')).toEqual([]);
    });
  });
});
