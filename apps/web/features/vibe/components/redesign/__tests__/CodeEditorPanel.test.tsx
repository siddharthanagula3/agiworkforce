import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeEditorPanel } from '../CodeEditorPanel';

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Mock vibe file system
vi.mock('@features/vibe/services/vibe-file-system', () => ({
  vibeFileSystem: {
    getFileTree: vi.fn(() => []),
    readFile: vi.fn(() => 'file content'),
    openFile: vi.fn(() => ({ language: 'typescript' })),
    closeFile: vi.fn(),
    updateFile: vi.fn(),
    markClean: vi.fn(),
    createFile: vi.fn(),
    createFolder: vi.fn(),
    deleteFile: vi.fn(),
    renameFile: vi.fn(),
    searchFiles: vi.fn(() => []),
  },
}));

// Mock FileTreeView
vi.mock('../FileTreeView', () => ({
  FileTreeView: () => <div data-testid="file-tree" />,
}));

// Mock VibeTemplateSelector
vi.mock('../../VibeTemplateSelector', () => ({
  VibeTemplateSelector: () => null,
}));

// Mock jszip
vi.mock('jszip', () => ({
  default: vi.fn().mockImplementation(() => ({
    file: vi.fn(),
    generateAsync: vi.fn().mockResolvedValue(new Blob()),
  })),
}));

// Mock ErrorBoundary
vi.mock('@shared/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock Radix ScrollArea to render children directly
vi.mock('@shared/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('CodeEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<CodeEditorPanel />);
    expect(container).toBeTruthy();
  });

  it('shows "No files yet" empty state when file tree is empty', () => {
    render(<CodeEditorPanel />);
    expect(screen.getByText('No files yet')).toBeInTheDocument();
    expect(screen.getByText('Create a file or use a template')).toBeInTheDocument();
  });

  it('shows file tree sidebar with action buttons', () => {
    render(<CodeEditorPanel />);

    expect(screen.getByText('FILES')).toBeInTheDocument();
    expect(screen.getByLabelText('New from template')).toBeInTheDocument();
    expect(screen.getByLabelText('Export as ZIP')).toBeInTheDocument();
    expect(screen.getByLabelText('New file')).toBeInTheDocument();
    expect(screen.getByLabelText('New folder')).toBeInTheDocument();
  });

  it('shows "No file selected" when no file is open', () => {
    render(<CodeEditorPanel />);
    expect(screen.getByText('No file selected')).toBeInTheDocument();
    expect(screen.getByText('Select a file from the sidebar')).toBeInTheDocument();
  });

  it('cleans up copy timeout ref on unmount', () => {
    vi.useFakeTimers();

    const { unmount } = render(<CodeEditorPanel />);

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    unmount();

    // The cleanup effect calls clearTimeout(copyTimeoutRef.current).
    // On unmount with no copy triggered, ref is undefined so clearTimeout
    // is called with undefined -- the important thing is it does not throw.
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});
