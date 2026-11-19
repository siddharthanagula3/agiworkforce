import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  downloadAsMarkdown: vi.fn(),
}));

vi.mock('../../services/document-export-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  downloadAsMarkdown: mocks.downloadAsMarkdown,
  downloadAsPDF: vi.fn(),
  downloadAsDOCX: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EnhancedExportDialog } from './EnhancedExportDialog';
import type { ChatMessage, ChatSession } from '../../types';

const session: ChatSession = {
  id: 'session-1',
  title: 'Private title',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  messageCount: 1,
  tags: [],
  participants: [],
};

const messages: ChatMessage[] = [
  {
    id: 'message-1',
    role: 'user',
    content: 'hello there',
    createdAt: new Date('2026-01-01T12:00:00.000Z'),
  },
];

async function exportMarkdown(uncheckMetadata: boolean): Promise<string> {
  const user = userEvent.setup();
  render(
    <EnhancedExportDialog open onOpenChange={vi.fn()} session={session} messages={messages} />,
  );
  await user.type(screen.getByLabelText(/filename/i), 'neutral');
  if (uncheckMetadata) {
    await user.click(screen.getByRole('checkbox', { name: /include metadata/i }));
  }
  await user.click(screen.getByRole('button', { name: /export markdown/i }));
  await waitFor(() => expect(mocks.downloadAsMarkdown).toHaveBeenCalledTimes(1));
  return mocks.downloadAsMarkdown.mock.calls[0]?.[0] as string;
}

describe('EnhancedExportDialog metadata option', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the title and dates in the downloaded markdown while metadata is checked', async () => {
    const content = await exportMarkdown(false);

    expect(content).toContain('# Private title');
    expect(content).toContain('**Created:**');
  });

  it('leaves the title and dates out of the downloaded markdown once metadata is unchecked', async () => {
    const content = await exportMarkdown(true);

    expect(content).not.toContain('Private title');
    expect(content).not.toContain('**Created:**');
    expect(content).not.toContain('**Last Updated:**');
    expect(content).not.toContain('**Messages:**');
    expect(content).toContain('hello there');
  });
});

type ImportedModule0 = typeof import('../../services/document-export-service');
