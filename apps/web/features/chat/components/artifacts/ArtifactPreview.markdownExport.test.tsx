import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArtifactPreview, type ArtifactData } from './ArtifactPreview';

const markdownDocument: ArtifactData = {
  id: 'doc-1',
  type: 'document',
  language: 'markdown',
  title: 'Plan',
  content: '# Plan\n\n- one\n- two',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ArtifactPreview · Markdown export', () => {
  it('downloads a Markdown document as Markdown, not as one code fence', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          blobs.push(blob);
          return 'blob:https://app.local/plan';
        }),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ArtifactPreview variant="panel" artifact={markdownDocument} />);
    fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download as Markdown' }));

    expect(blobs).toHaveLength(1);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]!);
    });
    expect(text).toBe(markdownDocument.content);
  });
});
