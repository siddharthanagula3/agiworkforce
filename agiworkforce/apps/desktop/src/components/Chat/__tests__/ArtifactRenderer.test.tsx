import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ArtifactRenderer } from '../ArtifactRenderer';
import type { Artifact } from '../../../types/chat';
import { TooltipProvider } from '../../ui/Tooltip';
import type { ReactElement } from 'react';

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

function renderWithTooltipProvider(component: ReactElement) {
  return render(<TooltipProvider>{component}</TooltipProvider>);
}

describe('ArtifactRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCodeArtifact: Artifact = {
    id: '1',
    type: 'code',
    language: 'javascript',
    title: 'Example Function',
    content: 'function hello() {\n  console.log("Hello, world!");\n}',
  };

  const mockChartArtifact: Artifact = {
    id: '2',
    type: 'chart',
    title: 'Sales Data',
    content: JSON.stringify({
      type: 'bar',
      xKey: 'month',
      data: [
        { month: 'Jan', sales: 100 },
        { month: 'Feb', sales: 150 },
        { month: 'Mar', sales: 200 },
      ],
      bars: [{ dataKey: 'sales', color: '#8884d8' }],
    }),
  };

  const mockTableArtifact: Artifact = {
    id: '3',
    type: 'table',
    title: 'User Data',
    content: JSON.stringify([
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: 'Bob', age: 25 },
    ]),
  };

  it('renders code artifact with syntax highlighting', () => {
    renderWithTooltipProvider(<ArtifactRenderer artifact={mockCodeArtifact} />);

    expect(screen.getByText('Example Function')).toBeInTheDocument();
    expect(screen.getByText(/javascript/i)).toBeInTheDocument();
    expect(screen.getByText(/hello/)).toBeInTheDocument();
  });

  it('copies code to clipboard', async () => {
    renderWithTooltipProvider(<ArtifactRenderer artifact={mockCodeArtifact} />);

    const copyButton = screen.getByLabelText(/copy to clipboard/i);
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        mockCodeArtifact.content
      );
    });

    expect(screen.getByText(/copied!/i)).toBeInTheDocument();
  });

  it('renders chart artifact', () => {
    renderWithTooltipProvider(<ArtifactRenderer artifact={mockChartArtifact} />);

    expect(screen.getByText('Sales Data')).toBeInTheDocument();
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('renders table artifact', () => {
    renderWithTooltipProvider(<ArtifactRenderer artifact={mockTableArtifact} />);

    expect(screen.getByText('User Data')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('handles invalid chart data', () => {
    const invalidChartArtifact: Artifact = {
      id: '4',
      type: 'chart',
      content: 'invalid json',
    };

    renderWithTooltipProvider(<ArtifactRenderer artifact={invalidChartArtifact} />);

    expect(screen.getByText(/invalid chart data/i)).toBeInTheDocument();
  });

  it('handles invalid table data', () => {
    const invalidTableArtifact: Artifact = {
      id: '5',
      type: 'table',
      content: 'not an array',
    };

    renderWithTooltipProvider(<ArtifactRenderer artifact={invalidTableArtifact} />);

    expect(screen.getByText(/invalid table data/i)).toBeInTheDocument();
  });

  it('downloads artifact', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;

    const appendChild = vi.spyOn(document.body, 'appendChild');
    const removeChild = vi.spyOn(document.body, 'removeChild');

    renderWithTooltipProvider(<ArtifactRenderer artifact={mockCodeArtifact} />);

    const downloadButton = screen.getByLabelText(/download/i);
    fireEvent.click(downloadButton);

    expect(createObjectURL).toHaveBeenCalled();
    expect(appendChild).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it('renders mermaid diagram with placeholder', () => {
    const mermaidArtifact: Artifact = {
      id: '6',
      type: 'mermaid',
      content: 'graph TD\n  A-->B',
    };

    renderWithTooltipProvider(<ArtifactRenderer artifact={mermaidArtifact} />);

    expect(screen.getByText(/mermaid diagram rendering requires additional setup/i)).toBeInTheDocument();
    expect(screen.getByText(/graph TD/)).toBeInTheDocument();
  });
});
