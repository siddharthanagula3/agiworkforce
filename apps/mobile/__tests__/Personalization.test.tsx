/* eslint-disable @typescript-eslint/no-require-imports */

import { isValidElement, type ReactNode } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { act, render, fireEvent } from '@testing-library/react-native';
import { PRODUCT_BRAND } from '@agiworkforce/types';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    navigate: mockNavigate,
    canGoBack: mockCanGoBack,
    back: mockBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    ArrowLeft: icon,
    Check: icon,
    ChevronsUpDown: icon,
    Sun: icon,
    Moon: icon,
    Monitor: icon,
  };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockOpenInAppBrowser = jest.fn(async (_url: string) => true);
jest.mock('../lib/safeOpenURL', () => ({
  openInAppBrowser: (url: string) => mockOpenInAppBrowser(url),
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

import PersonalizationScreen from '../app/(app)/settings/personalization';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { API_URL } from '../lib/constants';
import {
  MULTILINE_FIELD_MAX_HEIGHT,
  fieldRevealOffset,
} from '../src/features/settings/personalization/personalizationFieldReveal';

const defaultPersonalization = {
  fullName: '',
  nickname: '',
  occupation: '',
  instructions: '',
  style: 'default' as const,
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
};

function resetSettingsStore() {
  useLocalSettingsStore.setState({ personalization: defaultPersonalization });
  useCloudSettingsStore.setState({
    personalization: defaultPersonalization,
    settingsUpdatedAt: null,
  });
}

describe('Personalization page', () => {
  beforeEach(() => {
    resetSettingsStore();
    useAuthStore.setState({ clerkUserId: null });
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('renders the Personalization header', () => {
    const { getByText } = render(<PersonalizationScreen />);
    expect(getByText('Personalization')).toBeTruthy();
  });

  it('renders 4 text input labels', () => {
    const { getByText } = render(<PersonalizationScreen />);

    expect(getByText('Full Name')).toBeTruthy();
    expect(getByText('Nickname')).toBeTruthy();
    expect(getByText('Occupation')).toBeTruthy();
    expect(getByText('Custom Instructions')).toBeTruthy();
  });

  it('shows the four characteristics as Less, Default or More levels from the stored scores', () => {
    useLocalSettingsStore.setState({
      personalization: {
        ...defaultPersonalization,
        warmth: 20,
        enthusiasm: 63,
        headersLists: 80,
        emoji: 30,
      },
    });
    const { getByLabelText, queryByText } = render(<PersonalizationScreen />);

    expect(getByLabelText('Warmth: Less')).toBeTruthy();
    expect(getByLabelText('Enthusiasm: Default')).toBeTruthy();
    expect(getByLabelText('Headers and lists: More')).toBeTruthy();
    expect(getByLabelText('Emoji: Less')).toBeTruthy();
    expect(queryByText('Cold')).toBeNull();
  });

  it('picks a level from the sheet and saves its score', () => {
    const { getByLabelText, queryByLabelText } = render(<PersonalizationScreen />);

    expect(getByLabelText('Save personalization settings')).toBeDisabled();
    fireEvent.press(getByLabelText('Warmth: Default'));
    expect(getByLabelText('Warmth Default')).toBeSelected();
    fireEvent.press(getByLabelText('Warmth More'));

    expect(queryByLabelText('Warmth More')).toBeNull();
    expect(getByLabelText('Warmth: More')).toBeTruthy();
    fireEvent.press(getByLabelText('Save personalization settings'));
    expect(useLocalSettingsStore.getState().personalization.warmth).toBe(80);
  });

  it('replaces an in-between stored score only for the trait whose level is picked', () => {
    useLocalSettingsStore.setState({
      personalization: { ...defaultPersonalization, emoji: 63 },
    });
    const { getByLabelText } = render(<PersonalizationScreen />);

    fireEvent.press(getByLabelText('Emoji: Default'));
    fireEvent.press(getByLabelText('Emoji Less'));
    fireEvent.press(getByLabelText('Save personalization settings'));

    const saved = useLocalSettingsStore.getState().personalization;
    expect(saved.emoji).toBe(20);
    expect(saved.warmth).toBe(50);
  });

  it('pre-fills text inputs from settingsStore', () => {
    useLocalSettingsStore.setState({
      personalization: {
        fullName: 'John Doe',
        nickname: 'JD',
        occupation: 'Engineer',
        instructions: 'Be brief',
        style: 'default',
        warmth: 50,
        enthusiasm: 50,
        headersLists: 50,
        emoji: 50,
      },
    });

    const { getByDisplayValue } = render(<PersonalizationScreen />);

    expect(getByDisplayValue('John Doe')).toBeTruthy();
    expect(getByDisplayValue('JD')).toBeTruthy();
    expect(getByDisplayValue('Engineer')).toBeTruthy();
    expect(getByDisplayValue('Be brief')).toBeTruthy();
  });

  it('Save button commits text changes to settingsStore', () => {
    const { getByPlaceholderText, getByLabelText } = render(<PersonalizationScreen />);

    const nameInput = getByPlaceholderText('Your full name');
    fireEvent.changeText(nameInput, 'Alice Wonder');

    fireEvent.press(getByLabelText('Save personalization settings'));

    const { personalization } = useLocalSettingsStore.getState();
    expect(personalization.fullName).toBe('Alice Wonder');
  });

  it('Save pops back to whichever screen pushed it', () => {
    mockCanGoBack.mockReturnValue(true);
    const { getByLabelText, getByPlaceholderText } = render(<PersonalizationScreen />);
    fireEvent.changeText(getByPlaceholderText('Your full name'), 'Alice');

    fireEvent.press(getByLabelText('Save personalization settings'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Save falls back to the Settings root only on a deep link with no history', () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByLabelText, getByPlaceholderText } = render(<PersonalizationScreen />);
    fireEvent.changeText(getByPlaceholderText('Your full name'), 'Alice');

    fireEvent.press(getByLabelText('Save personalization settings'));

    expect(mockNavigate).toHaveBeenCalledWith('/(app)/settings');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('renders the Save button', () => {
    const { getByText } = render(<PersonalizationScreen />);

    const saveText = getByText('Save');
    expect(saveText).toBeTruthy();
  });

  it('keeps Save disabled until a field changes and again once the edit is undone', () => {
    const { getByLabelText, getByPlaceholderText } = render(<PersonalizationScreen />);
    const save = () => getByLabelText('Save personalization settings');

    expect(save()).toBeDisabled();
    fireEvent.press(save());
    expect(mockBack).not.toHaveBeenCalled();

    fireEvent.changeText(getByPlaceholderText('What should AGI call you?'), 'Al');
    expect(save()).toBeEnabled();

    fireEvent.changeText(getByPlaceholderText('What should AGI call you?'), '');
    expect(save()).toBeDisabled();
  });

  it('enables Save after Reset response style even when every field is already default', () => {
    const { getByLabelText } = render(<PersonalizationScreen />);

    expect(getByLabelText('Save personalization settings')).toBeDisabled();
    fireEvent.press(getByLabelText('Reset response style'));
    expect(getByLabelText('Save personalization settings')).toBeEnabled();
  });

  it('blocks saving a cleared full name with an inline error', () => {
    useLocalSettingsStore.setState({
      personalization: { ...defaultPersonalization, fullName: 'John Doe', nickname: 'JD' },
    });
    const { getByLabelText, getByPlaceholderText, getByText, queryByText } = render(
      <PersonalizationScreen />,
    );

    expect(queryByText('Enter your full name.')).toBeNull();
    fireEvent.changeText(getByPlaceholderText('Your full name'), '   ');

    expect(getByText('Enter your full name.')).toBeTruthy();
    expect(getByLabelText('Save personalization settings')).toBeDisabled();
    fireEvent.press(getByLabelText('Save personalization settings'));
    expect(useLocalSettingsStore.getState().personalization.fullName).toBe('John Doe');
    expect(mockBack).not.toHaveBeenCalled();

    fireEvent.changeText(getByPlaceholderText('Your full name'), 'Jane Doe');
    expect(queryByText('Enter your full name.')).toBeNull();
    fireEvent.press(getByLabelText('Save personalization settings'));
    expect(useLocalSettingsStore.getState().personalization.fullName).toBe('Jane Doe');
  });

  it('lets a user who never set a name save other changes', () => {
    const { getByLabelText, getByPlaceholderText, queryByText } = render(<PersonalizationScreen />);

    fireEvent.changeText(getByPlaceholderText('What should AGI call you?'), 'Sam');

    expect(queryByText('Enter your full name.')).toBeNull();
    fireEvent.press(getByLabelText('Save personalization settings'));
    expect(useLocalSettingsStore.getState().personalization.nickname).toBe('Sam');
  });

  it('explains the nickname and links the instructions helper to the acceptable use policy', () => {
    const { getByText } = render(<PersonalizationScreen />);

    expect(getByText(`${PRODUCT_BRAND} uses your nickname in chat.`)).toBeTruthy();
    fireEvent.press(getByText('acceptable use policy'));

    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(
      `${new URL('/acceptable-use', API_URL).toString()}?from=mobile`,
    );
  });

  it('renders the Response Style section header', () => {
    const { getByText } = render(<PersonalizationScreen />);
    expect(getByText('Response Style')).toBeTruthy();
  });

  it('resyncs editable fields (not stale scope-crossed data) when the app mode changes under a mounted screen', () => {
    useLocalSettingsStore.setState({
      personalization: { ...defaultPersonalization, fullName: 'Local Name' },
    });
    useCloudSettingsStore.setState({
      personalization: { ...defaultPersonalization, fullName: 'Cloud Name' },
      settingsUpdatedAt: null,
    });

    const { getByDisplayValue, getByText } = render(<PersonalizationScreen />);
    expect(getByDisplayValue('Local Name')).toBeTruthy();
    expect(getByText('Personalization')).toBeTruthy();

    act(() => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
    });

    expect(getByDisplayValue('Cloud Name')).toBeTruthy();
    expect(getByText('Cloud Personalization')).toBeTruthy();
  });

  it('hydrates a pristine Cloud draft when the first server pull arrives after mount', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByDisplayValue } = render(<PersonalizationScreen />);

    act(() => {
      useCloudSettingsStore.setState({
        personalization: {
          ...defaultPersonalization,
          fullName: 'Server Name',
          nickname: 'Synced',
        },
      });
    });

    expect(getByDisplayValue('Server Name')).toBeTruthy();
    expect(getByDisplayValue('Synced')).toBeTruthy();
  });

  it('does not overwrite an edited Cloud draft when a later server pull arrives', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByDisplayValue, getByPlaceholderText } = render(<PersonalizationScreen />);

    fireEvent.changeText(getByPlaceholderText('Your full name'), 'Unsaved Draft');
    act(() => {
      useCloudSettingsStore.setState({
        personalization: {
          ...defaultPersonalization,
          fullName: 'Later Server Name',
        },
      });
    });

    expect(getByDisplayValue('Unsaved Draft')).toBeTruthy();
  });

  it('discards an account-A dirty draft when the active Cloud owner changes to B', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ clerkUserId: 'account-a' });
    useCloudSettingsStore.setState({
      personalization: { ...defaultPersonalization, fullName: 'Account A' },
    });
    const { getByDisplayValue, getByPlaceholderText } = render(<PersonalizationScreen />);

    fireEvent.changeText(getByPlaceholderText('Your full name'), 'Account A unsaved private draft');
    act(() => {
      useCloudSettingsStore.setState({
        personalization: { ...defaultPersonalization, fullName: 'Account B' },
      });
      useAuthStore.setState({ clerkUserId: 'account-b' });
    });

    expect(getByDisplayValue('Account B')).toBeTruthy();
    expect(() => getByDisplayValue('Account A unsaved private draft')).toThrow();
  });
});

describe('Personalization theme card removal', () => {
  beforeEach(() => {
    resetSettingsStore();
    useAuthStore.setState({ clerkUserId: null });
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('renders no appearance control at all', () => {
    const { queryByText, queryByLabelText } = render(<PersonalizationScreen />);

    expect(queryByText('Theme')).toBeNull();
    expect(queryByText('System follows your device appearance setting.')).toBeNull();
    for (const label of ['Light', 'Dark', 'System']) {
      expect(queryByLabelText(label)).toBeNull();
    }
  });

  it('leaves the stored theme untouched when a draft edit is discarded', () => {
    const originalSetThemeMode = useLocalSettingsStore.getState().setThemeMode;
    const setThemeMode = jest.fn();
    useLocalSettingsStore.setState({ themeMode: 'dark', setThemeMode } as never);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    try {
      const { getByLabelText, getByPlaceholderText } = render(<PersonalizationScreen />);

      fireEvent.changeText(getByPlaceholderText('Your full name'), 'Draft only');
      fireEvent.press(getByLabelText('Go back'));

      expect(alertSpy).toHaveBeenCalledWith(
        'Discard changes?',
        'You have unsaved changes.',
        expect.any(Array),
      );
      const buttons = alertSpy.mock.calls[0][2] as { text?: string; onPress?: () => void }[];
      const discard = buttons.find((button) => button.text === 'Discard');
      act(() => discard?.onPress?.());

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(setThemeMode).not.toHaveBeenCalled();
      expect(useLocalSettingsStore.getState().themeMode).toBe('dark');
      expect(useLocalSettingsStore.getState().personalization.fullName).toBe('');
    } finally {
      alertSpy.mockRestore();
      useLocalSettingsStore.setState({ setThemeMode: originalSetThemeMode } as never);
    }
  });
});

describe('Personalization page with the keyboard open', () => {
  const originalOS = Platform.OS;
  const setOS = (os: 'ios' | 'android') =>
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

  beforeEach(() => {
    resetSettingsStore();
    useAuthStore.setState({ clerkUserId: null });
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  });

  it('on iPhone lets the form scroll the focused field above the keyboard', () => {
    setOS('ios');
    const { UNSAFE_getByType } = render(<PersonalizationScreen />);

    expect(UNSAFE_getByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(UNSAFE_getByType(KeyboardAvoidingView).props.enabled).toBe(false);
  });

  it('on Android pads the form by the keyboard so the focused field stays in view', () => {
    setOS('android');
    const { UNSAFE_getByType } = render(<PersonalizationScreen />);

    const avoiding = UNSAFE_getByType(KeyboardAvoidingView).props;
    expect(avoiding.enabled).toBe(true);
    expect(avoiding.behavior).toBe('padding');
  });

  it('keeps Save in the header outside the part that shrinks for the keyboard', () => {
    const { UNSAFE_getByType, getByLabelText } = render(<PersonalizationScreen />);

    const avoiding = UNSAFE_getByType(KeyboardAvoidingView);
    expect(
      avoiding.findAll((node) => node.props.accessibilityLabel === 'Save personalization settings'),
    ).toHaveLength(0);
    expect(getByLabelText('Save personalization settings')).toBeTruthy();
    expect(
      avoiding.findAll((node) => node.props.accessibilityLabel === 'Custom Instructions').length,
    ).toBeGreaterThan(0);
  });
});

describe('fieldRevealOffset', () => {
  const frame = {
    blockY: 200,
    blockHeight: 100,
    inputBottom: 280,
    viewportY: 100,
    visibleBottom: 500,
    currentOffset: 40,
  };
  const margin = 12;

  it('does not scroll when the whole field is above the keyboard', () => {
    expect(fieldRevealOffset(frame, margin)).toBeNull();
  });

  it('scrolls by exactly the overlap plus the margin when the bottom is under the keyboard', () => {
    const overlap = 150;
    const covered = { ...frame, blockY: 450, blockHeight: 200, inputBottom: 626 };

    expect(covered.blockY + covered.blockHeight - covered.visibleBottom).toBe(overlap);
    expect(fieldRevealOffset(covered, margin)).toBe(covered.currentOffset + overlap + margin);
  });

  it('still scrolls when the bottom is above the keyboard but closer than the margin', () => {
    const touching = { ...frame, blockY: 380, blockHeight: 115, inputBottom: 460 };

    expect(fieldRevealOffset(touching, margin)).toBe(touching.currentOffset + 7);
  });

  it('brings the bottom of the input into view when the field is taller than the visible area', () => {
    const tall = { ...frame, blockY: 150, blockHeight: 600, inputBottom: 700, currentOffset: 0 };
    const offset = fieldRevealOffset(tall, margin);

    expect(offset).toBe(700 - (tall.visibleBottom - margin));
    expect(tall.inputBottom - (offset ?? 0)).toBe(tall.visibleBottom - margin);
  });

  it('scrolls back when the label is under the header and the field fits', () => {
    const clipped = {
      ...frame,
      blockY: 60,
      blockHeight: 100,
      inputBottom: 140,
      currentOffset: 200,
    };

    expect(fieldRevealOffset(clipped, margin)).toBe(200 + 60 - (frame.viewportY + margin));
  });

  it('leaves the screen alone when the keyboard leaves no room to reveal anything', () => {
    expect(fieldRevealOffset({ ...frame, visibleBottom: 110 }, margin)).toBeNull();
  });
});

describe('Personalization multiline fields', () => {
  beforeEach(() => {
    resetSettingsStore();
    useAuthStore.setState({ clerkUserId: null });
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('caps the height of both multiline fields and leaves the single-line fields uncapped', () => {
    const { getByLabelText } = render(<PersonalizationScreen />);
    const style = (label: string) => StyleSheet.flatten(getByLabelText(label).props.style);

    expect(style('Custom Instructions').maxHeight).toBe(MULTILINE_FIELD_MAX_HEIGHT);
    expect(style('More about you').maxHeight).toBe(MULTILINE_FIELD_MAX_HEIGHT);
    for (const label of ['Full Name', 'Nickname', 'Occupation']) {
      expect(style(label).maxHeight).toBeUndefined();
    }
  });

  it('sets the cap above the minimum height and low enough to fit above a keyboard', () => {
    const { getByLabelText } = render(<PersonalizationScreen />);
    const input = getByLabelText('Custom Instructions');

    expect(input.props.multiline).toBe(true);
    expect(MULTILINE_FIELD_MAX_HEIGHT).toBeGreaterThan(100);
    expect(MULTILINE_FIELD_MAX_HEIGHT).toBeLessThanOrEqual(160);
    expect(StyleSheet.flatten(input.props.style).maxHeight).toBe(MULTILINE_FIELD_MAX_HEIGHT);
  });
});

type MeasureDone = (x: number, y: number, width: number, height: number) => void;
type MeasuredProps = { accessibilityLabel?: string; collapsable?: boolean; children?: ReactNode };
type Measured = { props: MeasuredProps };
type Measurer = { prototype: { measureInWindow: (this: Measured, done: MeasureDone) => void } };

const MockedView = jest.requireMock<{ default: Measurer }>(
  'react-native/Libraries/Components/View/View',
).default;

const SCROLL_FRAME = { y: 100, height: 700 };
const KEYBOARD_TOP = 500;
const MARGIN = 12;

const FIELD_LABELS = ['Custom Instructions', 'More about you', 'Full Name'];

const FIELD_COVERED = { blockY: 450, blockHeight: 220, inputY: 476, inputHeight: 150 };
const FIELD_BELOW_SCREEN = { blockY: 700, blockHeight: 220, inputY: 726, inputHeight: 150 };
const FIELD_CLEAR = { blockY: 200, blockHeight: 220, inputY: 226, inputHeight: 150 };

let fieldFrame = FIELD_COVERED;
let keyboardUp = false;
let listeners = new Map<string, (event: unknown) => void>();
let frames = new Map<number, () => void>();
let nextFrame = 1;

const restoreMeasures: Array<() => void> = [];

function stubMeasure(component: Measurer, measure: Measurer['prototype']['measureInWindow']) {
  const original = component.prototype.measureInWindow;
  component.prototype.measureInWindow = measure;
  restoreMeasures.push(() => {
    component.prototype.measureInWindow = original;
  });
}

function holdsLabel(node: ReactNode, label: string): boolean {
  if (Array.isArray(node)) return node.some((child) => holdsLabel(child, label));
  if (!isValidElement<MeasuredProps>(node)) return false;
  return node.props.accessibilityLabel === label || holdsLabel(node.props.children, label);
}

function flushFrames() {
  while (frames.size > 0) {
    const due = [...frames.values()];
    frames = new Map();
    act(() => due.forEach((callback) => callback()));
  }
}

function keyboardEvent(event: string) {
  keyboardUp = true;
  act(() => listeners.get(event)?.({ endCoordinates: { screenY: KEYBOARD_TOP, height: 300 } }));
  flushFrames();
}

function focus(label: string, screen: ReturnType<typeof render>) {
  fireEvent(screen.getByLabelText(label), 'focus');
}

describe('Personalization focused field reveal', () => {
  let scrollTo: jest.SpyInstance;
  const originalOS = Platform.OS;
  const setOS = (os: 'ios' | 'android') =>
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

  beforeEach(() => {
    resetSettingsStore();
    useAuthStore.setState({ clerkUserId: null });
    useChatAppModeStore.setState({ appMode: 'local' });
    fieldFrame = FIELD_COVERED;
    keyboardUp = false;
    listeners = new Map();
    frames = new Map();
    nextFrame = 1;
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrame++;
      frames.set(id, () => callback(0));
      return id;
    });
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    jest.spyOn(Keyboard, 'isVisible').mockImplementation(() => keyboardUp);
    jest
      .spyOn(Keyboard, 'metrics')
      .mockImplementation(() =>
        keyboardUp ? { screenX: 0, screenY: KEYBOARD_TOP, width: 402, height: 300 } : undefined,
      );
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((
      event: string,
      listener: (event: unknown) => void,
    ) => {
      listeners.set(event, listener);
      return { remove: () => listeners.delete(event) };
    }) as never);
    stubMeasure(MockedView, function measure(this: Measured, done: MeasureDone) {
      const holdsField = FIELD_LABELS.some((entry) => holdsLabel(this.props.children, entry));
      if (this.props.collapsable === false && holdsField) {
        done(0, fieldFrame.blockY, 370, fieldFrame.blockHeight);
      } else {
        done(0, 0, 402, 0);
      }
    });
    stubMeasure(TextInput as unknown as Measurer, function measure(done: MeasureDone) {
      done(0, fieldFrame.inputY, 370, fieldFrame.inputHeight);
    });
    stubMeasure(ScrollView as unknown as Measurer, function measure(done: MeasureDone) {
      done(0, SCROLL_FRAME.y, 402, SCROLL_FRAME.height);
    });
    scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    scrollTo.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    while (restoreMeasures.length > 0) restoreMeasures.pop()?.();
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  });

  const expectedOffset = (currentOffset = 0) =>
    currentOffset + fieldFrame.blockY + fieldFrame.blockHeight - KEYBOARD_TOP + MARGIN;

  it('scrolls the whole field above a keyboard that is already up when focus moves to it', () => {
    keyboardUp = true;
    const screen = render(<PersonalizationScreen />);

    focus('Custom Instructions', screen);

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: expectedOffset(), animated: true });
  });

  it('does not scroll when the focused field is already above the keyboard', () => {
    keyboardUp = true;
    fieldFrame = FIELD_CLEAR;
    const screen = render(<PersonalizationScreen />);

    focus('Custom Instructions', screen);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('waits for the keyboard when focus lands before it appears, on iPhone', () => {
    setOS('ios');
    const screen = render(<PersonalizationScreen />);

    focus('Custom Instructions', screen);
    expect(scrollTo).not.toHaveBeenCalled();

    keyboardEvent('keyboardDidChangeFrame');
    expect(scrollTo).toHaveBeenCalledWith({ y: expectedOffset(), animated: true });
  });

  it('waits for the keyboard when focus lands before it appears, on Android', () => {
    setOS('android');
    const screen = render(<PersonalizationScreen />);

    focus('Custom Instructions', screen);
    expect(scrollTo).not.toHaveBeenCalled();

    keyboardEvent('keyboardDidShow');
    expect(scrollTo).toHaveBeenCalledWith({ y: expectedOffset(), animated: true });
  });

  it('follows the field as it grows while the keyboard is up', () => {
    keyboardUp = true;
    fieldFrame = FIELD_CLEAR;
    const screen = render(<PersonalizationScreen />);
    focus('Custom Instructions', screen);
    expect(scrollTo).not.toHaveBeenCalled();

    fieldFrame = { blockY: 200, blockHeight: 340, inputY: 226, inputHeight: 270 };
    fireEvent(screen.UNSAFE_getByType(ScrollView), 'contentSizeChange', 402, 1200);

    expect(scrollTo).toHaveBeenCalledWith({ y: expectedOffset(), animated: true });
  });

  it('starts from the offset the screen has been scrolled to', () => {
    keyboardUp = true;
    const screen = render(<PersonalizationScreen />);
    fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
      nativeEvent: { contentOffset: { x: 0, y: 40 } },
    });

    focus('Custom Instructions', screen);

    expect(scrollTo).toHaveBeenCalledWith({ y: expectedOffset(40), animated: true });
  });

  it('reveals again when the keyboard changes its frame under a focused field', () => {
    keyboardUp = true;
    fieldFrame = FIELD_CLEAR;
    const screen = render(<PersonalizationScreen />);
    focus('Custom Instructions', screen);
    expect(scrollTo).not.toHaveBeenCalled();

    fieldFrame = FIELD_COVERED;
    keyboardEvent('keyboardDidChangeFrame');

    expect(scrollTo).toHaveBeenCalledWith({ y: expectedOffset(), animated: true });
  });

  it('stops following once the field loses focus', () => {
    keyboardUp = true;
    fieldFrame = FIELD_CLEAR;
    const screen = render(<PersonalizationScreen />);
    focus('Custom Instructions', screen);
    fireEvent(screen.getByLabelText('Custom Instructions'), 'blur');

    fieldFrame = FIELD_COVERED;
    keyboardEvent('keyboardDidChangeFrame');
    fireEvent(screen.UNSAFE_getByType(ScrollView), 'contentSizeChange', 402, 1200);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('treats the off-screen frame a hiding keyboard reports as a closed keyboard', () => {
    setOS('ios');
    keyboardUp = true;
    fieldFrame = FIELD_BELOW_SCREEN;
    const screen = render(<PersonalizationScreen />);
    focus('Custom Instructions', screen);
    scrollTo.mockClear();

    act(() =>
      listeners.get('keyboardDidChangeFrame')?.({
        endCoordinates: { screenY: Dimensions.get('window').height, height: 0 },
      }),
    );
    flushFrames();
    focus('Custom Instructions', screen);
    fireEvent(screen.UNSAFE_getByType(ScrollView), 'contentSizeChange', 402, 1200);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('reveals again when the keyboard comes back after an off-screen frame', () => {
    setOS('ios');
    fieldFrame = FIELD_BELOW_SCREEN;
    const screen = render(<PersonalizationScreen />);
    focus('Custom Instructions', screen);
    act(() =>
      listeners.get('keyboardDidChangeFrame')?.({
        endCoordinates: { screenY: Dimensions.get('window').height, height: 0 },
      }),
    );
    flushFrames();
    expect(scrollTo).not.toHaveBeenCalled();

    keyboardEvent('keyboardDidChangeFrame');

    expect(scrollTo).toHaveBeenCalledWith({ y: expectedOffset(), animated: true });
  });

  it('does not scroll when the keyboard is closed', () => {
    const screen = render(<PersonalizationScreen />);

    focus('Custom Instructions', screen);
    fireEvent(screen.UNSAFE_getByType(ScrollView), 'contentSizeChange', 402, 1200);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
