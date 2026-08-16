/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';
import type { Artifact } from '../types/chat';

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/fileCreation', () => ({
  shareFile: jest.fn(),
  exportToText: jest.fn().mockResolvedValue({ uri: 'file:///tmp/export.txt' }),
  exportToMarkdown: jest.fn().mockResolvedValue({ uri: 'file:///tmp/export.md' }),
  downloadGeneratedFile: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

jest.mock('@react-navigation/native', () => ({
  DrawerActions: { openDrawer: jest.fn(() => ({ type: 'OPEN_DRAWER' })) },
  useNavigation: () => ({ getParent: () => null, dispatch: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({ getParent: () => null, dispatch: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import { ArtifactFullScreen } from '../src/features/chat/components/ArtifactFullScreen';
import { ArtifactsGalleryScreen } from '../src/features/artifacts';
import { useArtifactStore } from '../src/features/artifacts/store';

const DOCUMENT_CONTENT = [
  '# Quarterly Plan',
  '',
  'A **bold** opening paragraph.',
  '',
  '## Milestones',
  '',
  '- Ship the mobile viewer',
  '- Close the parity backlog',
  '',
  '```bash',
  'pnpm test',
  '```',
].join('\n');

const CODE_CONTENT = ['def add(a, b):', '    return a + b'].join('\n');

const documentArtifact: Artifact = {
  id: 'artifact-doc',
  type: 'document',
  title: 'plan.md',
  content: DOCUMENT_CONTENT,
};

const codeArtifact: Artifact = {
  id: 'artifact-code',
  type: 'code',
  title: 'main.py',
  language: 'python',
  content: CODE_CONTENT,
};

function collectTextLeaves(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectTextLeaves(child, out);
    return out;
  }
  if (node && typeof node === 'object' && 'children' in node) {
    collectTextLeaves((node as { children?: unknown }).children, out);
  }
  return out;
}

describe('ArtifactFullScreen markdown rendering (PAR-M08)', () => {
  it('renders a document artifact as formatted markdown, not raw source', () => {
    const screen = render(
      <ArtifactFullScreen artifact={documentArtifact} visible onClose={jest.fn()} />,
    );

    expect(screen.getByText('Quarterly Plan')).toBeTruthy();
    expect(screen.getByText('Milestones')).toBeTruthy();
    expect(screen.getByText('Ship the mobile viewer')).toBeTruthy();
    expect(screen.getByText('Close the parity backlog')).toBeTruthy();
    expect(screen.getByText('bold')).toBeTruthy();
    expect(screen.queryByText(DOCUMENT_CONTENT)).toBeNull();

    const leaves = collectTextLeaves(screen.getByTestId('artifact-fullscreen-markdown'));
    expect(leaves).toContain('Quarterly Plan');
    expect(leaves).toContain('Ship the mobile viewer');
    expect(leaves.some((leaf) => leaf.includes('# '))).toBe(false);
    expect(leaves.some((leaf) => leaf.includes('**'))).toBe(false);
    expect(leaves.some((leaf) => leaf.includes('```'))).toBe(false);
    expect(leaves.some((leaf) => leaf.startsWith('- '))).toBe(false);
  });

  it('locks the rendered document tree', () => {
    const { toJSON } = render(
      <ArtifactFullScreen artifact={documentArtifact} visible onClose={jest.fn()} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('keeps the monospace token path for code artifacts', () => {
    const screen = render(
      <ArtifactFullScreen artifact={codeArtifact} visible onClose={jest.fn()} />,
    );

    const codeNode = screen.getByText(CODE_CONTENT);
    expect(codeNode).toHaveStyle({ fontFamily: 'Menlo' });
  });
});

describe('Artifacts gallery preview markdown rendering (PAR-M08)', () => {
  beforeEach(() => {
    useArtifactStore.setState({
      artifacts: [],
      cloudArtifacts: [],
      cloudArtifactsOwnerId: null,
    });
  });

  it('renders a document artifact preview as formatted markdown', () => {
    useArtifactStore.setState({
      artifacts: [
        {
          id: 'gallery-doc',
          title: 'plan.md',
          kind: 'document',
          content: DOCUMENT_CONTENT,
          ageLabel: 'just now',
          sourceLabel: 'Local chat',
          accentColor: '#21808d',
          previewLines: ['# Quarterly Plan'],
          provenance: { scope: 'local' },
        },
      ],
    });

    const screen = render(<ArtifactsGalleryScreen initialArtifactId="gallery-doc" />);

    expect(screen.getByText('Quarterly Plan')).toBeTruthy();
    expect(screen.getByText('Ship the mobile viewer')).toBeTruthy();
    expect(screen.queryByText(DOCUMENT_CONTENT)).toBeNull();

    const leaves = collectTextLeaves(screen.getByTestId('artifact-preview-content'));
    expect(leaves).toContain('Quarterly Plan');
    expect(leaves).toContain('Ship the mobile viewer');
    expect(leaves.some((leaf) => leaf.includes('# '))).toBe(false);
    expect(leaves.some((leaf) => leaf.includes('**'))).toBe(false);
    expect(leaves.some((leaf) => leaf.includes('```'))).toBe(false);
    expect(leaves.some((leaf) => leaf.startsWith('- '))).toBe(false);
  });

  it('renders a code artifact preview in monospace', () => {
    useArtifactStore.setState({
      artifacts: [
        {
          id: 'gallery-code',
          title: 'main.py',
          kind: 'code',
          language: 'python',
          content: CODE_CONTENT,
          ageLabel: 'just now',
          sourceLabel: 'Local chat',
          accentColor: '#21808d',
          previewLines: ['def add(a, b):'],
          provenance: { scope: 'local' },
        },
      ],
    });

    const screen = render(<ArtifactsGalleryScreen initialArtifactId="gallery-code" />);

    expect(screen.getByTestId('artifact-preview-content')).toBeTruthy();
    expect(screen.getByText(CODE_CONTENT)).toHaveStyle({ fontFamily: 'Menlo' });
  });
});
