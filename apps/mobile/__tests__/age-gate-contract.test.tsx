import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  clearAgeGate,
  confirmAgeGate,
  isMinorMode,
  type AgeGateRecord,
} from '@/src/features/auth/services/ageGate';
import AgeGateScreen, { resolveReturnPath } from '@/app/(public)/age-gate';
import ParentalControlsScreen from '@/src/features/settings/parental-controls';

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
// inheriting whatever the machine running the suite is set to. New York
// matches no rule, which is the default 13 threshold.
const FIXTURE_TIME_ZONE = 'America/New_York';
const realIntl = global.Intl;

const mockReplace = jest.fn();

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
    useLocalSearchParams: () => ({}),
  };
});

beforeAll(() => {
  Object.defineProperty(global, 'Intl', {
    configurable: true,
    value: {
      ...realIntl,
      DateTimeFormat: function DateTimeFormat() {
        return { resolvedOptions: () => ({ timeZone: FIXTURE_TIME_ZONE }) };
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

// The age record is a device fact. Putting it in a request body, a header or a
// query string is what would tell the server, and other users, a minor is here.
const SENDS_MINOR_STATUS =
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

  it('never carries the answer off the device', () => {
    const leaking = FILES.filter((file) => SENDS_MINOR_STATUS.test(file.text)).map(
      (file) => file.path,
    );

    expect(leaking).toEqual([]);
  });

  it('has source to sweep, so an empty tree cannot pass this', () => {
    expect(FILES.length).toBeGreaterThan(200);
  });
});

describe('the age screen when the answer does not work', () => {
  beforeEach(() => {
    clearAgeGate();
    mockReplace.mockClear();
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

  it('tells a minor what changed before it moves them on', () => {
    render(<AgeGateScreen />);

    fireEvent.changeText(screen.getByTestId('age-gate-input'), '9');
    fireEvent.press(screen.getByTestId('age-gate-continue-btn'));

    expect(screen.getByTestId('age-gate-minor-notice')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(isMinorMode()).toBe(true);
  });
});

describe('the guardian surface', () => {
  beforeEach(() => {
    clearAgeGate();
  });

  it('offers a protected device the lock explanation and no way to raise the age', () => {
    confirmAgeGate(9);

    render(<ParentalControlsScreen />);

    expect(screen.getByTestId('parental-controls-minor-lock')).toBeTruthy();
    expect(screen.queryByLabelText('Review Device Age Settings')).toBeNull();
  });

  it('leaves an adult device its review route and no minor-safe claim', () => {
    confirmAgeGate(41);

    render(<ParentalControlsScreen />);

    expect(screen.queryByTestId('parental-controls-minor-lock')).toBeNull();
    expect(screen.getByLabelText('Review Device Age Settings')).toBeTruthy();
  });

  it('returns only to the two screens that can send someone to the age gate', () => {
    expect(resolveReturnPath('/(app)/settings/parental-controls')).toBe(
      '/(app)/settings/parental-controls',
    );
    expect(resolveReturnPath('/(app)/settings/account-security')).toBeNull();
    expect(resolveReturnPath('https://example.test/anything')).toBeNull();
    expect(resolveReturnPath(undefined)).toBeNull();
  });
});
