import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
let mockWindowWidth = 750;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWindowWidth, height: 1334, scale: 2, fontScale: 1 }),
}));

import { MANAGED_MEMORY_CITATIONS_HEADER } from '@agiworkforce/types';
import { MemoryUsedChip } from '@/src/features/chat/components/MemoryUsedChip';
import { READING_COLUMN_MAX_WIDTH } from '@/src/shared/layout/contentColumn';
import {
  messageMemoryCitations,
  readMemoryCitationsHeader,
} from '@/src/features/memory/services/memoryCitations';

function header(value: unknown): Pick<Headers, 'get'> {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  return { get: (name: string) => (name === MANAGED_MEMORY_CITATIONS_HEADER ? encoded : null) };
}

describe('memory citations from the gateway', () => {
  it('decodes the header the gateway sends, including non-ASCII excerpts', () => {
    expect(
      readMemoryCitationsHeader(
        header({ count: 2, memories: [{ id: 'm-1', excerpt: 'Lives in Zürich' }] }),
      ),
    ).toEqual({ count: 2, memories: [{ id: 'm-1', excerpt: 'Lives in Zürich' }] });
  });

  it('ignores a missing or unreadable header', () => {
    expect(readMemoryCitationsHeader({ get: () => null })).toBeNull();
    expect(readMemoryCitationsHeader({ get: () => '%%%not-base64' })).toBeNull();
    expect(readMemoryCitationsHeader(header({ count: 0, memories: [] }))).toBeNull();
  });

  it('reads citations stored on a synced answer', () => {
    expect(
      messageMemoryCitations({
        memoryCitations: { count: 1, memories: [{ id: 'm', excerpt: 'x' }] },
      }),
    ).toEqual({ count: 1, memories: [{ id: 'm', excerpt: 'x' }] });
    expect(messageMemoryCitations(undefined)).toBeNull();
  });
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderChip(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

describe('MemoryUsedChip', () => {
  beforeEach(() => {
    mockWindowWidth = 750;
  });

  it('shows how many memories shaped the answer and which ones', () => {
    renderChip(
      <MemoryUsedChip
        citations={{
          count: 3,
          memories: [
            { id: 'm-1', excerpt: 'Prefers metric units' },
            { id: 'm-2', excerpt: 'Works in logistics' },
          ],
        }}
      />,
    );

    expect(screen.getByText('Memory · 3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('memory-used-chip'));
    expect(screen.getByText('Prefers metric units')).toBeTruthy();
    expect(screen.getByText('Works in logistics')).toBeTruthy();
    expect(screen.getByText('1 more memory was used.')).toBeTruthy();
  });

  it('opens memory settings from the sheet', () => {
    renderChip(<MemoryUsedChip citations={{ count: 1, memories: [{ id: 'm', excerpt: 'x' }] }} />);
    fireEvent.press(screen.getByTestId('memory-used-chip'));
    fireEvent.press(screen.getByLabelText('Manage memory'));
    expect(useRouter().push).toHaveBeenCalledWith('/(app)/settings/memory');
  });

  it('stops the sheet at the reading column on a wide window', () => {
    renderChip(<MemoryUsedChip citations={{ count: 1, memories: [{ id: 'm', excerpt: 'x' }] }} />);
    fireEvent.press(screen.getByTestId('memory-used-chip'));

    expect(StyleSheet.flatten(screen.getByTestId('memory-used-sheet').props.style)).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
    });
  });

  function openSheet() {
    renderChip(<MemoryUsedChip citations={{ count: 1, memories: [{ id: 'm', excerpt: 'x' }] }} />);
    fireEvent.press(screen.getByTestId('memory-used-chip'));
  }

  it.each([[820], [1032], [1376]])(
    'dims the whole window and closes from beside the sheet at %d points',
    (width) => {
      mockWindowWidth = width;
      openSheet();

      const scrim = screen.getByTestId('memory-used-scrim', { includeHiddenElements: true });
      expect(StyleSheet.flatten(scrim.props.style)).toMatchObject({
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: expect.any(String),
      });
      expect(
        StyleSheet.flatten(
          screen.getByLabelText('Close', { includeHiddenElements: true }).props.style,
        ).backgroundColor,
      ).toBe(undefined);
      fireEvent.press(scrim);
      expect(screen.queryByTestId('memory-used-sheet')).toBeNull();
    },
  );

  it('leaves a phone window drawn exactly as before', () => {
    mockWindowWidth = 402;
    openSheet();

    expect(screen.queryByTestId('memory-used-scrim', { includeHiddenElements: true })).toBeNull();
    expect(
      StyleSheet.flatten(
        screen.getByLabelText('Close', { includeHiddenElements: true }).props.style,
      ),
    ).toMatchObject({
      flex: 1,
      backgroundColor: expect.any(String),
    });
  });
});
