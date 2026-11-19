import { readFileSync } from 'fs';
import { join } from 'path';

import { FEEDBACK_SCREEN_TITLE } from '../src/features/feedback/presentation';
import { DEVICE_INTEGRATIONS_SCREEN_TITLE } from '../src/features/integrations/presentation';
import {
  EMAIL_SCREEN_TITLE,
  NOTIFICATIONS_SCREEN_TITLE,
  SECURITY_LOGIN_SCREEN_TITLE,
  SHARED_LINKS_SCREEN_TITLE,
  SUBSCRIPTION_SCREEN_TITLE,
} from '../src/features/settings/screenTitles';

const ROOT = join(__dirname, '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

const PAIRS: Array<{
  row: string;
  constant: string;
  value: string;
  screens: Array<{ file: string; usage: string }>;
}> = [
  {
    row: 'Email',
    constant: 'EMAIL_SCREEN_TITLE',
    value: EMAIL_SCREEN_TITLE,
    screens: [
      {
        file: 'src/features/settings/cloud-account/index.tsx',
        usage: 'title={EMAIL_SCREEN_TITLE}',
      },
    ],
  },
  {
    row: 'Subscription',
    constant: 'SUBSCRIPTION_SCREEN_TITLE',
    value: SUBSCRIPTION_SCREEN_TITLE,
    screens: [
      {
        file: 'src/features/settings/cloud-billing/index.tsx',
        usage: 'title={SUBSCRIPTION_SCREEN_TITLE}',
      },
    ],
  },
  {
    row: 'Shared Links',
    constant: 'SHARED_LINKS_SCREEN_TITLE',
    value: SHARED_LINKS_SCREEN_TITLE,
    screens: [
      { file: 'app/(app)/settings/shared-links.tsx', usage: 'title={SHARED_LINKS_SCREEN_TITLE}' },
    ],
  },
  {
    row: 'Notifications',
    constant: 'NOTIFICATIONS_SCREEN_TITLE',
    value: NOTIFICATIONS_SCREEN_TITLE,
    screens: [
      {
        file: 'src/features/settings/notifications/index.tsx',
        usage: 'title={NOTIFICATIONS_SCREEN_TITLE}',
      },
    ],
  },
  {
    row: 'Security and login',
    constant: 'SECURITY_LOGIN_SCREEN_TITLE',
    value: SECURITY_LOGIN_SCREEN_TITLE,
    screens: [
      {
        file: 'src/features/settings/account-security/index.tsx',
        usage: 'title={SECURITY_LOGIN_SCREEN_TITLE}',
      },
      {
        file: 'app/(app)/profile/index.tsx',
        usage: 'label={SECURITY_LOGIN_SCREEN_TITLE}',
      },
      {
        file: 'src/features/settings/safety-security/index.tsx',
        usage: 'label={SECURITY_LOGIN_SCREEN_TITLE}',
      },
      {
        file: 'src/features/search/mobileDestinations.ts',
        usage: 'title: SECURITY_LOGIN_SCREEN_TITLE,',
      },
    ],
  },
  {
    row: 'Report App Issue',
    constant: 'FEEDBACK_SCREEN_TITLE',
    value: FEEDBACK_SCREEN_TITLE,
    screens: [
      { file: 'src/features/feedback/index.tsx', usage: ': FEEDBACK_SCREEN_TITLE}' },
      { file: 'app/(app)/about.tsx', usage: 'accessibilityLabel={FEEDBACK_SCREEN_TITLE}' },
      { file: 'app/(app)/about.tsx', usage: '{FEEDBACK_SCREEN_TITLE}\n' },
    ],
  },
  {
    row: 'Device Integrations',
    constant: 'DEVICE_INTEGRATIONS_SCREEN_TITLE',
    value: DEVICE_INTEGRATIONS_SCREEN_TITLE,
    screens: [
      {
        file: 'app/(app)/settings/integrations.tsx',
        usage: 'title={DEVICE_INTEGRATIONS_SCREEN_TITLE}',
      },
    ],
  },
];

describe('a settings row and the screen it opens carry one name', () => {
  const settings = read('src/features/settings/index.tsx');

  it.each(PAIRS)('$row is the wording of the row the person tapped', ({ row, value }) => {
    expect(value).toBe(row);
  });

  it.each(PAIRS)('$constant is read by the Settings row', ({ constant }) => {
    expect(settings).toContain(`label: ${constant},`);
  });

  it.each(PAIRS.flatMap((pair) => pair.screens.map((screen) => ({ ...pair, ...screen }))))(
    '$file draws its title from $constant',
    ({ file, row, usage }) => {
      const source = read(file);
      expect(source).toContain(usage);
      expect(source).not.toContain(`title="${row}"`);
    },
  );

  it('keeps every row and screen title free of purchase words', () => {
    for (const { value } of PAIRS) expect(value).not.toMatch(/upgrade|buy|purchase|billing|plan/i);
  });
});
