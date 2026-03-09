/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock framer-motion (AnimatePresence + motion)
vi.mock('framer-motion', () => {
  const MotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>(function MotionDiv(
    { children, ...props },
    ref,
  ) {
    const domProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (
        !key.startsWith('animate') &&
        !key.startsWith('initial') &&
        !key.startsWith('exit') &&
        !key.startsWith('transition') &&
        !key.startsWith('variants') &&
        key !== 'whileHover' &&
        key !== 'whileTap' &&
        key !== 'layout'
      ) {
        domProps[key] = value;
      }
    }
    return (
      <div ref={ref} {...domProps}>
        {children as React.ReactNode}
      </div>
    );
  });
  MotionDiv.displayName = 'motion.div';
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { div: MotionDiv },
  };
});

// Mock zustand store — must return the full shape the component destructures
vi.mock('@/stores/unified/unifiedChatStore', () => ({
  useUnifiedChatStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({ messages: [], conversations: [], activeConversationId: null }),
  ),
}));

// Mock zustand/react/shallow
vi.mock('zustand/react/shallow', () => ({
  useShallow: (fn: unknown) => fn,
}));

// Mock @/lib/utils
vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

// Mock child components
vi.mock('./ArtifactRenderer', () => ({
  ArtifactRenderer: () => <div data-testid="artifact-renderer" />,
}));

vi.mock('../Browser/BrowserVisualization', () => ({
  BrowserVisualization: () => <div data-testid="browser-viz" />,
}));

vi.mock('../Editor/MonacoEditor', () => ({
  MonacoEditor: () => <div data-testid="monaco-editor" />,
}));

vi.mock('../Execution/TerminalPanel', () => ({
  TerminalPanel: () => <div data-testid="terminal-panel" />,
}));

vi.mock('../Media/MediaGallery', () => ({
  MediaGallery: () => <div data-testid="media-gallery" />,
}));

vi.mock('../BackgroundTasks/BackgroundTasksPanel', () => ({
  BackgroundTasksPanel: () => <div data-testid="background-tasks" />,
}));

vi.mock('./Sidecar/DiffViewer', () => ({
  DiffViewer: () => <div data-testid="diff-viewer" />,
}));

// Mock lucide-react icons — simple stub without Proxy
vi.mock('lucide-react', () => {
  const Icon = () => <span data-testid="icon" />;
  return {
    __esModule: true,
    Braces: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    Code2: Icon,
    Database: Icon,
    FileText: Icon,
    Image: Icon,
    MousePointerClick: Icon,
    PanelTopOpen: Icon,
    Shield: Icon,
    ShieldAlert: Icon,
    ShieldCheck: Icon,
    Terminal: Icon,
    Video: Icon,
    X: Icon,
    Activity: Icon,
  };
});

import { DynamicSidecar } from './DynamicSidecar';

describe('DynamicSidecar preview mode', () => {
  it('renders payload content when preview payload contains content', () => {
    render(<DynamicSidecar panelType="preview" payload={{ content: 'Preview body' }} />);
    expect(screen.getByText('Preview body')).toBeInTheDocument();
    expect(screen.queryByText('Awaiting panel content…')).not.toBeInTheDocument();
  });

  it('shows explicit fallback when preview has no payload', () => {
    render(<DynamicSidecar panelType="preview" />);
    expect(screen.getByText('No preview content is available yet.')).toBeInTheDocument();
  });
});
