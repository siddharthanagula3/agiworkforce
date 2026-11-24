import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ACCOUNT_AGE_REQUIREMENT_NOTICE, ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';
import {
  clearAgeGate,
  confirmAgeGate,
  isAgeGateConfirmed,
  isMinorMode,
  type AgeGateRecord,
} from '@/src/features/auth/services/ageGate';
import AgeGateScreen, { resolveReturnPath } from '@/app/(public)/age-gate';
import { useAdultEligibilityStore } from '@/src/features/auth/store/adultEligibilityStore';
import {
  beginCloudPostAuthIntent,
  clearPostAuthIntent,
} from '@/src/features/auth/services/postAuthIntent';

const mockStore = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  ...jest.requireActual('@/lib/mmkv'),
  whenMmkvReady: (ready: () => void) => ready(),
  storage: {
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => mockStore.set(key, value),
    delete: (key: string) => mockStore.delete(key),
  },
}));

// The gate reads the device zone, so the fixture states one rather than
// inheriting whatever the machine running the suite is set to.
const DEFAULT_TIME_ZONE = 'America/New_York';
let mockTimeZone = DEFAULT_TIME_ZONE;
const realIntl = global.Intl;

const mockReplace = jest.fn();
let mockSearchParams: { returnTo?: string } = {};

jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useRouter: () => ({
      replace: mockReplace,
      push: jest.fn(),
      back: jest.fn(),
      navigate: jest.fn(),
    }),
    useLocalSearchParams: () => mockSearchParams,
  };
});

let mockSignedIn = false;
let mockClerkLoaded = true;
let mockClerkUserId: string | null = null;
const mockSignOut = jest.fn(() => Promise.resolve());
const mockSignOutAllAccounts = jest.fn(() => Promise.resolve());

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      isClerkSignedIn: mockSignedIn,
      isClerkLoaded: mockClerkLoaded,
      clerkUserId: mockClerkUserId,
      signOut: mockSignOut,
      signOutAllAccounts: mockSignOutAllAccounts,
    }),
}));

jest.mock('@/src/features/settings/data-controls/useLocalDataExport', () => ({
  useLocalDataExport: () => ({ exporting: false, progress: null, handleExport: jest.fn() }),
}));

let mockErased: (() => void) | null = null;
jest.mock('@/src/features/settings/data-controls/useEraseDeviceData', () => ({
  useEraseDeviceData: (onErased: () => void) => {
    mockErased = onErased;
    return { isWiping: false, eraseDeviceData: jest.fn() };
  },
}));

const mockOpenWebContentPage = jest.fn(() => Promise.resolve(true));
jest.mock('@/src/platform/webContentPage', () => ({
  openWebContentPage: (path: string) => mockOpenWebContentPage(path),
}));

beforeAll(() => {
  Object.defineProperty(global, 'Intl', {
    configurable: true,
    value: {
      ...realIntl,
      DateTimeFormat: function DateTimeFormat() {
        return { resolvedOptions: () => ({ timeZone: mockTimeZone }) };
      },
    },
  });
});

afterAll(() => {
  Object.defineProperty(global, 'Intl', { configurable: true, value: realIntl });
});

const MOBILE_ROOT = join(__dirname, '..');
const SOURCE_ROOTS = ['app', 'src', 'components', 'services', 'lib', 'stores'];
const AGE_RECORD_KEYS: (keyof AgeGateRecord)[] = [
  'confirmed',
  'isMinor',
  'confirmedAt',
  'regionCode',
  'threshold',
];

// The device record stays on the device. The server learns only what the
// shared eligibility contract carries, so a request body, header or query
// naming a field of the device record would be a leak.
const SENDS_DEVICE_RECORD =
  /(body|headers|params|payload|query)[^\n]*\b(isMinor|minorMode|ageEntered|ageGate)\b/;

function sourceFiles(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['__tests__', '__mocks__', 'node_modules'].includes(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      found.push({ path: relative(MOBILE_ROOT, full), text: readFileSync(full, 'utf8') });
    }
  };
  for (const root of SOURCE_ROOTS) walk(join(MOBILE_ROOT, root));
  return found;
}

const FILES = sourceFiles();

