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

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

import { GeneratedFileCard } from '@/src/features/chat/components/GeneratedFileCard';

function presentation(overrides: Partial<GeneratedFilePresentation>): GeneratedFilePresentation {
  return {
    title: 'notes.md',
    fileName: 'notes.md',
    kindLabel: 'Markdown',
    mimeType: 'text/markdown',
    status: 'completed',
    statusLabel: 'Completed',
    isRunning: false,
    isComplete: true,
    isFailed: false,
    byteCountLabel: '4.2 KB',
    storageScope: 'local_device',
    canPreview: true,
    canDownload: true,
    canShare: false,
    localOnly: false,
    ...overrides,
  } as GeneratedFilePresentation;
}

describe('GeneratedFileCard format suffix', () => {
  it('shows the file format after the kind and keeps the byte count after it', () => {
    const { getByText } = render(<GeneratedFileCard presentation={presentation({})} />);

    expect(getByText('Markdown')).toBeTruthy();
    expect(getByText('· MD')).toBeTruthy();
    expect(getByText('· 4.2 KB')).toBeTruthy();
  });

  it('does not repeat a format the kind label already names', () => {
    const { queryByText } = render(
      <GeneratedFileCard
        presentation={presentation({
          title: 'design.pdf',
          fileName: 'design.pdf',
          kindLabel: 'PDF document',
          mimeType: 'application/pdf',
        })}
      />,
    );

    expect(queryByText('· PDF')).toBeNull();
  });

  it('shows no suffix for a file name without an extension', () => {
    const { queryByText } = render(
      <GeneratedFileCard
        presentation={presentation({ fileName: 'generated-file', kindLabel: 'File' })}
      />,
    );

    expect(queryByText(/^· [A-Z-]+$/)).toBeNull();
  });
});
