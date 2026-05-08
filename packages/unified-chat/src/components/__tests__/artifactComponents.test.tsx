/**
 * Phase A Slice 4 — artifact component smoke tests
 *
 * Tests:
 * - ArtifactRenderer: renders correct data-testid per artifact kind
 * - ArtifactsSidebar: shows/hides correctly; empty state when no active artifact
 * - ReactPreview: iframe sandbox attributes correct
 * - PresentationArtifact: slide navigation
 * - SpreadsheetArtifact: basic cell rendering
 * - SidecarPanel: minimize/maximize
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ArtifactRenderer } from '../ArtifactRenderer';
import { ArtifactsSidebar } from '../ArtifactsSidebar';
import { ReactPreview, buildReactPreviewDocument } from '../artifact-components/ReactPreview';
import { PresentationArtifact } from '../artifact-components/PresentationArtifact';
import { SpreadsheetArtifact } from '../artifact-components/SpreadsheetArtifact';
import { SidecarPanel } from '../sidecar/SidecarPanel';
import { useArtifactStore } from '../../stores/artifactStore';
import type { Artifact } from '../../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArtifact(overrides: {
  id: string;
  type: Artifact['type'];
  title?: string;
  content?: string;
  language?: string;
}): Artifact {
  return {
    id: overrides.id,
    type: overrides.type,
    title: overrides.title ?? 'Test Artifact',
    content: overrides.content ?? '// placeholder',
    language: overrides.language,
  };
}

// Stub dynamic import for mermaid (not available in test env)
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg"></svg>' }),
  },
}));

// ---------------------------------------------------------------------------
// ArtifactRenderer — kind routing
// ---------------------------------------------------------------------------

describe('ArtifactRenderer', () => {
  it('renders the outer container with data-testid', () => {
    const artifact = makeArtifact({
      id: 'a1',
      type: 'code',
      content: 'const x = 1;',
      language: 'typescript',
    });
    render(<ArtifactRenderer artifact={artifact} />);
    expect(screen.getByTestId('artifact-renderer')).toBeDefined();
  });

  it('renders code artifact content', () => {
    const artifact = makeArtifact({
      id: 'a2',
      type: 'code',
      content: 'const x = 42;',
      language: 'typescript',
    });
    render(<ArtifactRenderer artifact={artifact} />);
    expect(screen.getByTestId('code-artifact')).toBeDefined();
    expect(screen.getByText(/const x = 42/)).toBeDefined();
  });

  it('renders markdown artifact content', () => {
    const artifact = makeArtifact({ id: 'a3', type: 'markdown', content: '# Hello World' });
    render(<ArtifactRenderer artifact={artifact} />);
    expect(screen.getByTestId('markdown-artifact')).toBeDefined();
    expect(screen.getByText(/# Hello World/)).toBeDefined();
  });

  it('renders table artifact', () => {
    const data = JSON.stringify([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    const artifact = makeArtifact({ id: 'a4', type: 'table', content: data });
    render(<ArtifactRenderer artifact={artifact} />);
    expect(screen.getByTestId('table-artifact')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('renders spreadsheet artifact', () => {
    const data = JSON.stringify([{ col1: 'A', col2: 'B' }]);
    const artifact = makeArtifact({ id: 'a5', type: 'spreadsheet', content: data });
    render(<ArtifactRenderer artifact={artifact} />);
    expect(screen.getByTestId('spreadsheet-artifact')).toBeDefined();
  });

  it('renders awaiting message when status is running and content is empty', () => {
    const artifact = {
      ...makeArtifact({ id: 'a6', type: 'code', content: '' }),
      status: 'running',
    } as Artifact & { status: string };
    render(<ArtifactRenderer artifact={artifact} />);
    expect(screen.getByText(/Waiting for tool output/)).toBeDefined();
  });

  it('renders React preview for react type', () => {
    const artifact = makeArtifact({
      id: 'a7',
      type: 'react',
      content: 'export default () => <div>hi</div>',
    });
    render(<ArtifactRenderer artifact={artifact} />);
    expect(screen.getByTestId('react-preview-frame')).toBeDefined();
  });

  it('shows unsupported message for unknown type', () => {
    const artifact = makeArtifact({ id: 'a8', type: 'code', content: 'x' });
    // Override type to something not handled via unknown cast
    (artifact as unknown as Record<string, unknown>)['type'] = 'unknown-future-type';
    render(<ArtifactRenderer artifact={artifact} />);
    expect(screen.getByText(/Unsupported artifact type/)).toBeDefined();
  });

  it('copy button calls clipboard writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const artifact = makeArtifact({
      id: 'a9',
      type: 'code',
      content: 'const x = 1;',
      language: 'ts',
    });
    render(<ArtifactRenderer artifact={artifact} />);

    const copyBtn = screen.getByLabelText('Copy to clipboard');
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(writeText).toHaveBeenCalledWith('const x = 1;');
  });
});

// ---------------------------------------------------------------------------
// ArtifactsSidebar — show/hide + empty state
// ---------------------------------------------------------------------------

describe('ArtifactsSidebar', () => {
  beforeEach(() => {
    useArtifactStore.getState().reset();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ArtifactsSidebar isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when isOpen is true', () => {
    render(<ArtifactsSidebar isOpen={true} />);
    expect(screen.getByTestId('artifacts-sidebar')).toBeDefined();
  });

  it('shows empty state when no active artifact', () => {
    render(<ArtifactsSidebar isOpen={true} />);
    expect(screen.getByText(/No artifact selected/)).toBeDefined();
  });

  it('renders the active artifact when set in store', () => {
    const artifact = makeArtifact({
      id: 'sidebar-a1',
      type: 'code',
      content: 'const test = 1;',
      language: 'ts',
      title: 'Sidebar Code',
    });
    act(() => {
      useArtifactStore.getState().openArtifact(artifact);
    });
    render(<ArtifactsSidebar isOpen={true} />);
    // Title appears in both sidebar header and artifact renderer header
    const matches = screen.getAllByText('Sidebar Code');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    render(<ArtifactsSidebar isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close artifact panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has correct width style', () => {
    render(<ArtifactsSidebar isOpen={true} />);
    const sidebar = screen.getByTestId('artifacts-sidebar');
    expect(sidebar.style.width).toBe('420px');
  });
});

// ---------------------------------------------------------------------------
// ReactPreview — iframe sandbox attributes
// ---------------------------------------------------------------------------

describe('ReactPreview', () => {
  it('renders the preview frame container', () => {
    render(<ReactPreview code="export default () => <div>Hello</div>" />);
    expect(screen.getByTestId('react-preview-frame')).toBeDefined();
  });

  it('iframe has sandbox="allow-scripts" only', () => {
    render(<ReactPreview code="export default () => <div>Hello</div>" />);
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('iframe has referrerPolicy="no-referrer"', () => {
    render(<ReactPreview code="export default () => <div>Hello</div>" />);
    const iframe = document.querySelector('iframe');
    expect(iframe?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('reload button does not throw and button remains visible after click', () => {
    render(<ReactPreview code="export default () => <div>Hello</div>" />);
    const reloadBtn = screen.getByLabelText('Reload preview');
    fireEvent.click(reloadBtn);
    expect(reloadBtn).toBeDefined();
  });

  it('buildReactPreviewDocument includes channelId in script', () => {
    const doc = buildReactPreviewDocument('export default () => null', 'test-channel-id', 'null');
    expect(doc).toContain('test-channel-id');
    // Should include Babel CDN
    expect(doc).toContain('babel.min.js');
    // Should include allow-only script execution note
    expect(doc).toContain('esm.sh/react@18');
  });
});

// ---------------------------------------------------------------------------
// PresentationArtifact — slide navigation
// ---------------------------------------------------------------------------

describe('PresentationArtifact', () => {
  const multiSlide = `# Slide 1\nContent one\n---\n# Slide 2\nContent two\n---\n# Slide 3\nContent three`;

  it('renders first slide by default', () => {
    const artifact = makeArtifact({ id: 'p1', type: 'presentation', content: multiSlide });
    render(<PresentationArtifact artifact={artifact} />);
    expect(screen.getByText(/1 \/ 3/)).toBeDefined();
  });

  it('advances to next slide on next button click', () => {
    const artifact = makeArtifact({ id: 'p2', type: 'presentation', content: multiSlide });
    render(<PresentationArtifact artifact={artifact} />);
    fireEvent.click(screen.getByLabelText('Next slide'));
    expect(screen.getByText(/2 \/ 3/)).toBeDefined();
  });

  it('goes back to previous slide on prev button click', () => {
    const artifact = makeArtifact({ id: 'p3', type: 'presentation', content: multiSlide });
    render(<PresentationArtifact artifact={artifact} />);
    fireEvent.click(screen.getByLabelText('Next slide'));
    fireEvent.click(screen.getByLabelText('Previous slide'));
    expect(screen.getByText(/1 \/ 3/)).toBeDefined();
  });

  it('prev button is disabled on first slide', () => {
    const artifact = makeArtifact({ id: 'p4', type: 'presentation', content: multiSlide });
    render(<PresentationArtifact artifact={artifact} />);
    const prevBtn = screen.getByLabelText('Previous slide');
    expect(prevBtn.hasAttribute('disabled')).toBe(true);
  });

  it('next button is disabled on last slide', () => {
    const artifact = makeArtifact({ id: 'p5', type: 'presentation', content: multiSlide });
    render(<PresentationArtifact artifact={artifact} />);
    // Advance to last
    fireEvent.click(screen.getByLabelText('Next slide'));
    fireEvent.click(screen.getByLabelText('Next slide'));
    const nextBtn = screen.getByLabelText('Next slide');
    expect(nextBtn.hasAttribute('disabled')).toBe(true);
  });

  it('renders empty state when content has no slides', () => {
    const artifact = makeArtifact({ id: 'p6', type: 'presentation', content: '' });
    render(<PresentationArtifact artifact={artifact} />);
    expect(screen.getByText(/No slides found/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// SpreadsheetArtifact — cell rendering
// ---------------------------------------------------------------------------

describe('SpreadsheetArtifact', () => {
  const spreadsheetData = JSON.stringify([
    { Name: 'Alice', Age: 30, City: 'NY' },
    { Name: 'Bob', Age: 25, City: 'LA' },
  ]);

  it('renders the spreadsheet table', () => {
    const artifact = makeArtifact({ id: 's1', type: 'spreadsheet', content: spreadsheetData });
    render(<SpreadsheetArtifact artifact={artifact} />);
    expect(screen.getByTestId('spreadsheet-table')).toBeDefined();
  });

  it('renders column headers', () => {
    const artifact = makeArtifact({ id: 's2', type: 'spreadsheet', content: spreadsheetData });
    render(<SpreadsheetArtifact artifact={artifact} />);
    expect(screen.getByText('Name')).toBeDefined();
    expect(screen.getByText('Age')).toBeDefined();
    expect(screen.getByText('City')).toBeDefined();
  });

  it('renders cell values', () => {
    const artifact = makeArtifact({ id: 's3', type: 'spreadsheet', content: spreadsheetData });
    render(<SpreadsheetArtifact artifact={artifact} />);
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('shows row count', () => {
    const artifact = makeArtifact({ id: 's4', type: 'spreadsheet', content: spreadsheetData });
    render(<SpreadsheetArtifact artifact={artifact} />);
    expect(screen.getByText(/2 rows/)).toBeDefined();
  });

  it('shows invalid state for malformed JSON', () => {
    const artifact = makeArtifact({ id: 's5', type: 'spreadsheet', content: 'not-json' });
    render(<SpreadsheetArtifact artifact={artifact} />);
    expect(screen.getByText(/Invalid spreadsheet data/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// SidecarPanel — minimize / maximize
// ---------------------------------------------------------------------------

describe('SidecarPanel', () => {
  it('renders panel body when not minimized', () => {
    render(
      <SidecarPanel panelType="artifact">
        <div>Panel content</div>
      </SidecarPanel>,
    );
    expect(screen.getByTestId('sidecar-panel')).toBeDefined();
    expect(screen.getByText('Panel content')).toBeDefined();
  });

  it('minimizes when minimize button is clicked', () => {
    render(
      <SidecarPanel panelType="artifact">
        <div>Panel content</div>
      </SidecarPanel>,
    );
    fireEvent.click(screen.getByLabelText('Minimize sidecar'));
    expect(screen.getByTestId('sidecar-panel-minimized')).toBeDefined();
    expect(screen.queryByTestId('sidecar-panel')).toBeNull();
  });

  it('restores when expand button is clicked after minimize', () => {
    render(
      <SidecarPanel panelType="artifact">
        <div>Panel content</div>
      </SidecarPanel>,
    );
    fireEvent.click(screen.getByLabelText('Minimize sidecar'));
    fireEvent.click(screen.getByLabelText('Expand sidecar'));
    expect(screen.getByTestId('sidecar-panel')).toBeDefined();
  });

  it('starts minimized when defaultMinimized=true', () => {
    render(
      <SidecarPanel panelType="terminal" defaultMinimized={true}>
        <div>x</div>
      </SidecarPanel>,
    );
    expect(screen.getByTestId('sidecar-panel-minimized')).toBeDefined();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <SidecarPanel panelType="artifact" onClose={onClose}>
        <div>x</div>
      </SidecarPanel>,
    );
    fireEvent.click(screen.getByLabelText('Close sidecar'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders allowed security badge by default', () => {
    render(
      <SidecarPanel panelType="artifact">
        <div>x</div>
      </SidecarPanel>,
    );
    expect(screen.getByText('Allowed')).toBeDefined();
  });

  it('renders restricted security badge when allowStatus=restricted', () => {
    render(
      <SidecarPanel panelType="artifact" allowStatus="restricted">
        <div>x</div>
      </SidecarPanel>,
    );
    expect(screen.getByText('Restricted')).toBeDefined();
  });

  it('shows panel label in header', () => {
    render(
      <SidecarPanel panelType="terminal">
        <div>x</div>
      </SidecarPanel>,
    );
    expect(screen.getByText('Terminal')).toBeDefined();
  });
});
