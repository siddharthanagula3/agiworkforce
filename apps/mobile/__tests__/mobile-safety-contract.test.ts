import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Platform } from 'react-native';
import { NOTIFICATION_EVENT_TYPES } from '@/services/notificationEventTypes';
import {
  DELETE_ACCOUNT_CONFIRMATION,
  deleteAccountConfirmation,
} from '@/src/features/settings/cloud-account/deleteAccountConfirmation';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { REQUIRED_PINNED_HOSTS, PINS_BY_HOST, hasPlaceholderPins } from '@/lib/pinning';
import {
  CLIENT_VERSION_HEADER,
  SURFACE_REQUEST_HEADER,
  clientHandshakeHeaders,
} from '@agiworkforce/cloud-contracts';

const MOBILE_ROOT = join(__dirname, '..');
const NOTIFICATIONS = readFileSync(join(MOBILE_ROOT, 'services', 'notifications.ts'), 'utf8');
const ACCOUNT_SCREEN = readFileSync(
  join(MOBILE_ROOT, 'src', 'features', 'settings', 'cloud-account', 'index.tsx'),
  'utf8',
);
const LISTING_IOS = JSON.parse(
  readFileSync(join(MOBILE_ROOT, 'store-listing', 'LISTING-METADATA-IOS.json'), 'utf8'),
) as Record<string, Record<string, unknown>>;
const LISTING_ANDROID = JSON.parse(
  readFileSync(join(MOBILE_ROOT, 'store-listing', 'LISTING-METADATA-ANDROID.json'), 'utf8'),
) as Record<string, unknown>;

// The tap handler is a switch on the event type. A member with no case of its
// own falls through to the default and opens app home, which is the whole
// complaint about a notification that "deep-links incorrectly".
const navigationCases = new Set(
  Array.from(
    NOTIFICATIONS.slice(NOTIFICATIONS.indexOf('notificationCenterStore.add(')).matchAll(
      /case '([a-z_]+)':/g,
    ),
    (match) => match[1],
  ),
);

// A screenshot the stores publish is taken on a device this repository drove
// from a clean install. Signing into an account, or reading a conversation off
// one, is how a real person's chat ends up in a listing.
const SCREENSHOT_SPECS = join(MOBILE_ROOT, 'scripts', 'screenshots', 'specs');
const ACCOUNT_BEARING = /signIn|password|pk_live|sk_|@gmail|@agiworkforce\.com/i;
const CREDENTIAL_SHAPE = /(password|passcode|secret|token)\s*[:=]\s*['"][^'"]{6,}['"]/i;

function sourceFilesFor(roots: string[]): { path: string; text: string }[] {
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
  for (const root of roots) walk(join(MOBILE_ROOT, root));
  return found;
}

function storeListingFiles(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(md|json|ts)$/.test(entry.name)) continue;
      found.push({ path: relative(MOBILE_ROOT, full), text: readFileSync(full, 'utf8') });
    }
  };
  walk(join(MOBILE_ROOT, 'store-listing'));
  return found;
}