describe('what the age gate keeps about a person', () => {
  beforeEach(() => {
    clearAgeGate();
    clearPostAuthIntent();
  });

  it('keeps the answer to the only question it asked and nothing finer', () => {
    confirmAgeGate(34);

    const stored = JSON.parse(mockStore.get('age-gate:v1') as string) as Record<string, unknown>;

    expect(Object.keys(stored).sort()).toEqual([...AGE_RECORD_KEYS].sort());
    expect(Object.values(stored)).not.toContain(34);
  });

  it('cannot tell a 34 year old from a 71 year old once they are both adults', () => {
    const younger = confirmAgeGate(34);
    clearAgeGate();
    const older = confirmAgeGate(71);

    expect({ ...younger, confirmedAt: '' }).toEqual({ ...older, confirmedAt: '' });
  });

  it('never sends the device record itself off the device', () => {
    const leaking = FILES.filter((file) => SENDS_DEVICE_RECORD.test(file.text)).map(
      (file) => file.path,
    );

    expect(leaking).toEqual([]);
  });

  it('has source to sweep, so an empty tree cannot pass this', () => {
    expect(FILES.length).toBeGreaterThan(200);
  });

  it('makes no claim that the age is never shared', () => {
    const claiming = FILES.filter((file) => /never shared/i.test(file.text)).map(
      (file) => file.path,
    );

    expect(claiming).toEqual([]);
  });
});

