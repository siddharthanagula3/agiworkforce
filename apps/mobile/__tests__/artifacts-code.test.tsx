/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import type { Artifact } from '../types/chat';

const mockSummarizeGeneratedFileBundle = jest.fn((input: Record<string, unknown>) => ({
  title: (input.fallbackFileName as string | undefined) ?? 'main.py',
  fileName: (input.fallbackFileName as string | undefined) ?? 'main.py',
  kindLabel: 'Code',
  statusLabel: 'Ready',
  byteCountLabel: '2 KB',
  providerLabel: 'Local',
  sourceSurfaceLabel: 'Mobile',
  sourceSessionLabel: 'Session conv-1',
  checksumShort: 'abcdef123456',
  localOnly: true,
  primaryUri: (input.fallbackUri as string | undefined) ?? 'file:///tmp/main.py',
  privacyLabel: 'Local-only',
  privacyShortLabel: 'Local',
}));
const mockCopyToClipboard = jest.fn().mockResolvedValue(false);
const mockShareFile = jest.fn().mockResolvedValue(undefined);

jest.mock('@agiworkforce/types', () => ({
  summarizeGeneratedFileBundle: (input: Record<string, unknown>) =>
    mockSummarizeGeneratedFileBundle(input),
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}));

const mockExportToText = jest.fn().mockResolvedValue({ uri: 'file:///tmp/export.txt' });
const mockExportToMarkdown = jest.fn().mockResolvedValue({ uri: 'file:///tmp/export.md' });

