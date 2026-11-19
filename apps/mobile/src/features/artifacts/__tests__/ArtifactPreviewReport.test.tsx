/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, StyleSheet, type AlertButton, type StyleProp, type ViewStyle } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { actionMenuLabels, chooseActionMenuItem } from '@/test-utils/actionMenu';

const mockReportSheet = jest.fn();
const mockShareGeneratedImage = jest.fn();
const mockRunViewerImageAction = jest.fn();

jest.mock('@clerk/expo', () => ({ getClerkInstance: jest.fn() }));
jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@react-navigation/native', () => ({
  DrawerActions: { openDrawer: jest.fn(() => ({ type: 'OPEN_DRAWER' })) },
  useNavigation: () => ({ getParent: () => null, dispatch: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({ getParent: () => null, dispatch: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/api', () => ({
  ...jest.requireActual('@/services/api'),
  api: {
    ...jest.requireActual('@/services/api').api,
    post: jest.fn(),
    get: jest.fn().mockResolvedValue({ artifacts: [], workspace: null }),
  },
}));
jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));
jest.mock('@/services/fileCreation', () => ({
  ...jest.requireActual('@/services/fileCreation'),
  shareGeneratedImage: (...args: unknown[]) => mockShareGeneratedImage(...args),
}));
jest.mock('@/src/features/image/services/viewerImageActions', () => ({
  ...jest.requireActual('@/src/features/image/services/viewerImageActions'),
  runViewerImageAction: (...args: unknown[]) => mockRunViewerImageAction(...args),
}));
jest.mock('@/src/features/chat/components/GeneratedImage', () => ({
  GeneratedImage: () => null,
}));

import { API_URL } from '@/lib/constants';
import { ArtifactsGalleryScreen } from '../index';
import { useArtifactStore } from '../store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import type { MobileArtifact } from '../types';

const DERIVED_CODE: MobileArtifact = {
  id: 'derived-artifact-1',
  messageId: 'msg-7',
  title: 'Sorting helper',
  kind: 'code',
  language: 'ts',
  content: 'export function sortAll(values: number[]) {\n  return [...values].sort();\n}',
  ageLabel: 'just now',
  sourceLabel: 'Chat',
  accentColor: '#21808d',
  previewLines: ['export function sortAll'],
  provenance: { scope: 'cloud', ownerId: 'user-1' },
};

const IMAGE: MobileArtifact = {
  id: 'generated-image-msg-9',
  title: 'Image: a lighthouse at dusk',
  kind: 'image',
  language: 'PNG',
  content: '/api/files/3f9a0c1e-1b2c-4d5e-8f90-a1b2c3d4e5f6',
  ageLabel: 'just now',
  sourceLabel: 'AGI Cloud',
  accentColor: '#da7756',
  previewLines: ['a lighthouse at dusk'],
  provenance: { scope: 'cloud', ownerId: 'user-1' },
};

function pressInMoreMenu(screen: ReturnType<typeof render>, text: string) {
  fireEvent.press(screen.getByLabelText('More artifact actions'));
  expect(actionMenuLabels()).toContain(text);
  chooseActionMenuItem(text);
}

