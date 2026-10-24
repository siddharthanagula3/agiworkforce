import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MANAGED_MEMORY_CITATIONS_HEADER } from '@agiworkforce/types';
import { MemoryUsedChip } from '@/src/features/chat/components/MemoryUsedChip';
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
});
