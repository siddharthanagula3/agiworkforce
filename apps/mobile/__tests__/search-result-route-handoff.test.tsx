import React from 'react';
import { render } from '@testing-library/react-native';

let mockParams: Record<string, string | string[] | undefined> = {};
const mockLibraryScreen = jest.fn().mockReturnValue(null);
const mockArtifactsScreen = jest.fn().mockReturnValue(null);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../src/features/library', () => ({
  LibraryScreen: (props: unknown) => mockLibraryScreen(props),
}));

jest.mock('../src/features/artifacts', () => ({
  ArtifactsGalleryScreen: (props: unknown) => mockArtifactsScreen(props),
}));

import LibraryRoute from '../app/(app)/library/index';
import ArtifactsRoute from '../app/(app)/artifacts/index';

describe('global-search result route handoff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it('passes the exact generated-image id to Library', () => {
    mockParams = { imageId: 'image-1' };
    render(<LibraryRoute />);

    expect(mockLibraryScreen).toHaveBeenCalledWith({ initialImageId: 'image-1' });
  });

  it('normalizes repeated artifact params and opens the first exact result', () => {
    mockParams = { artifactId: ['artifact-1', 'artifact-2'] };
    render(<ArtifactsRoute />);

    expect(mockArtifactsScreen).toHaveBeenCalledWith({ initialArtifactId: 'artifact-1' });
  });
});
