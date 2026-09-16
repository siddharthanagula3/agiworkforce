/* eslint-disable @typescript-eslint/no-require-imports */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { NativeModules } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

const rootLayoutSource = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');

let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

jest.mock('expo-camera', () => {
  const React = require('react') as typeof import('react');
  return {
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    CameraView: React.forwardRef((_props: object, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        takePictureAsync: async () => ({ uri: 'file:///capture.jpg' }),
      }));
      return null;
    }),
  };
});

jest.mock('../stores/chatStore', () => ({
  useChatStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({
      createConversation: jest.fn().mockResolvedValue('conv-1'),
      sendMessage: jest.fn().mockResolvedValue(true),
      currentConversationId: null,
      messages: {},
    }),
  useChatMessageStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({ createConversation: jest.fn().mockResolvedValue('conv-1') }),
  useChatExecutionStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({ sendMessage: jest.fn().mockResolvedValue(true) }),
}));

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({ selectedModel: 'local-model' }),
}));

describe('the App Intent dispatcher forwards each payload', () => {
  it('passes the scanned image, the analysed image with its question, and the audio file', () => {
    expect(rootLayoutSource).toContain("pathname: '/(app)/scan' as const");
    expect(rootLayoutSource).toContain("pathname: '/(app)/camera' as const");
    expect(rootLayoutSource).toContain("pathname: '/(app)/voice' as const");
    expect(rootLayoutSource).toContain("const audioUri = getParam('audioUri')");
    expect(rootLayoutSource).toContain("const question = getParam('question')");
  });

  it('no longer routes those three verbs to a bare push that drops the payload', () => {
    for (const [verb, route] of [
      ['scan', 'scan'],
      ['analyze_image', 'camera'],
      ['transcribe', 'voice'],
    ]) {
      const caseBody = rootLayoutSource.split(`case '${verb}':`)[1]?.slice(0, 400) ?? '';
      expect(caseBody).not.toContain(`router.push('/(app)/${route}'`);
    }
  });
});

describe('Analyze Image lands on the camera screen with its payload', () => {
  beforeEach(() => {
    mockSearchParams = { imageUri: 'file:///shared/cat.jpg', question: 'What breed is this?' };
  });

  it('opens straight into the preview for the supplied image with the question prefilled', async () => {
    const CameraScreen = require('../app/(app)/camera').default;
    const { getByLabelText } = render(<CameraScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByLabelText('Image prompt').props.value).toBe('What breed is this?');
    expect(getByLabelText('Send to AI')).toBeTruthy();
  });
});

describe('Scan lands on the scan screen with its payload', () => {
  const mockRecognize = jest.fn();

  beforeEach(() => {
    mockSearchParams = { imageUri: 'file:///shared/receipt.jpg' };
    mockRecognize.mockReset();
    mockRecognize.mockResolvedValue({ text: 'TOTAL 12.40', regions: [] });
    NativeModules.AGIVisionOCR = { recognizeText: mockRecognize };
  });

  it('runs recognition on the supplied image instead of waiting for a capture', async () => {
    const ScanScreen = require('../app/(app)/scan').default;
    render(<ScanScreen />);
    await waitFor(() => expect(mockRecognize).toHaveBeenCalledWith('file:///shared/receipt.jpg'));
  });
});
