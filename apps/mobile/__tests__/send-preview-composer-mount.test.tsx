/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * SIX-20 — the payload disclosure must actually be on screen.
 *
 * `SendPreview` was built and unit-tested but had zero production imports, so
 * Mobile — a Local / Managed-Cloud dual-trust surface — shipped no "what will
 * be sent" preview at all. These tests assert the mounted behaviour:
 *
 *   - the composer renders it above the input on both chat screens;
 *   - it names the boundary the send will actually use, not the stale model
 *     selection;
 *   - expanding it discloses the live payload (draft size, staged attachments).
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Composer-level: ChatInput joins the host's route with the live draft.
// ---------------------------------------------------------------------------

const mockSelectedModel = 'qwen3-4b-instruct-2507';
jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ selectedModel: mockSelectedModel, setModel: jest.fn() }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : Icon) });
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: { getString: jest.fn().mockReturnValue(undefined), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { ChatInput } from '../src/features/chat/components/ChatInput';

const CHAT_SCREENS = [
  join(__dirname, '..', 'app', '(app)', '(tabs)', 'chat.tsx'),
  join(__dirname, '..', 'app', '(app)', 'chat', '[id].tsx'),
];

describe('ChatInput payload disclosure', () => {
  it('renders nothing when the host supplies no route (e.g. the Compare screen)', () => {
    const { queryByTestId } = render(<ChatInput onSend={jest.fn()} />);
    expect(queryByTestId('send-preview')).toBeNull();
  });

  it('shows a Local destination above the composer for a Local route', () => {
    const { getByTestId, getByText } = render(
      <ChatInput
        onSend={jest.fn()}
        sendPreview={{ providerMode: 'Local', modelLabel: 'AGI Standard' }}
      />,
    );

    expect(getByTestId('send-preview')).toBeTruthy();
    expect(getByText('Stays on device')).toBeTruthy();
  });

  it('shows a Cloud destination for a managed route', () => {
    const { getByText } = render(
      <ChatInput
        onSend={jest.fn()}
        sendPreview={{ providerMode: 'ManagedGateway', modelLabel: 'GPT-5.6 Luna' }}
      />,
    );

    expect(getByText('Sent to AGI Cloud')).toBeTruthy();
  });

  it('discloses the model, privacy label and payload size on expand', async () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <ChatInput
        onSend={jest.fn()}
        sendPreview={{ providerMode: 'ManagedGateway', modelLabel: 'GPT-5.6 Luna' }}
      />,
    );

    expect(queryByTestId('send-preview-panel')).toBeNull();

    const input = getByTestId('chat.composer.input');
    await act(async () => {
      fireEvent.changeText(input, 'hello there');
    });
    await act(async () => {
      fireEvent.press(getByTestId('send-preview-toggle'));
    });

    await waitFor(() => expect(getByTestId('send-preview-panel')).toBeTruthy());
    expect(getByText('Sent through AGI Managed gateway')).toBeTruthy();
    expect(getByText('GPT-5.6 Luna')).toBeTruthy();
    // The live draft length is part of the disclosure, not a static blurb.
    expect(getByTestId('send-preview-details')).toBeTruthy();
    expect(getByText('11 chars')).toBeTruthy();
  });

  it('counts the files staged to leave the device', async () => {
    const attachRef =
      React.createRef<import('../src/features/chat/components/ChatInput').ChatInputHandle>();
    const { getByTestId, getByText } = render(
      <ChatInput
        onSend={jest.fn()}
        attachRef={attachRef}
        sendPreview={{ providerMode: 'ManagedGateway', modelLabel: 'GPT-5.6 Luna' }}
      />,
    );

    await act(async () => {
      attachRef.current?.addAttachments([
        {
          id: 'a1',
          uri: 'file:///notes.pdf',
          mimeType: 'application/pdf',
          fileName: 'notes.pdf',
          fileSize: 2048,
        },
      ]);
    });
    await act(async () => {
      fireEvent.press(getByTestId('send-preview-toggle'));
    });

    await waitFor(() => expect(getByTestId('send-preview-panel')).toBeTruthy());
    expect(getByText('1 attachment (pdf)')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Screen-level wiring: both chat screens hand the composer a route.
// ---------------------------------------------------------------------------

describe('both chat screens mount the disclosure', () => {
  it.each(CHAT_SCREENS)('%s passes sendPreview to its composer', (screenPath) => {
    const source = readFileSync(screenPath, 'utf8');
    expect(source).toContain('sendPreview={sendPreviewInput}');
    expect(source).toContain('summarizeSendPreview(sendPreviewInput)');
  });

  it('the new-chat screen describes the corrected model, not the stale selection', () => {
    const source = readFileSync(CHAT_SCREENS[0]!, 'utf8');
    // handleSend and the disclosure must read the same resolved value.
    expect(source).toContain('const modelForSend = useMemo(');
    expect(source).toContain('modelId: modelForSend');
    expect(source).toContain('getShortDisplayName(modelForSend, subscriptionTier)');
  });

  it('the conversation screen follows the conversation boundary, not the app toggle', () => {
    const source = readFileSync(CHAT_SCREENS[1]!, 'utf8');
    expect(source).toContain("providerMode: (conversationExecutionMode === 'cloud'");
  });
});
