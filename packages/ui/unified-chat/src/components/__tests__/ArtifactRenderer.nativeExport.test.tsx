import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactRenderer } from '../ArtifactRenderer';
import type { Artifact } from '../../lib/types';

const codeArtifact: Artifact = {
  id: 'a1',
  type: 'code',
  title: 'Report',
  content: '# heading\n\nbody',
  language: 'markdown',
};

const tableArtifact: Artifact = {
  id: 'a2',
  type: 'table',
  title: 'Numbers',
  content: 'a,b\n1,2',
};

function openExportMenu() {
  fireEvent.click(screen.getByRole('button', { name: /download or export artifact/i }));
}

// The export options were built and gated behind `onExportNative`, which no
// caller passed, so no user could export an artifact natively. Wiring it
// raised a second question: web can build PDF and DOCX but has no xlsx writer,
// and an 'excel' option that fails after the user picks it is worse than none.
// `nativeExportFormats` is what keeps the menu honest.
describe('artifact native export', () => {
  it('offers nothing when the host cannot export', () => {
    render(<ArtifactRenderer artifact={codeArtifact} />);
    openExportMenu();
    expect(screen.queryByText(/export as pdf/i)).toBeNull();
    expect(screen.queryByText(/export as word/i)).toBeNull();
  });

  it('offers the formats the host declares, and hands back the artifact', () => {
    const onExportNative = vi.fn().mockResolvedValue(undefined);
    render(
      <ArtifactRenderer
        artifact={codeArtifact}
        onExportNative={onExportNative}
        nativeExportFormats={['pdf', 'word']}
      />,
    );
    openExportMenu();
    fireEvent.click(screen.getByText(/export as pdf/i));
    expect(onExportNative).toHaveBeenCalledWith('pdf', 'a1', codeArtifact.content, 'Report');
  });

  it('never offers a format the host left out', () => {
    render(
      <ArtifactRenderer
        artifact={codeArtifact}
        onExportNative={vi.fn()}
        nativeExportFormats={['pdf']}
      />,
    );
    openExportMenu();
    expect(screen.getByText(/export as pdf/i)).toBeTruthy();
    expect(screen.queryByText(/export as word/i)).toBeNull();
  });

  it('hides the excel option from a host with no xlsx writer', () => {
    render(
      <ArtifactRenderer
        artifact={tableArtifact}
        onExportNative={vi.fn()}
        nativeExportFormats={['pdf', 'word']}
      />,
    );
    openExportMenu();
    expect(screen.queryByText(/excel/i)).toBeNull();
  });
});
