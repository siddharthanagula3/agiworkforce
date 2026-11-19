import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXPLICIT_ARTIFACT_DERIVATION_POLICY,
  computeDerivedArtifactId,
} from '@agiworkforce/artifacts';
import type { ArtifactWireDelta } from '@agiworkforce/cloud-contracts';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore } from './artifacts-store';

const CONVERSATION_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
const MESSAGE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const PAGE = '<!DOCTYPE html><html><body><h1>Tool</h1></body></html>';
const EDITED = '<!DOCTYPE html><html><body><h1>Tool, edited</h1></body></html>';
const UNPUSHED = '<!DOCTYPE html><html><body><h1>Tool, edited here</h1></body></html>';

const NESTED_WITHOUT_LONGER_FENCE = [
  'README:',
  '```markdown',
  '# Tool',
  '```bash',
  'npm i tool',
  '```',
  '```',
  '',
  'Page:',
  '```html',
  PAGE,
  '```',
].join('\n');

const idAt = (ordinal: number) => computeDerivedArtifactId(CONVERSATION_ID, MESSAGE_ID, ordinal);
const PREVIOUS_ID = idAt(2);
const CURRENT_ID = idAt(1);

function loadMessage(content: string, metadata?: Record<string, unknown>): void {
  useChatStore.setState({
    conversations: [{ id: CONVERSATION_ID }],
    messagesByConversation: {
      [CONVERSATION_ID]: [{ id: MESSAGE_ID, role: 'assistant', content, metadata }],
    },
  } as never);
}

function saveUnderPreviousId(edited = EDITED): void {
  const store = useArtifactsStore.getState();
  const saved = {
    id: PREVIOUS_ID,
    type: 'html' as const,
    title: 'Tool',
    language: 'html',
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
  };
  store.upsertArtifact({ ...saved, content: PAGE });
  store.upsertArtifact({ ...saved, content: edited });
  store.selectArtifact(PREVIOUS_ID);
}

function derivedPage(content = `Page:\n\`\`\`html\n${PAGE}`) {
  return { id: CURRENT_ID, type: 'html' as const, title: 'Tool', language: 'text', content };
}

function cloudRow(overrides: Partial<ArtifactWireDelta> = {}): ArtifactWireDelta {
  return {
    id: PREVIOUS_ID,
    conversation_id: CONVERSATION_ID,
    message_id: MESSAGE_ID,
    title: 'Tool',
    artifact_type: 'html',
    language: 'html',
    content: EDITED,
    current_version: 2,
    pinned: false,
    tags: [],
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-02T00:00:00.000Z',
    deleted_at: null,
    server_version: '41',
    ...overrides,
  };
}

