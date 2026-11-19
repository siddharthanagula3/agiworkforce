import React, { isValidElement, type ReactNode } from 'react';
import { Keyboard, Platform, ScrollView, TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@clerk/expo', () => ({
  useClerk: () => ({ user: null }),
  useSignIn: () => ({
    signIn: { status: 'needs_first_factor', supportedFirstFactors: [] },
    fetchStatus: 'idle',
  }),
  useSignUp: () => ({ signUp: { status: 'missing_requirements' }, fetchStatus: 'idle' }),
}));
jest.mock('@clerk/expo/apple', () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: jest.fn() }),
}));
jest.mock('@clerk/expo/experimental', () => ({
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { plugins: ['expo-apple-authentication'] } },
}));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => false),
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: { CONTINUE: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
}));
jest.mock('expo-linking', () => ({ createURL: jest.fn(() => 'agiworkforce://login') }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('@/lib/safeOpenURL', () => ({ openUntrustedUrlInAppBrowser: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));
jest.mock('@/lib/mmkv', () => ({
  ...jest.requireActual('@/lib/mmkv'),
  whenMmkvReady: (callback: () => void) => callback(),
  storage: { getString: () => '1', set: jest.fn() },
}));

import { MobileSignIn } from '../src/features/auth/components/MobileSignIn';
import { MobileSignUp } from '../src/features/auth/components/MobileSignUp';

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
const FIELD = { blockY: 450, blockHeight: 170, inputY: 482, inputHeight: 52 };
const EXPECTED_OFFSET = FIELD.blockY + FIELD.blockHeight - KEYBOARD_TOP + MARGIN;

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

function keyboardShows(event: string) {
  keyboardUp = true;
  act(() => listeners.get(event)?.({ endCoordinates: { screenY: KEYBOARD_TOP, height: 300 } }));
  flushFrames();
}

const SURFACES = [
  {
    name: 'sign-in',
    prefix: 'mobile-sign-in',
    element: () => <MobileSignIn onNativeFallback={jest.fn()} onSignUp={jest.fn()} />,
  },
  {
    name: 'sign-up',
    prefix: 'mobile-sign-up',
    element: () => <MobileSignUp onNativeFallback={jest.fn()} onSignIn={jest.fn()} />,
  },
];

describe.each(SURFACES)('$name email field above the keyboard', ({ prefix, element }) => {
  let scrollTo: jest.SpyInstance;
  let platform: jest.ReplaceProperty<'OS', typeof Platform.OS> | null = null;

  const setOS = (os: 'ios' | 'android') => {
    platform = jest.replaceProperty(Platform, 'OS', os);
  };

  beforeEach(() => {
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
      if (this.props.collapsable === false && holdsLabel(this.props.children, 'Email address')) {
        done(0, FIELD.blockY, 370, FIELD.blockHeight);
      } else {
        done(0, 0, 402, 0);
      }
    });
    stubMeasure(TextInput as unknown as Measurer, function measure(done: MeasureDone) {
      done(0, FIELD.inputY, 370, FIELD.inputHeight);
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
    platform?.restore();
    platform = null;
  });

  it('on Android scrolls the field and Continue above a keyboard that is already up', () => {
    setOS('android');
    keyboardUp = true;
    render(element());

    fireEvent(screen.getByTestId(`${prefix}-email`), 'focus');

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: EXPECTED_OFFSET, animated: true });
  });

  it('on Android scrolls once the keyboard appears after focus', () => {
    setOS('android');
    render(element());

    fireEvent(screen.getByTestId(`${prefix}-email`), 'focus');
    expect(scrollTo).not.toHaveBeenCalled();

    keyboardShows('keyboardDidShow');
    expect(scrollTo).toHaveBeenCalledWith({ y: EXPECTED_OFFSET, animated: true });
  });

  it('stops following the field after it loses focus', () => {
    setOS('android');
    render(element());
    fireEvent(screen.getByTestId(`${prefix}-email`), 'focus');
    fireEvent(screen.getByTestId(`${prefix}-email`), 'blur');

    keyboardShows('keyboardDidShow');

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('keeps Continue in the same block as the field so it is revealed with it', () => {
    setOS('android');
    const view = render(element());
    const block = view
      .UNSAFE_getAllByType(MockedView as never)
      .find(
        (node) =>
          node.props.collapsable === false &&
          node.findAll((child) => child.props.testID === `${prefix}-email`).length > 0,
      );

    expect(block).toBeTruthy();
    expect(
      block?.findAll((child) => child.props.testID === `${prefix}-continue`).length,
    ).toBeGreaterThan(0);
  });

  it('on iPhone leaves scrolling to the system, as before', () => {
    setOS('ios');
    keyboardUp = true;
    render(element());

    fireEvent(screen.getByTestId(`${prefix}-email`), 'focus');
    keyboardShows('keyboardDidChangeFrame');

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