describe('a notification opens what it is about', () => {
  it('gives every event type the app can receive a destination of its own', () => {
    const withoutDestination = NOTIFICATION_EVENT_TYPES.filter(
      (type) => !navigationCases.has(type),
    );

    expect(withoutDestination).toEqual([]);
    expect(NOTIFICATION_EVENT_TYPES.length).toBeGreaterThan(10);
  });

  it('refuses a route the payload invented instead of following it', () => {
    expect(NOTIFICATIONS).toMatch(/if\s*\(data\.route[\s\S]{0,80}isAllowedRoute\(data\.route\)/);
    expect(NOTIFICATIONS).toContain('Blocked navigation to disallowed route');
  });

  it('opens the app rather than a sign-in wall when nobody is signed in', () => {
    expect(NOTIFICATIONS).toMatch(/if\s*\(!_isSignedIn\)\s*\{\s*\n\s*safeNavigate/);
  });
});

describe('what a notification is allowed to say on a locked screen', () => {
  it('composes no title or body of its own out of message content', () => {
    const composed = Array.from(NOTIFICATIONS.matchAll(/\b(title|body):\s*([^\n,]+)/g)).map(
      (match) => `${match[1]}: ${match[2].trim()}`,
    );
    const invented = composed.filter(
      (entry) => !/opts\.|content\.|string;|\?\?\s*''|data\./.test(entry),
    );

    expect(invented).toEqual([]);
  });

  it('keeps the notification list to what arrived, never the conversation', () => {
    expect(NOTIFICATIONS).toContain("title: content.title ?? ''");
    expect(NOTIFICATIONS).toContain("body: content.body ?? ''");
  });
});

describe('deleting an account', () => {
  it('names the consequence, the timing and what is left behind', () => {
    expect(DELETE_ACCOUNT_CONFIRMATION.message).toMatch(/permanent deletion/);
    expect(DELETE_ACCOUNT_CONFIRMATION.message).toMatch(/cancel before the cancellation deadline/);
    expect(DELETE_ACCOUNT_CONFIRMATION.message).toMatch(
      /Erasure is processed after the deadline and may take longer/,
    );
    expect(DELETE_ACCOUNT_CONFIRMATION.message).not.toMatch(
      /in 24 hours|cancel before erasure begins/,
    );
    expect(DELETE_ACCOUNT_CONFIRMATION.message).toMatch(/cannot be undone/);
    expect(DELETE_ACCOUNT_CONFIRMATION.message).toMatch(
      /Anything the law or an active legal hold requires us to keep is kept/,
    );
    expect(DELETE_ACCOUNT_CONFIRMATION.message).toMatch(
      /A paid plan ends when erasure runs, and its unused time is not refunded/,
    );
    expect(DELETE_ACCOUNT_CONFIRMATION.message).toMatch(
      /bought on the web stops renewing now, and cancelling the deletion turns renewal back on/,
    );
    expect(DELETE_ACCOUNT_CONFIRMATION.message).not.toMatch(/already cancelled/);
    expect(DELETE_ACCOUNT_CONFIRMATION.message).toMatch(/signed out/);
    expect(DELETE_ACCOUNT_CONFIRMATION.message).toMatch(/Local Mode data stays on this device/);
    expect(DELETE_ACCOUNT_CONFIRMATION.message).toMatch(/Export your Cloud data above first/);
    expect(ACCOUNT_SCREEN).toContain('Cancellation deadline:');
    expect(ACCOUNT_SCREEN).not.toContain('Erasure is scheduled for');
  });

  it('names store billing only in a build that sells through the App Store or Google Play', () => {
    const withStores = deleteAccountConfirmation(true).message;
    const withoutStores = deleteAccountConfirmation(false).message;
    const storeSentence =
      'A plan bought through the App Store or Google Play keeps billing until you cancel it there. ';

    expect(withStores).toContain(storeSentence);
    expect(withoutStores).not.toMatch(/App Store|Google Play/);
    expect(withStores.replace(storeSentence, '')).toBe(withoutStores);
    expect(DELETE_ACCOUNT_CONFIRMATION).toEqual(
      deleteAccountConfirmation(NATIVE_PURCHASES_AVAILABLE),
    );
    if (!NATIVE_PURCHASES_AVAILABLE) {
      expect(DELETE_ACCOUNT_CONFIRMATION.message).not.toMatch(/App Store|Google Play/);
    }
  });

  it('sends an iPhone account to remove the app from Sign in with Apple, and no one else', () => {
    const appleSentence =
      ' If you signed in with Apple, also remove this app under Settings, your name, Sign in with Apple.';
    const original = Platform.OS;
    try {
      Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
      const onIos = deleteAccountConfirmation(false).message;
      Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
      const onAndroid = deleteAccountConfirmation(false).message;

      expect(
        onIos.endsWith(`Export your Cloud data above first to keep a copy.${appleSentence}`),
      ).toBe(true);
      expect(onAndroid).not.toMatch(/Apple/);
      expect(onIos.replace(appleSentence, '')).toBe(onAndroid);
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true });
    }
  });

  it('asks before it acts, with the destructive choice marked as one', () => {
    expect(ACCOUNT_SCREEN).toContain('DELETE_ACCOUNT_CONFIRMATION.title');
    expect(ACCOUNT_SCREEN).toMatch(
      /text: DELETE_ACCOUNT_CONFIRMATION\.cancelLabel,\s*style: 'cancel'/,
    );
    expect(ACCOUNT_SCREEN).toMatch(
      /text: DELETE_ACCOUNT_CONFIRMATION\.confirmLabel,\s*style: 'destructive'/,
    );
  });

  it('signs the device out once the server accepts the deletion', () => {
    // Found by shape, not by indentation, which the formatter owns.
    const accepted = ACCOUNT_SCREEN.slice(ACCOUNT_SCREEN.search(/api\s*\.delete</));

    expect(accepted).toMatch(/await signOut\(\)/);
    expect(accepted.indexOf('await signOut()')).toBeLessThan(
      accepted.indexOf('Account deletion scheduled'),
    );
  });
});

