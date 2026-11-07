jest.mock('@/src/features/library/libraryClient', () => ({ fetchLibraryPage: jest.fn() }));

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fetchLibraryPage } from '@/src/features/library/libraryClient';
import { FileMentionPalette } from '@/src/features/chat/components/FileMentionPalette';

import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  activateCloudAccount,
  invalidateCloudAccount,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';

describe('FileMentionPalette', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('picker-owner');
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });
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
    render(<FileMentionPalette destinationKey="new-chat" query="rep" onSelect={onSelect} />);

    fireEvent.press(await screen.findByLabelText('Mention report-q3.pdf'));
    expect(fetchLibraryPage).toHaveBeenCalledWith({
      limit: 6,
      kind: ['image', 'file'],
      search: 'rep',
    });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'report-q3.pdf', assetId: 'a-1' }),
    );
  });

  it('hides loaded results immediately when the query or destination changes', async () => {
    (fetchLibraryPage as jest.Mock).mockResolvedValue({
      assets: [
        {
          id: 'old',
          kind: 'document',
          fileName: 'old.pdf',
          uri: '/api/files/old',
          mimeType: 'application/pdf',
        },
      ],
      hasMore: false,
      nextOffset: null,
    });
    const onSelect = jest.fn();
    const view = render(
      <FileMentionPalette destinationKey="first" query="old" onSelect={onSelect} />,
    );
    const row = await screen.findByLabelText('Mention old.pdf');
    const stalePress = row.props.onPress;
    view.rerender(<FileMentionPalette destinationKey="second" query="new" onSelect={onSelect} />);
    expect(screen.queryByLabelText('Mention old.pdf')).toBeNull();
    act(() => stalePress());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('revokes loaded rows on same-owner session invalidation', async () => {
    (fetchLibraryPage as jest.Mock).mockResolvedValue({
      assets: [
        {
          id: 'old',
          kind: 'document',
          fileName: 'old.pdf',
          uri: '/api/files/old',
          mimeType: 'application/pdf',
        },
      ],
      hasMore: false,
      nextOffset: null,
    });
    const onSelect = jest.fn();
    render(<FileMentionPalette destinationKey="new-chat" query="old" onSelect={onSelect} />);
    const row = await screen.findByLabelText('Mention old.pdf');
    const stalePress = row.props.onPress;
    act(() => {
      invalidateCloudAccount();
      activateCloudAccount('picker-owner');
    });
    expect(screen.queryByLabelText('Mention old.pdf')).toBeNull();
    act(() => stalePress());
    expect(onSelect).not.toHaveBeenCalled();
  });
});
