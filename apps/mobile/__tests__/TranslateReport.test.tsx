/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, render } from '@testing-library/react-native';
import type { TranslateResult } from '../services/translateService';

const mockTranslate = jest.fn();
const mockReportSheet = jest.fn();

jest.mock('../src/features/chat/components/WorkModeSwitch', () => ({ HEADER_TEXT_SCALE_LIMIT: 2 }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const ReactModule = require('react');
    ReactModule.useEffect(callback, [callback]);
  },
}));
jest.mock('../src/features/model-picker/localModelRuntime', () => ({
  resolveLocalModelRef: jest.fn(),
}));
jest.mock('../services/translateService', () => ({
  ...jest.requireActual('../services/translateService'),
  translate: (...args: unknown[]) => mockTranslate(...args),
  translateBackendLabel: () => 'Fixture backend',
}));
jest.mock('@agiworkforce/local-llm', () => ({
  getDefaultModel: () => ({ displayName: 'Fixture' }),
  localGenerate: jest.fn(),
}));
jest.mock('../src/ui/theme', () => ({ useThemeColors: () => ({}) }));
jest.mock('../src/ui/theme/tokens', () => ({
  ...jest.requireActual('../src/ui/theme/tokens'),
  typeScale: {},
}));
jest.mock('../components/ui/Text', () => ({ Text: require('react-native').Text }));
jest.mock('../components/ui/PressableBox', () => ({
  PressableBox: require('react-native').Pressable,
}));
jest.mock('../src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));

import TranslateScreen from '../app/(app)/translate';

function result(backend: TranslateResult['backend']): TranslateResult {
  return {
    translatedText: 'नमस्ते दुनिया',
    sourceLanguage: 'en',
    targetLanguage: 'hi',
    backend,
    pairCached: false,
  };
}

async function translateWith(backend: TranslateResult['backend']) {
  mockTranslate.mockResolvedValueOnce(result(backend));
  const view = render(<TranslateScreen />);
  fireEvent.changeText(view.getByLabelText('Source text input'), 'hello world');
  await act(async () => {
    fireEvent.press(view.getByLabelText('Translate'));
  });
  expect(view.getByText('नमस्ते दुनिया')).toBeTruthy();
  return view;
}

beforeEach(() => jest.clearAllMocks());

test('a translation written by the on-device language model can be reported', async () => {
  const view = await translateWith('local_llm');

  fireEvent.press(view.getByLabelText('Report this translation'));

  expect(mockReportSheet).toHaveBeenLastCalledWith(
    expect.objectContaining({
      visible: true,
      title: 'Report this translation',
      target: {
        messageId: 'translation:en:hi',
        conversationId: 'translate',
        contentExcerpt: 'नमस्ते दुनिया',
        subject: { kind: 'translation', id: 'translation:en:hi' },
      },
    }),
  );
});

test.each(['apple_translate', 'mlkit_translate'] as const)(
  'a %s translation, which no generative model wrote, offers no report',
  async (backend) => {
    const view = await translateWith(backend);

    expect(view.queryByLabelText('Report this translation')).toBeNull();
    expect(view.getByLabelText('Copy translation')).toBeTruthy();
  },
);
