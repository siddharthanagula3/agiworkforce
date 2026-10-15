import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailArtifact } from '../EmailArtifact';
import type { Artifact } from '../../../lib/types';

const email: Artifact = {
  id: 'e1',
  type: 'email',
  title: 'Draft',
  content: 'Subject: Hello\nTo: a@example.com\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n',
};

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => vi.restoreAllMocks());

describe('EmailArtifact', () => {
  it('renders an aligned table body through the canonical Markdown renderer', () => {
    render(<EmailArtifact artifact={email} />);
    const body = screen.getByTestId('email-body');
    expect(body.querySelectorAll('table')).toHaveLength(1);
    expect(body.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('announces a failed copy and succeeds on retry', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(undefined);
    stubClipboard(writeText);
    render(<EmailArtifact artifact={email} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy email as text' }));
    });
    expect(screen.getByTestId('email-copy-status').textContent).toMatch(/could not copy/i);
    expect(screen.queryByText('Copied')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry copying/i }));
    });
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeDefined();
    expect(screen.getByTestId('email-copy-status').textContent).toBe('');
  });
});
