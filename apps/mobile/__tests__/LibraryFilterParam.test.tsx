import React from 'react';
import { render } from '@testing-library/react-native';

let mockParams: Record<string, string | string[] | undefined> = {};
const mockLibraryScreen = jest.fn().mockReturnValue(null);

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../src/features/library', () => ({
  LibraryScreen: (props: unknown) => mockLibraryScreen(props),
}));

import LibraryRoute from '../app/(app)/library/index';

describe('Library route filter parameter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it('hands the filter to the Library screen', () => {
    mockParams = { filter: 'images' };
    render(<LibraryRoute />);

    expect(mockLibraryScreen).toHaveBeenCalledWith({ initialFilter: 'images' });
  });

  it('uses the first value of a repeated filter', () => {
    mockParams = { filter: ['documents', 'images'] };
    render(<LibraryRoute />);

    expect(mockLibraryScreen).toHaveBeenCalledWith({ initialFilter: 'documents' });
  });

  it('passes both the image id and the filter', () => {
    mockParams = { imageId: 'image-1', filter: 'images' };
    render(<LibraryRoute />);

    expect(mockLibraryScreen).toHaveBeenCalledWith({
      initialImageId: 'image-1',
      initialFilter: 'images',
    });
  });
});