describe('the age screen', () => {
  beforeEach(() => {
    clearAgeGate();
    clearPostAuthIntent();
    mockReplace.mockClear();
    mockSignOut.mockClear();
    mockSignOutAllAccounts.mockClear();
    mockOpenWebContentPage.mockClear();
    mockSignedIn = false;
    mockClerkLoaded = true;
    mockClerkUserId = null;
    useAdultEligibilityStore.getState().reset();
    mockSearchParams = {};
    mockTimeZone = DEFAULT_TIME_ZONE;
  });

  it('states the rule with the shared notice', () => {
    render(<AgeGateScreen />);

    expect(screen.getByTestId('age-gate-subtitle')).toHaveTextContent(
      ACCOUNT_AGE_REQUIREMENT_NOTICE,
      { exact: false },
    );
    expect(screen.queryByLabelText('Go back')).toBeNull();
  });

  it('waits for the restored account and uses its confirmed age without asking again', () => {
    mockClerkLoaded = false;
    const page = render(<AgeGateScreen />);
    expect(screen.queryByTestId('age-gate-input')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();

    mockClerkLoaded = true;
    mockSignedIn = true;
    mockClerkUserId = 'returning-user';
    act(() => {
      useAdultEligibilityStore.setState({ userId: mockClerkUserId, status: 'confirmed' });
      page.rerender(<AgeGateScreen />);
    });

    expect(screen.queryByTestId('age-gate-input')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(isAgeGateConfirmed()).toBe(false);
  });

  it('does not offer a different account’s age result to the active person', () => {
    mockSignedIn = true;
    mockClerkUserId = 'new-user';
    useAdultEligibilityStore.setState({ userId: 'previous-user', status: 'confirmed' });
    render(<AgeGateScreen />);

    expect(screen.getByTestId('age-gate-input')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps the device refusal even if the current account has a confirmed age', () => {
    confirmAgeGate(ACCOUNT_MINIMUM_AGE - 1);
    mockSignedIn = true;
    mockClerkUserId = 'returning-user';
    useAdultEligibilityStore.setState({ userId: mockClerkUserId, status: 'confirmed' });
    render(<AgeGateScreen />);

    expect(screen.getByTestId('age-gate-refused')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(isAgeGateConfirmed(true)).toBe(false);
  });

  it('returns to the requested Cloud sign-in after an adult confirms age', () => {
    beginCloudPostAuthIntent('cloud-schedules');
    mockSearchParams = { returnTo: '/(auth)/login' };
    render(<AgeGateScreen />);

    fireEvent.changeText(screen.getByTestId('age-gate-input'), '21');
    fireEvent.press(screen.getByTestId('age-gate-continue-btn'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-schedules' },
    });
  });

  it('returns to plain Cloud sign-in when no intent is staged', () => {
    mockSearchParams = { returnTo: '/(auth)/login' };
    render(<AgeGateScreen />);

    fireEvent.changeText(screen.getByTestId('age-gate-input'), '30');
    fireEvent.press(screen.getByTestId('age-gate-continue-btn'));

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('refuses a return path that is not on the allow-list', () => {
    mockSearchParams = { returnTo: '/(app)/settings/account-security' };
    render(<AgeGateScreen />);

    fireEvent.changeText(screen.getByTestId('age-gate-input'), '30');
    fireEvent.press(screen.getByTestId('age-gate-continue-btn'));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(public)/onboarding');
  });

  it('says what went wrong instead of ignoring the button', () => {
    render(<AgeGateScreen />);

    fireEvent.changeText(screen.getByTestId('age-gate-input'), '0');
    fireEvent.press(screen.getByTestId('age-gate-continue-btn'));

    const error = screen.getByTestId('age-gate-error');
    expect(error).toHaveTextContent('Please enter a valid age.');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('clears the message once the answer changes, rather than leaving it stale', () => {
    render(<AgeGateScreen />);

    fireEvent.changeText(screen.getByTestId('age-gate-input'), '999');
    fireEvent.press(screen.getByTestId('age-gate-continue-btn'));
    expect(screen.getByTestId('age-gate-error')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('age-gate-input'), '21');
    expect(screen.queryByTestId('age-gate-error')).toBeNull();
  });

  it('keeps the question to a centred form column that never exceeds an iPhone window', () => {
    render(<AgeGateScreen />);

    const style = StyleSheet.flatten(
      screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle,
    );
    expect(style.maxWidth).toBe(440);
    expect(style.width).toBe('100%');
    expect(style.alignSelf).toBe('center');
  });

  it('keeps the refusal in the same form column', () => {
    render(<AgeGateScreen />);
    fireEvent.changeText(screen.getByTestId('age-gate-input'), String(ACCOUNT_MINIMUM_AGE - 1));
    fireEvent.press(screen.getByTestId('age-gate-continue-btn'));

    const style = StyleSheet.flatten(
      screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle,
    );
    expect(style.maxWidth).toBe(440);
    expect(style.alignSelf).toBe('center');
  });

  it('refuses a typed 17 with the shared notice and moves them nowhere', () => {
    render(<AgeGateScreen />);

    fireEvent.changeText(screen.getByTestId('age-gate-input'), '17');
    fireEvent.press(screen.getByTestId('age-gate-continue-btn'));

    expect(screen.getByTestId('age-gate-refusal')).toHaveTextContent(
      ACCOUNT_AGE_REQUIREMENT_NOTICE,
    );
    expect(screen.queryByTestId('age-gate-refused-sign-out-btn')).toBeNull();
    expect(screen.queryByTestId('age-gate-refused-account-data')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(isMinorMode()).toBe(true);
    expect(isAgeGateConfirmed()).toBe(false);
  });

  it.each([13, 16])('refuses a typed %i in a zone that once allowed it', (age) => {
    mockTimeZone = age === 16 ? 'Europe/Berlin' : 'Europe/London';
    render(<AgeGateScreen />);

    fireEvent.changeText(screen.getByTestId('age-gate-input'), String(age));
    fireEvent.press(screen.getByTestId('age-gate-continue-btn'));

    expect(screen.getByTestId('age-gate-refused')).toBeTruthy();
    expect(isMinorMode()).toBe(true);
  });

  it('admits a typed 18 and continues to onboarding', () => {
    render(<AgeGateScreen />);

    fireEvent.changeText(screen.getByTestId('age-gate-input'), '18');
    fireEvent.press(screen.getByTestId('age-gate-continue-btn'));

    expect(screen.queryByTestId('age-gate-refusal')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/(public)/onboarding');
    expect(isMinorMode()).toBe(false);
    expect(isAgeGateConfirmed()).toBe(true);
  });

  it('keeps Cloud sign-in closed to a device that was refused', () => {
    confirmAgeGate(ACCOUNT_MINIMUM_AGE - 1);
    mockSearchParams = { returnTo: '/(auth)/login' };
    render(<AgeGateScreen />);

    expect(screen.getByTestId('age-gate-refused')).toBeTruthy();
    expect(screen.queryByTestId('age-gate-input')).toBeNull();
    expect(screen.queryByLabelText('Go back')).toBeNull();
  });

  it('signs every account on the phone out when a refused person signs out', async () => {
    mockSignedIn = true;
    confirmAgeGate(ACCOUNT_MINIMUM_AGE - 1);
    render(<AgeGateScreen />);

    fireEvent.press(screen.getByTestId('age-gate-refused-sign-out-btn'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(public)/age-gate'));
    expect(mockSignOutAllAccounts).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('points a signed-in refused person to the web data-rights page for their account', () => {
    mockSignedIn = true;
    confirmAgeGate(ACCOUNT_MINIMUM_AGE - 1);
    render(<AgeGateScreen />);

    fireEvent.press(screen.getByTestId('age-gate-refused-account-data'));

    expect(mockOpenWebContentPage).toHaveBeenCalledWith('/privacy/requests');
  });

  it('asks again from scratch once the device data is erased', () => {
    confirmAgeGate(ACCOUNT_MINIMUM_AGE - 1);
    render(<AgeGateScreen />);
    expect(screen.getByTestId('age-gate-refused')).toBeTruthy();

    clearAgeGate();
    expect(mockErased).not.toBeNull();
    act(() => mockErased?.());

    expect(screen.getByTestId('age-gate-input')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(public)/age-gate');
  });

  it('returns only to Cloud sign-in', () => {
    expect(resolveReturnPath('/(auth)/login')).toBe('/(auth)/login');
    expect(resolveReturnPath('/(app)/settings/parental-controls')).toBeNull();
    expect(resolveReturnPath('https://example.test/anything')).toBeNull();
    expect(resolveReturnPath(undefined)).toBeNull();
  });
});