describe('artifacts saved under the previous fence parser', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
    loadMessage(NESTED_WITHOUT_LONGER_FENCE);
  });

  afterEach(() => {
    useChatStore.setState({ conversations: [], messagesByConversation: {} });
    useArtifactsStore.getState().clearArtifacts();
  });

  it('keeps an edited artifact, its versions and the selection under the new id', () => {
    saveUnderPreviousId();

    useArtifactsStore.getState().addArtifactForMessage(MESSAGE_ID, derivedPage(), CONVERSATION_ID);

    const state = useArtifactsStore.getState();
    expect(state.getMessageArtifacts(MESSAGE_ID)).toEqual([
      expect.objectContaining({ id: CURRENT_ID, content: EDITED }),
    ]);
    expect(state.getArtifactVersions(CURRENT_ID).map((version) => version.content)).toEqual([
      PAGE,
      EDITED,
    ]);
    expect(state.getArtifactVersions(PREVIOUS_ID)).toEqual([]);
    expect(state.selectedArtifactId).toBe(CURRENT_ID);
  });

  it('takes a synced copy saved under the previous id on a device that holds nothing', () => {
    useArtifactsStore.getState().applyCloudArtifactDeltas([cloudRow()]);

    useArtifactsStore.getState().addArtifactForMessage(MESSAGE_ID, derivedPage(), CONVERSATION_ID);

    expect(useArtifactsStore.getState().getMessageArtifacts(MESSAGE_ID)).toEqual([
      expect.objectContaining({ id: CURRENT_ID, content: EDITED }),
    ]);
  });

  it('hides the synced copy under the previous id once the new id holds what it says', () => {
    saveUnderPreviousId();
    useArtifactsStore.getState().addArtifactForMessage(MESSAGE_ID, derivedPage(), CONVERSATION_ID);

    useArtifactsStore.getState().applyCloudArtifactDeltas([cloudRow()]);

    expect(
      useArtifactsStore
        .getState()
        .getMessageArtifacts(MESSAGE_ID)
        .map((artifact) => artifact.id),
    ).toEqual([CURRENT_ID]);
  });

  it('after a reload, hides the synced copy once the message loads', () => {
    useChatStore.setState({ conversations: [], messagesByConversation: {} });
    useArtifactsStore.getState().upsertArtifact({
      ...derivedPage(EDITED),
      language: 'html',
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
    });
    useArtifactsStore.getState().applyCloudArtifactDeltas([cloudRow()]);
    const visibleIds = () =>
      useArtifactsStore
        .getState()
        .getMessageArtifacts(MESSAGE_ID)
        .map((artifact) => artifact.id)
        .sort();
    expect(visibleIds()).toEqual([CURRENT_ID, PREVIOUS_ID].sort());

    loadMessage(NESTED_WITHOUT_LONGER_FENCE);

    expect(visibleIds()).toEqual([CURRENT_ID]);
  });

  it('keeps showing a synced copy that holds an edit the new id has never seen', () => {
    saveUnderPreviousId();
    useArtifactsStore.getState().addArtifactForMessage(MESSAGE_ID, derivedPage(), CONVERSATION_ID);

    useArtifactsStore
      .getState()
      .applyCloudArtifactDeltas([cloudRow({ content: '<main>Edited elsewhere</main>' })]);

    expect(
      useArtifactsStore
        .getState()
        .getMessageArtifacts(MESSAGE_ID)
        .map((artifact) => artifact.id)
        .sort(),
    ).toEqual([CURRENT_ID, PREVIOUS_ID].sort());
  });

  it('shows one card on a device that pulls both ids and holds nothing', () => {
    useArtifactsStore
      .getState()
      .applyCloudArtifactDeltas([cloudRow(), cloudRow({ id: CURRENT_ID, server_version: '42' })]);

    expect(
      useArtifactsStore
        .getState()
        .getMessageArtifacts(MESSAGE_ID)
        .map((artifact) => artifact.id),
    ).toEqual([CURRENT_ID]);
  });

  it('shows one card when the message loads after both ids were pulled', () => {
    useChatStore.setState({ conversations: [], messagesByConversation: {} });
    useArtifactsStore
      .getState()
      .applyCloudArtifactDeltas([cloudRow(), cloudRow({ id: CURRENT_ID, server_version: '42' })]);

    loadMessage(NESTED_WITHOUT_LONGER_FENCE);

    expect(
      useArtifactsStore
        .getState()
        .getMessageArtifacts(MESSAGE_ID)
        .map((artifact) => artifact.id),
    ).toEqual([CURRENT_ID]);
  });

  it('moves an edit saved here under the previous id onto the new id another device synced', () => {
    saveUnderPreviousId(UNPUSHED);

    useArtifactsStore
      .getState()
      .applyCloudArtifactDeltas([cloudRow(), cloudRow({ id: CURRENT_ID, server_version: '42' })]);

    const state = useArtifactsStore.getState();
    expect(state.getMessageArtifacts(MESSAGE_ID)).toEqual([
      expect.objectContaining({ id: CURRENT_ID, content: UNPUSHED }),
    ]);
    expect(state.getArtifactVersions(CURRENT_ID).map((version) => version.content)).toEqual([
      PAGE,
      UNPUSHED,
    ]);
    expect(state.selectedArtifactId).toBe(CURRENT_ID);
    expect(state.collectArtifactPushBatch()).toEqual([
      expect.objectContaining({ id: CURRENT_ID, content: UNPUSHED, baseVersion: '42' }),
    ]);
  });

  it('names the conflict when the new id synced later than the edit saved here', () => {
    saveUnderPreviousId(UNPUSHED);

    useArtifactsStore
      .getState()
      .applyCloudArtifactDeltas([
        cloudRow(),
        cloudRow({ id: CURRENT_ID, server_version: '42', updated_at: '2999-01-01T00:00:00.000Z' }),
      ]);

    const state = useArtifactsStore.getState();
    expect(state.getMessageArtifacts(MESSAGE_ID)).toEqual([
      expect.objectContaining({ id: CURRENT_ID, content: EDITED }),
    ]);
    expect(state.getArtifactVersions(CURRENT_ID).map((version) => version.content)).toContain(
      UNPUSHED,
    );
    expect(state.artifactConflicts[CURRENT_ID]).toEqual(
      expect.objectContaining({ localContent: UNPUSHED, serverContent: EDITED }),
    );
  });

  it('leaves an edit saved here in place when its new id would not stay on this message', () => {
    loadMessage(NESTED_WITHOUT_LONGER_FENCE, {
      artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY,
    });
    saveUnderPreviousId(UNPUSHED);

    useArtifactsStore
      .getState()
      .applyCloudArtifactDeltas([cloudRow({ id: CURRENT_ID, server_version: '42' })]);

    const state = useArtifactsStore.getState();
    expect(state.getArtifactVersions(PREVIOUS_ID).map((version) => version.content)).toEqual([
      PAGE,
      UNPUSHED,
    ]);
    expect(state.getArtifactVersions(CURRENT_ID)).toEqual([]);
  });

  it('adopts nothing when the new block holds more than one previous block', () => {
    const wrapper = [
      '````markdown',
      '# Setup',
      '```bash',
      'npm i a',
      '```',
      '```bash',
      'npm i b',
      '```',
      '```bash',
      'npm i c',
      '```',
      '````',
    ].join('\n');
    loadMessage(wrapper);
    const store = useArtifactsStore.getState();
    store.upsertArtifact({
      id: idAt(2),
      type: 'code',
      title: 'bash snippet 3',
      language: 'bash',
      content: 'npm i c --save',
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
    });

    store.addArtifactForMessage(
      MESSAGE_ID,
      {
        id: idAt(0),
        type: 'document',
        title: 'Setup',
        language: 'markdown',
        content: wrapper.split('\n').slice(1, -1).join('\n'),
      },
      CONVERSATION_ID,
    );

    const state = useArtifactsStore.getState();
    expect(state.getMessageArtifacts(MESSAGE_ID).find((a) => a.id === idAt(0))?.title).toBe(
      'Setup',
    );
    expect(state.getMessageArtifacts(MESSAGE_ID).find((a) => a.id === idAt(2))?.content).toBe(
      'npm i c --save',
    );
  });

  it('adopts nothing for a message the chat has not loaded', () => {
    useChatStore.setState({ conversations: [], messagesByConversation: {} });
    saveUnderPreviousId();

    useArtifactsStore.getState().addArtifactForMessage(MESSAGE_ID, derivedPage(), CONVERSATION_ID);

    expect(
      useArtifactsStore
        .getState()
        .getMessageArtifacts(MESSAGE_ID)
        .map((artifact) => artifact.id)
        .sort(),
    ).toEqual([CURRENT_ID, PREVIOUS_ID].sort());
  });
});
