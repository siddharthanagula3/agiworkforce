jest.mock('@/src/features/library/libraryClient', () => ({ fetchLibraryPage: jest.fn() }));

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { fetchLibraryPage } from '@/src/features/library/libraryClient';
import { FileMentionPalette } from '@/src/features/chat/components/FileMentionPalette';

describe('FileMentionPalette', () => {
  it('searches the Library for the typed name and attaches the chosen file', async () => {
    (fetchLibraryPage as jest.Mock).mockResolvedValue({
      assets: [
        {
          id: 'a-1',
          kind: 'file',
          fileName: 'report-q3.pdf',
          uri: 'https://agiworkforce.com/api/files/a-1',
          mimeType: 'application/pdf',
          byteCount: 2048,
        },
      ],
      hasMore: false,
      nextOffset: null,
    });
    const onSelect = jest.fn();
    render(<FileMentionPalette query="rep" onSelect={onSelect} />);

    fireEvent.press(await screen.findByLabelText('Mention report-q3.pdf'));
    expect(fetchLibraryPage).toHaveBeenCalledWith({ limit: 6, search: 'rep' });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'report-q3.pdf', assetId: 'a-1' }),
    );
  });
});
