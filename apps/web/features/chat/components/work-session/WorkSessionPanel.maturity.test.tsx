import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Message } from '@shared/stores/web-chat-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { MANAGED_CLOUD_STATUS } from '@/lib/legal-constants';
import { WorkSessionPanel } from './WorkSessionPanel';

vi.mock('../../utils/downloadArtifacts', () => ({
  downloadAllArtifacts: vi.fn().mockResolvedValue(undefined),
  downloadGeneratedFile: vi.fn().mockResolvedValue(undefined),
}));

function messages(): Message[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      content: 'Prepare a report.',
      createdAt: '2026-07-30T12:00:00.000Z',
      metadata: { sendReplay: { workMode: 'agiwork' } },
    },
  ];
}

describe('WorkSessionPanel maturity disclosure', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
    useChatStore.setState({ activeConversationId: 'conv-1' });
  });

  it('labels the AGI Work session header with the Managed Cloud maturity status', () => {
    render(<WorkSessionPanel messages={messages()} open onClose={vi.fn()} />);

    const badge = screen.getByTestId('agi-work-maturity-badge');
    expect(badge).toBeVisible();
    expect(badge.textContent).toBe('Alpha');
    expect(badge.getAttribute('title')).toContain(MANAGED_CLOUD_STATUS);
  });
});
