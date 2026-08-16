/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { GeneratedFilePresentation } from '@agiworkforce/types';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.colors,
  };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return {
    AlertTriangle: factory('alert-triangle'),
    Archive: factory('archive'),
    Clock: factory('clock'),
    Code2: factory('code'),
    FileSpreadsheet: factory('spreadsheet'),
    FileText: factory('file-text'),
    Image: factory('image'),
    Layers: factory('layers'),
    Loader: factory('loader'),
    Lock: factory('lock'),
    Presentation: factory('presentation'),
    ShieldCheck: factory('shield-check'),
  };
});

import { GeneratedFileCard } from '@/src/features/chat/components/GeneratedFileCard';

function basePresentation(
  overrides: Partial<GeneratedFilePresentation> = {},
): GeneratedFilePresentation {
  return {
    title: 'design.pdf',
    fileName: 'design.pdf',
    kindLabel: 'PDF document',
    mimeType: 'application/pdf',
    status: 'completed',
    statusLabel: 'Completed',
    isRunning: false,
    isComplete: true,
    isFailed: false,
    privacyMode: 'local',
    privacyLabel: 'Local only',
    privacyShortLabel: 'Local',
    providerMode: 'Local',
    providerLabel: 'Local model',
    sourceSurface: 'mobile',
    sourceSurfaceLabel: 'Mobile',
    sourceSessionId: 'sess-1',
    sourceSessionLabel: 'Session sess-1',
    computeSessionId: 'cs-1',
    generatedFileId: 'gf-1',
    artifactManifestId: 'am-1',
    primaryUri: 'file:///tmp/design.pdf',
    previewUri: undefined,
    byteCountLabel: '128 KB',
    checksumShort: 'abcdef012345',
    retentionLabel: undefined,
    storageScope: 'local_device',
    canPreview: true,
    canDownload: true,
    canShare: false,
    localOnly: true,
    ...overrides,
  };
}

describe('Mobile GeneratedFileCard', () => {
  it('renders title, kind, size, checksum, and Completed status', () => {
    const { getByText, getByTestId } = render(
      <GeneratedFileCard presentation={basePresentation()} />,
    );
    expect(getByText('design.pdf')).toBeTruthy();
    expect(getByText('PDF document')).toBeTruthy();
    expect(getByText('Completed')).toBeTruthy();
    expect(getByText(/128 KB/)).toBeTruthy();
    expect(getByText(/abcdef012345/)).toBeTruthy();
    expect(getByTestId('generated-file-status-badge')).toBeTruthy();
  });

  it('uses the Loader icon when running', () => {
    const { getByText, queryByTestId } = render(
      <GeneratedFileCard
        presentation={basePresentation({
          status: 'running',
          statusLabel: 'Running',
          isRunning: true,
          isComplete: false,
        })}
      />,
    );
    expect(getByText('Running')).toBeTruthy();
    expect(queryByTestId('icon-loader')).toBeTruthy();
  });

  it('uses the AlertTriangle icon when failed', () => {
    const { getByText, queryByTestId } = render(
      <GeneratedFileCard
        presentation={basePresentation({
          status: 'failed',
          statusLabel: 'Failed',
          isRunning: false,
          isComplete: false,
          isFailed: true,
        })}
      />,
    );
    expect(getByText('Failed')).toBeTruthy();
    expect(queryByTestId('icon-alert-triangle')).toBeTruthy();
  });

  it('uses the Clock icon for unknown / pending', () => {
    const { getByText, queryByTestId } = render(
      <GeneratedFileCard
        presentation={basePresentation({
          status: 'unknown',
          statusLabel: 'Pending',
          isRunning: false,
          isComplete: false,
          isFailed: false,
        })}
      />,
    );
    expect(getByText('Pending')).toBeTruthy();
    expect(queryByTestId('icon-clock')).toBeTruthy();
  });

  it('renders privacy, provider, and source chips when present', () => {
    const { getByText } = render(<GeneratedFileCard presentation={basePresentation()} />);
    expect(getByText('Local')).toBeTruthy();
    expect(getByText('Local model')).toBeTruthy();
    expect(getByText('Mobile')).toBeTruthy();
  });

  it('omits the chips row when no chip labels exist', () => {
    const { queryByText } = render(
      <GeneratedFileCard
        presentation={basePresentation({
          privacyShortLabel: undefined,
          providerLabel: undefined,
          sourceSurfaceLabel: undefined,
        })}
      />,
    );
    expect(queryByText('Local')).toBeNull();
  });

  it('renders the local-only sharing note when localOnly is true', () => {
    const { getByText } = render(<GeneratedFileCard presentation={basePresentation()} />);
    expect(getByText(/Local file/)).toBeTruthy();
  });

  it('omits the local-only note when localOnly is false', () => {
    const { queryByText } = render(
      <GeneratedFileCard presentation={basePresentation({ localOnly: false })} />,
    );
    expect(queryByText(/Local file/)).toBeNull();
  });

  it('renders a preview thumbnail when previewUri is present', () => {
    const { UNSAFE_getByType } = render(
      <GeneratedFileCard
        presentation={basePresentation({
          previewUri: 'https://example.invalid/preview.png',
        })}
      />,
    );
    const RN = require('react-native');
    const img = UNSAFE_getByType(RN.Image);
    expect(img.props.source.uri).toBe('https://example.invalid/preview.png');
  });

  it('falls back to a kind icon when no previewUri is present', () => {
    const { queryByTestId } = render(<GeneratedFileCard presentation={basePresentation()} />);
    expect(queryByTestId('icon-file-text')).toBeTruthy();
  });

  it('fires onOpenSourceSession when the source-session label is pressed', () => {
    const onOpenSourceSession = jest.fn();
    const { getByText } = render(
      <GeneratedFileCard
        presentation={basePresentation()}
        onOpenSourceSession={onOpenSourceSession}
      />,
    );
    fireEvent.press(getByText('Session sess-1'));
    expect(onOpenSourceSession).toHaveBeenCalledTimes(1);
  });

  it('hides the source-session jump when no callback is provided', () => {
    const { queryByText } = render(<GeneratedFileCard presentation={basePresentation()} />);
    expect(queryByText('Session sess-1')).toBeNull();
  });
});