describe('what this repository hands a store reviewer', () => {
  it('requires a review account without storing credentials in the repository', () => {
    expect(LISTING_IOS.app_review_information?.demo_account_required).toBe(true);

    const withCredentials = storeListingFiles()
      .filter((file) => CREDENTIAL_SHAPE.test(file.text))
      .map((file) => file.path);

    expect(withCredentials).toEqual([]);
    expect(JSON.stringify(LISTING_ANDROID)).not.toMatch(CREDENTIAL_SHAPE);
  });

  it('captures every store screenshot from a clean install it typed into itself', () => {
    const specs = readdirSync(SCREENSHOT_SPECS).filter((name) => name.endsWith('.spec.ts'));

    expect(specs.length).toBeGreaterThan(4);

    const signedIn = specs.filter((name) => {
      const text = readFileSync(join(SCREENSHOT_SPECS, name), 'utf8');
      return ACCOUNT_BEARING.test(text);
    });

    expect(signedIn).toEqual([]);
  });
});

describe('a failure can be traced back to the build it happened on', () => {
  const API = readFileSync(join(MOBILE_ROOT, 'services', 'api.ts'), 'utf8');
  const STREAMING = readFileSync(join(MOBILE_ROOT, 'services', 'streaming.ts'), 'utf8');
  const HEADERS = readFileSync(join(MOBILE_ROOT, 'src', 'platform', 'platformHeaders.ts'), 'utf8');

  it('stamps the installed version on the request, not the one in the repository', () => {
    expect(HEADERS).toContain('Constants.expoConfig?.version');
    expect(HEADERS).toContain('surface: SOURCE_SURFACE');
    expect(clientHandshakeHeaders({ surface: 'mobile', version: '1.2.0' })).toMatchObject({
      [SURFACE_REQUEST_HEADER]: 'mobile',
      [CLIENT_VERSION_HEADER]: '1.2.0',
    });
  });

  it('puts it on every call, not only the few that remembered to ask', () => {
    expect(API).toMatch(/const headers = \{[\s\S]{0,160}\.\.\.platformRequestHeaders\(\)/);
    expect(STREAMING).toContain('...platformRequestHeaders()');
  });

  it('reaches the network through the two clients that stamp it and nothing else', () => {
    const raw = sourceFilesFor(['src', 'services', 'lib', 'stores', 'app']).filter(
      (file) =>
        /(?<![.\w])fetch\s*\(/.test(file.text) &&
        !['services/api.ts', 'services/streaming.ts', 'services/secureFetch.ts'].includes(
          file.path,
        ),
    );

    expect(
      raw
        .filter((file) => !/NetInfo\.fetch|expoFetch|secureFetch/.test(file.text))
        .map((f) => f.path),
    ).toEqual([]);
  });
});

describe('what the client does about the transport it cannot see', () => {
  it('requires a pin set for every host that issues or carries a credential', () => {
    expect([...REQUIRED_PINNED_HOSTS].sort()).toEqual(Object.keys(PINS_BY_HOST).sort());
    expect(hasPlaceholderPins()).toBe(false);
  });

  it('pins the authority above the leaf, so a routine renewal keeps matching', () => {
    for (const host of REQUIRED_PINNED_HOSTS) {
      const pins = PINS_BY_HOST[host];
      expect(pins.length).toBeGreaterThan(2);
      for (const pin of pins) expect(pin).toMatch(/^sha256\/[A-Za-z0-9+/]{43}=$/);
    }
  });
});

describe('the age rating note on how links open', () => {
  const note = String(LISTING_IOS.age_rating?.note ?? '');
  const webContentPage = readFileSync(
    join(MOBILE_ROOT, 'src', 'platform', 'webContentPage.ts'),
    'utf8',
  );

  it('says fixed site pages open in the in-app sheet, as the helper does', () => {
    expect(webContentPage).toMatch(
      /export function openWebContentPage[\s\S]*?return openInAppBrowser\(webContentPageUrl/,
    );
    expect(note).toContain('apps/mobile/src/platform/webContentPage.ts');
    expect(note).toMatch(/in-app Safari sheet/);
    expect(note).not.toMatch(/links open in the system browser/);
  });

  it('names the change-email page as one that opens the system browser', () => {
    expect(ACCOUNT_SCREEN).toContain(
      "openWebAccountPage('https://agiworkforce.com/settings/account', 'system')",
    );
    expect(note).toMatch(/change-email page[^.]*open the system browser/);
  });
});
