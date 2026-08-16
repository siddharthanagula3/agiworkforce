/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';
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
    Code2: factory('code-2'),
    FileSpreadsheet: factory('file-spreadsheet'),
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

describe('Mobile GeneratedFileCard snapshots', () => {
  it('locks the completed Local PDF tree', () => {
    const { toJSON } = render(<GeneratedFileCard presentation={basePresentation()} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the running state tree', () => {
    const { toJSON } = render(
      <GeneratedFileCard
        presentation={basePresentation({
          status: 'running',
          statusLabel: 'Generating…',
          isRunning: true,
          isComplete: false,
        })}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the failed state tree', () => {
    const { toJSON } = render(
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
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the managed-cloud tree', () => {
    const { toJSON } = render(
      <GeneratedFileCard
        presentation={basePresentation({
          privacyMode: 'managed',
          privacyLabel: 'Managed retention',
          privacyShortLabel: 'Managed',
          providerMode: 'ManagedGateway',
          providerLabel: 'AGI Managed',
          localOnly: false,
        })}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
