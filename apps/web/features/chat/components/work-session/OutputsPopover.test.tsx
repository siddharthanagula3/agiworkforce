import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Message } from '@shared/stores/web-chat-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { downloadArtifactFile } from '../../utils/downloadArtifacts';
import { OutputsPopoverButton } from './OutputsPopover';

vi.mock('../../utils/downloadArtifacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/downloadArtifacts')>()),
  downloadAllArtifacts: vi.fn().mockResolvedValue(undefined),
  downloadGeneratedFile: vi.fn().mockResolvedValue(undefined),
  downloadArtifactFile: vi.fn().mockResolvedValue(undefined),
}));

const CONVERSATION_ID = 'conv-outputs-popover';
const MESSAGES = [
  {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Made it.',
    createdAt: '2026-10-11T12:00:00.000Z',
  },
] as unknown as Message[];

function addCalculator() {
  useArtifactsStore.getState().upsertArtifact({
    id: 'artifact-calculator',
    type: 'html',
    title: 'Desk Calculator',
    language: 'html',
    content: '<!doctype html><title>Desk Calculator</title><main>0</main>',
    messageId: 'assistant-1',
    conversationId: CONVERSATION_ID,
  });
}

describe('OutputsPopoverButton', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
    useArtifactsStore.getState().setPanelOpen(false);
    useChatStore.getState().setActiveConversation(CONVERSATION_ID);
  });

  it('shows its fallback until the chat has made something', () => {
    render(<OutputsPopoverButton messages={MESSAGES} fallback={<span>panel toggle</span>} />);
    expect(screen.queryByTestId('outputs-button')).toBeNull();
    expect(screen.getByText('panel toggle')).toBeVisible();
  });

  it('counts the outputs and lists them with thumbnails in a popover', () => {
    addCalculator();
    render(<OutputsPopoverButton messages={MESSAGES} />);

    const button = screen.getByRole('button', { name: 'Outputs, 1' });
    expect(button).toHaveTextContent('1');
    fireEvent.click(button);

    const dialog = screen.getByRole('dialog', { name: 'Outputs' });
    expect(within(dialog).getByText('Desk Calculator')).toBeVisible();
    expect(dialog.querySelector('iframe')?.getAttribute('sandbox')).toBe('');
  });

  it('opens an output in the panel and closes itself', () => {
    addCalculator();
    render(<OutputsPopoverButton messages={MESSAGES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Outputs, 1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open Desk Calculator' }));
    expect(useArtifactsStore.getState().selectedArtifactId).toBe('artifact-calculator');
    expect(useArtifactsStore.getState().panelOpen).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Outputs' })).toBeNull();
  });

  it('downloads one artifact as its own file, not a zip', () => {
    addCalculator();
    render(<OutputsPopoverButton messages={MESSAGES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Outputs, 1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Download Desk Calculator' }));
    expect(downloadArtifactFile).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Desk Calculator', type: 'html' }),
    );
  });
});
