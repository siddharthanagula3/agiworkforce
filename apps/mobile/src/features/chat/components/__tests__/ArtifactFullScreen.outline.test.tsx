import { fireEvent, render } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';

jest.mock('@clerk/expo', () => ({ getClerkInstance: jest.fn() }));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/fileCreation', () => ({
  shareFile: jest.fn(),
  exportToText: jest.fn(),
  exportToMarkdown: jest.fn(),
  downloadGeneratedFile: jest.fn(),
  downloadFailureMessage: (_error: unknown, fallback: string) => fallback,
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('@/src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => null,
}));

import { ArtifactFullScreen } from '../ArtifactFullScreen';
import type { Artifact } from '@/types/chat';

const SECTION_NAMES = Array.from({ length: 9 }, (_, index) => `Part ${index + 1}`);
const LONG_DOCUMENT = [
  '# Field guide',
  '',
  'Opening notes.',
  '',
  ...SECTION_NAMES.flatMap((name) => [`## ${name}`, '', `Notes for ${name.toLowerCase()}.`, '']),
].join('\n');

function documentArtifact(content: string): Artifact {
  return { id: 'artifact-guide', type: 'document', title: 'Field guide', content };
}

const scrollTo = ScrollView.prototype.scrollTo as jest.Mock;

beforeEach(() => {
  scrollTo.mockClear();
});

describe('the outline of a long document', () => {
  it('lists every heading under a closed Outline control', () => {
    const screen = render(
      <ArtifactFullScreen artifact={documentArtifact(LONG_DOCUMENT)} visible onClose={jest.fn()} />,
    );

    const outline = screen.getByRole('button', { name: 'Outline, 10 sections' });
    expect(outline.props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByTestId('artifact-document-outline-list')).toBeNull();

    fireEvent.press(outline);

    expect(
      screen.getByRole('button', { name: 'Outline, 10 sections' }).props.accessibilityState,
    ).toEqual({ expanded: true });
    expect(
      screen.getAllByRole('button', { name: /^Go to / }).map((row) => row.props.accessibilityLabel),
    ).toEqual(['Go to Field guide', ...SECTION_NAMES.map((name) => `Go to ${name}`)]);
  });

  it('scrolls the document to the heading a person picks', () => {
    const screen = render(
      <ArtifactFullScreen artifact={documentArtifact(LONG_DOCUMENT)} visible onClose={jest.fn()} />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Outline, 10 sections' }));

    fireEvent(screen.getByTestId('artifact-fullscreen-markdown'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 120, width: 360, height: 2400 } },
    });
    fireEvent(screen.getByRole('header', { name: 'Part 7' }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 1500, width: 360, height: 28 } },
    });

    fireEvent.press(screen.getByRole('button', { name: 'Go to Part 7' }));

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 1612, animated: true });
  });

  it('gives each outline control a 44 point tap area', () => {
    const screen = render(
      <ArtifactFullScreen artifact={documentArtifact(LONG_DOCUMENT)} visible onClose={jest.fn()} />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Outline, 10 sections' }));

    for (const control of [
      screen.getByRole('button', { name: 'Outline, 10 sections' }),
      ...screen.getAllByRole('button', { name: /^Go to / }),
    ]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minHeight).toBe(44);
      expect(style.backgroundColor).toBeUndefined();
      expect(style.borderWidth).toBeUndefined();
    }
  });

  it('leaves the outline out of a short document', () => {
    const screen = render(
      <ArtifactFullScreen
        artifact={documentArtifact('# Note\n\n## One\n\nText.')}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('artifact-document-outline')).toBeNull();
  });

  it('ignores headings inside a code block', () => {
    const screen = render(
      <ArtifactFullScreen
        artifact={documentArtifact('# Note\n\n```sh\n# one\n# two\n```\n\n## Two\n')}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('artifact-document-outline')).toBeNull();
  });
});
