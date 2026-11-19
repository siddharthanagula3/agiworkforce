/* eslint-disable @typescript-eslint/no-require-imports */
const mockDownloadGeneratedFile = jest.fn();
const mockShareFile = jest.fn().mockResolvedValue(undefined);
const mockImageFullScreen = jest.fn();

jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  shareFile: (uri: string) => mockShareFile(uri),
}));
jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-1', epoch: 1 }),
}));
jest.mock('@/src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: (path: string) => ({
    source: path
      ? { uri: `https://api.example.test${path}`, headers: { Authorization: 'Bearer t' } }
      : null,
    status: path ? 'ready' : 'invalid',
  }),
}));
jest.mock('@/src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: (props: Record<string, unknown>) => {
    mockImageFullScreen(props);
    return null;
  },
}));
jest.mock('@/src/features/chat/components/ArtifactAudienceChip', () => ({
  ArtifactAudienceChip: () => null,
}));
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { API_URL } from '@/lib/constants';
import { InlineArtifactCard } from '@/src/features/chat/components/InlineArtifactCard';
import type { Artifact } from '@/types/chat';

const BASE = API_URL.replace(/\/+$/, '');
const IMAGE_ID = '0b9c2f4e-7a1d-4c3b-9e8f-1a2b3c4d5e6f';

function generated(fileName: string, mimeType: string, kind: string, uri: string): Artifact {
  return {
    id: `file-${fileName}`,
    type: kind === 'image' ? 'image' : 'document',
    title: fileName,
    content: '',
    generatedFile: {
      id: `file-${fileName}`,
      computeSessionId: '',
      ownerUserId: '',
      sourceSurface: 'mobile',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      kind,
      fileName,
      mimeType,
      uri,
      byteCount: 2048,
      checksumSha256: '',
      previewDerivatives: [],
      createdAt: '2026-11-14T00:00:00.000Z',
    },
    metadata: { status: 'completed' },
  } as Artifact;
}

describe('InlineArtifactCard generated files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a tool-produced picture as the picture, with no name or badge', () => {
    const onExpand = jest.fn();
    render(
      <InlineArtifactCard
        artifact={generated('chart.png', 'image/png', 'image', `${BASE}/api/files/${IMAGE_ID}`)}
        onExpand={onExpand}
      />,
    );

    expect(screen.getByTestId('stored-image')).toBeTruthy();
    expect(screen.queryByText('chart.png')).toBeNull();
    expect(screen.queryByText('Image')).toBeNull();
    expect(onExpand).not.toHaveBeenCalled();
  });

  it('opens the picture full screen through the authorised path', () => {
    render(
      <InlineArtifactCard
        artifact={generated('chart.png', 'image/png', 'image', `${BASE}/api/files/${IMAGE_ID}`)}
        onExpand={jest.fn()}
      />,
    );

    expect(mockImageFullScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: false }),
    );
    fireEvent.press(screen.getByTestId('generated-image-card'));

    expect(mockImageFullScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        imageUrl: `/api/files/${IMAGE_ID}`,
        kind: 'attachment',
        name: 'chart.png',
      }),
    );
  });

  it('hands the full-screen viewer the picture type when the file name has no extension', () => {
    render(
      <InlineArtifactCard
        artifact={generated('diagram', 'image/svg+xml', 'image', `${BASE}/api/files/${IMAGE_ID}`)}
        onExpand={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('generated-image-card'));

    expect(mockImageFullScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: true, name: 'diagram', mimeType: 'image/svg+xml' }),
    );
  });

  it('keeps a picture from another site as a card rather than loading it', () => {
    render(
      <InlineArtifactCard
        artifact={generated('remote.png', 'image/png', 'image', 'https://media.example/remote.png')}
        onExpand={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('stored-image')).toBeNull();
    expect(screen.getByText('remote.png')).toBeTruthy();
  });

  it('hands any other generated file to the share sheet in one tap, by its own name', async () => {
    const url = `${BASE}/api/files/report-1`;
    mockDownloadGeneratedFile.mockResolvedValue('file:///exports/report.pdf');
    const onExpand = jest.fn();
    render(
      <InlineArtifactCard
        artifact={generated('report.pdf', 'application/pdf', 'pdf', url)}
        onExpand={onExpand}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Share report.pdf'));
    });

    expect(mockDownloadGeneratedFile).toHaveBeenCalledWith(url, 'report.pdf');
    expect(mockShareFile).toHaveBeenCalledWith('file:///exports/report.pdf');
    expect(onExpand).not.toHaveBeenCalled();
  });
});

describe('InlineArtifactCard file details', () => {
  it('shows a made file with one line of details and no kind or storage badge', () => {
    const file = generated('fruits.csv', 'text/csv', 'csv', `${BASE}/api/files/fruits-1`);
    render(
      <InlineArtifactCard
        artifact={{ ...file, generatedFile: { ...file.generatedFile!, byteCount: 129 } }}
        onExpand={jest.fn()}
      />,
    );

    expect(screen.getByText('fruits.csv')).toBeTruthy();
    expect(screen.getAllByText(/Ready/)).toHaveLength(1);
    expect(screen.getByTestId('generated-file-meta').props.children).toBe('Ready · CSV · 129 B');
    expect(screen.queryByText('Cloud')).toBeNull();
    expect(screen.queryByText('Document')).toBeNull();
  });
});