function pressInImageMoreMenu(screen: ReturnType<typeof render>, text: string) {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  fireEvent.press(screen.getByLabelText('More artifact actions'));
  const buttons = (alert.mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
  alert.mockRestore();
  const button = buttons.find((candidate) => candidate.text === text);
  expect(button).toBeDefined();
  React.act(() => button?.onPress?.());
}

function renderPreview(artifact: MobileArtifact) {
  useArtifactStore.setState({ artifacts: [artifact] });
  return render(<ArtifactsGalleryScreen initialArtifactId={artifact.id} />);
}

describe('reporting an artifact from its preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useArtifactStore.setState({ artifacts: [], cloudArtifacts: [], cloudArtifactsOwnerId: null });
  });

  it('opens the report sheet for the artifact, naming the message that made it', async () => {
    const screen = renderPreview(DERIVED_CODE);
    expect(mockReportSheet).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Report this artifact')).toBeNull();

    pressInMoreMenu(screen, 'Report this artifact');

    await waitFor(() =>
      expect(mockReportSheet).toHaveBeenLastCalledWith(
        expect.objectContaining({
          visible: true,
          title: 'Report this artifact',
          target: {
            messageId: 'msg-7',
            conversationId: 'artifact:derived-artifact-1',
            subject: { kind: 'artifact', id: 'derived-artifact-1' },
            contentExcerpt: expect.stringContaining('export function sortAll'),
          },
        }),
      ),
    );
    const { target } = mockReportSheet.mock.calls.at(-1)?.[0] as {
      target: { contentExcerpt: string };
    };
    expect(target.contentExcerpt.startsWith('Sorting helper')).toBe(true);
  });

  it('reports a generated image with its server asset address', async () => {
    const screen = renderPreview(IMAGE);
    pressInImageMoreMenu(screen, 'Report this image');

    await waitFor(() =>
      expect(mockReportSheet).toHaveBeenLastCalledWith(
        expect.objectContaining({
          title: 'Report this image',
          target: {
            messageId: 'artifact:generated-image-msg-9',
            conversationId: 'artifact:generated-image-msg-9',
            subject: { kind: 'image', id: 'generated-image-msg-9' },
            contentExcerpt: 'Image: a lighthouse at dusk',
            asset: { kind: 'image', url: `${API_URL.replace(/\/+$/, '')}${IMAGE.content}` },
          },
        }),
      ),
    );
  });

  function expectBareTarget(name: string, controlStyle: StyleProp<ViewStyle>) {
    const style = StyleSheet.flatten(controlStyle) ?? {};
    expect({ name, width: style.width, height: style.height }).toEqual({
      name,
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderColor).toBeUndefined();
  }

  it('opens an artifact on the same full-screen view as the chat, with bare 44 point controls', () => {
    const screen = renderPreview(DERIVED_CODE);
    expect(screen.getByTestId('artifact-fullscreen-source')).toBeTruthy();
    for (const label of [
      'Publish artifact to a public link',
      'Download artifact',
      'Copy content',
      'More artifact actions',
    ]) {
      expectBareTarget(label, screen.getByLabelText(label).props.style);
    }
    const close = StyleSheet.flatten(
      screen.getByTestId('chat.artifact.fullscreen.close').props.style,
    );
    expect(close.minWidth).toBeGreaterThanOrEqual(44);
    expect(close.minHeight).toBeGreaterThanOrEqual(44);
    expect(close.backgroundColor).toBeUndefined();
  });

  it('gives every image preview control a touch target of at least 44 by 44 points', () => {
    const screen = renderPreview(IMAGE);
    for (const testID of [
      'artifact-preview-close',
      'artifact-copy',
      'artifact-share',
      'artifact-more',
    ]) {
      expectBareTarget(testID, screen.getByTestId(testID).props.style);
    }
  });

  it('shares a generated image as the picture, named after it, not as its address', async () => {
    mockShareGeneratedImage.mockResolvedValue(undefined);
    const screen = renderPreview(IMAGE);

    fireEvent.press(screen.getByTestId('artifact-share'));

    await waitFor(() =>
      expect(mockShareGeneratedImage).toHaveBeenCalledWith(IMAGE.content, IMAGE.title),
    );
  });

  it('copies a generated image as the picture, not as its address', async () => {
    mockRunViewerImageAction.mockResolvedValue(undefined);
    const screen = renderPreview(IMAGE);
    expect(screen.getByTestId('artifact-copy').props.accessibilityLabel).toBe('Copy image');

    fireEvent.press(screen.getByTestId('artifact-copy'));

    await waitFor(() =>
      expect(screen.getByTestId('artifact-copy').props.accessibilityLabel).toBe('Copied'),
    );
    expect(mockRunViewerImageAction).toHaveBeenCalledWith('copy', IMAGE.content);
  });

  it('says when the image could not be copied and points to Share', async () => {
    mockRunViewerImageAction.mockRejectedValue(new Error('offline'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = renderPreview(IMAGE);

    fireEvent.press(screen.getByTestId('artifact-copy'));

    await waitFor(() =>
      expect(screen.getByTestId('artifact-copy').props.accessibilityLabel).toBe('Could not copy'),
    );
    expect(alert).toHaveBeenCalledWith(
      'Could not copy',
      'This image could not be copied. Try Share instead.',
    );
    alert.mockRestore();
  });

  it('drops the copy that sends people to another app', () => {
    const screen = renderPreview(DERIVED_CODE);
    expect(screen.queryByText(/Run or regenerate/)).toBeNull();
  });

  it('closes the image preview when a link opens another route under it', () => {
    const { NavigationContext } = require('expo-router/react-navigation');
    const listeners: Record<string, () => void> = {};
    const navigation = {
      addListener: jest.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
        return () => delete listeners[event];
      }),
    };
    useArtifactStore.setState({ artifacts: [IMAGE] });
    const screen = render(
      <NavigationContext.Provider value={navigation}>
        <ArtifactsGalleryScreen initialArtifactId={IMAGE.id} />
      </NavigationContext.Provider>,
    );
    expect(screen.getByTestId('artifact-preview-close')).toBeTruthy();

    React.act(() => listeners.blur?.());

    expect(screen.queryByTestId('artifact-preview-close')).toBeNull();
  });
});
