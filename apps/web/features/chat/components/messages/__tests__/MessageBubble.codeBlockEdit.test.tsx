import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EXPLICIT_ARTIFACT_DERIVATION_POLICY } from '@agiworkforce/artifacts';
import { MessageBubble } from '../MessageBubble';
import { useArtifactsStore } from '../../../stores/artifacts-store';

const CONVERSATION_ID = 'conv-code-edit';

function assistantMessage(id: string, content: string) {
  return {
    id,
    role: 'assistant' as const,
    content,
    timestamp: new Date('2026-10-10T00:00:00.000Z'),
    sessionId: CONVERSATION_ID,
    metadata: { artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY },
  };
}

beforeEach(() => {
  useArtifactsStore.getState().reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

describe('MessageBubble · code block Edit', () => {
  it.each([
    { language: 'html', source: '<main>Hello page</main>' },
    { language: 'python', source: 'print("hello")' },
  ])('asks the artifacts panel to open the $language block for editing', async (block) => {
    const id = `msg-edit-${block.language}`;
    render(
      <MessageBubble
        message={assistantMessage(
          id,
          `Here it is:\n\n\`\`\`${block.language}\n${block.source}\n\`\`\``,
        )}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit this code beside the chat' }),
    );

    const state = useArtifactsStore.getState();
    const [artifact] = state.getMessageArtifacts(id);
    expect(artifact?.content.trimEnd()).toBe(block.source);
    expect(state.selectedArtifactId).toBe(artifact?.id);
    expect(state.editRequestedArtifactId).toBe(artifact?.id);
    expect(state.panelOpen).toBe(true);
  });
});