jest.mock('@/services/fileCreation', () => ({
  shareFile: (uri: string) => mockShareFile(uri),
  exportToText: (...args: unknown[]) => mockExportToText(...args),
  exportToMarkdown: (...args: unknown[]) => mockExportToMarkdown(...args),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = ({ testID, ...props }: Record<string, unknown>) => (
    <View testID={testID} {...props} />
  );
  const iconFactory = (name: string) => (props: Record<string, unknown>) => (
    <Icon testID={`icon-${name}`} {...props} />
  );
  return {
    Code2: iconFactory('code2'),
    Mail: iconFactory('mail'),
    BookOpen: iconFactory('book'),
    Image: iconFactory('image'),
    FileText: iconFactory('file-text'),
    BarChart3: iconFactory('bar-chart'),
    ExternalLink: iconFactory('external-link'),
    Shield: iconFactory('shield'),
    X: iconFactory('x'),
    Copy: iconFactory('copy'),
    Check: iconFactory('check'),
    Share2: iconFactory('share'),
    RefreshCw: iconFactory('refresh-cw'),
    Eye: iconFactory('eye'),
    Code: iconFactory('code'),
    Download: iconFactory('download'),
    AlertTriangle: iconFactory('alert-triangle'),
    Archive: iconFactory('archive'),
    Clock: iconFactory('clock'),
    FileSpreadsheet: iconFactory('spreadsheet'),
    Layers: iconFactory('layers'),
    Loader: iconFactory('loader'),
    Lock: iconFactory('lock'),
    Presentation: iconFactory('presentation'),
    ShieldCheck: iconFactory('shield-check'),
  };
});

import { InlineArtifactCard } from '../src/features/chat/components/InlineArtifactCard';
import { ArtifactFullScreen } from '../src/features/chat/components/ArtifactFullScreen';

const CODE_CONTENT = ['def add(a, b):', '    return a + b', '', 'print(add(1, 2))'].join('\n');

const codeArtifact: Artifact = {
  id: 'artifact-code',
  type: 'code',
  title: 'main.py',
  language: 'python',
  content: CODE_CONTENT,
};

const generatedCodeArtifact: Artifact = {
  ...codeArtifact,
  computeSession: {
    id: 'session-local',
    ownerUserId: 'user-1',
    sourceSurface: 'mobile',
    privacyMode: 'local_only',
    providerMode: 'Local',
    status: 'completed',
    workdirUri: 'file:///tmp',
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  } as never,
  generatedFile: {
    id: 'file-main',
    computeSessionId: 'session-local',
    ownerUserId: 'user-1',
    sourceSurface: 'mobile',
    privacyMode: 'local_only',
    providerMode: 'Local',
    kind: 'other',
    fileName: 'main.py',
    mimeType: 'text/x-python',
    uri: 'file:///tmp/main.py',
    byteCount: 2048,
    checksumSha256: 'abcdef1234567890',
    previewDerivatives: [],
    createdAt: '2026-05-21T00:00:00.000Z',
  } as never,
  artifactManifest: {
    id: 'manifest-main',
    artifactId: 'artifact-code',
    type: 'generated_file_bundle',
    title: 'main.py',
    sourceSessionId: 'conv-1',
    computeSessionId: 'session-local',
    generatedFileIds: ['file-main'],
    privacyMode: 'local_only',
    providerMode: 'Local',
    storageScope: 'local_device',
    checksumSha256: 'abcdef1234567890',
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  } as never,
};

const generatedPdfArtifact: Artifact = {
  id: 'artifact-report',
  type: 'document',
  title: 'report.pdf',
  content: '',
  generatedFile: {
    id: 'file-report',
    computeSessionId: '',
    ownerUserId: '',
    sourceSurface: 'mobile',
    privacyMode: 'managed',
    providerMode: 'ManagedGateway',
    kind: 'pdf',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    uri: 'https://app.agi.example/api/files/file-report',
    byteCount: 2048,
    checksumSha256: 'abcdef1234567890',
    previewDerivatives: [],
    createdAt: '2026-08-13T00:00:00.000Z',
  },
  metadata: { status: 'completed' },
};

describe('mobile artifacts and code screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders code artifacts inline with a code preview and expands on press', () => {
    const onExpand = jest.fn();
    const { getByLabelText, getByText } = render(
      <InlineArtifactCard artifact={codeArtifact} onExpand={onExpand} />,
    );

    fireEvent.press(getByLabelText('Code: main.py'));

    expect(getByText('main.py')).toBeTruthy();
    expect(getByText('python')).toBeTruthy();
    expect(getByText('def add(a, b):\n    return a + b')).toBeTruthy();
    expect(onExpand).toHaveBeenCalledWith(codeArtifact);
  });

  it('shows generated-file provenance on inline code artifacts', () => {
    const { getByText } = render(
      <InlineArtifactCard artifact={generatedCodeArtifact} onExpand={jest.fn()} />,
    );

    expect(getByText('Local')).toBeTruthy();
    expect(getByText('Ready')).toBeTruthy();
    expect(getByText('Code')).toBeTruthy();
    expect(getByText('2 KB')).toBeTruthy();
    expect(getByText('Source: Mobile')).toBeTruthy();
  });

  it('uses generated-file status as the inline preview when no source text exists', () => {
    const { getByText } = render(
      <InlineArtifactCard artifact={generatedPdfArtifact} onExpand={jest.fn()} />,
    );

    expect(getByText('Ready · Code · 2 KB')).toBeTruthy();
  });

  it('renders a full-screen code artifact with copy and close actions', async () => {
    const onClose = jest.fn();
    const { getByLabelText, getByText } = render(
      <ArtifactFullScreen artifact={codeArtifact} visible onClose={onClose} />,
    );

    expect(getByText('main.py · PYTHON')).toBeTruthy();
    expect(getByText('python')).toBeTruthy();
    expect(getByText(CODE_CONTENT)).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByLabelText('Copy content'));
    });
    fireEvent.press(getByLabelText('Close'));

    expect(mockCopyToClipboard).toHaveBeenCalledWith(CODE_CONTENT);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shares generated local code files through the native file share path', async () => {
    const { getByLabelText, getByText } = render(
      <ArtifactFullScreen artifact={generatedCodeArtifact} visible onClose={jest.fn()} />,
    );

    expect(getByText(/Ready/)).toBeTruthy();
    expect(
      getByText('Local file. Sharing uses the native sheet and does not upload it to AGI cloud.'),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByLabelText('Share generated file'));
    });

    expect(mockShareFile).toHaveBeenCalledWith('file:///tmp/main.py');
  });

  it('does not offer empty Copy or fake Preview controls for a remote generated file', () => {
    const { getByLabelText, queryByLabelText } = render(
      <ArtifactFullScreen artifact={generatedPdfArtifact} visible onClose={jest.fn()} />,
    );

    expect(getByLabelText('Download artifact')).toBeTruthy();
    expect(getByLabelText('Share generated file')).toBeTruthy();
    expect(queryByLabelText('Copy content')).toBeNull();
    expect(queryByLabelText('Preview')).toBeNull();
  });
});
