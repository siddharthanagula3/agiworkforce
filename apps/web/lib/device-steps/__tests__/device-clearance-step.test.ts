import { describe, expect, it, vi } from 'vitest';
import { PRODUCT_COPYRIGHT_NAME, PRODUCT_NAMES } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import { deviceClearanceCopy } from '../device-clearance-step';

const REASON = '"Device" is sleeping; the run waits for it to report in.';

describe('the waiting notice for a sleeping device', () => {
  it.each(['ios', 'android'])('tells a %s phone to open the phone app on it', (platform) => {
    const copy = deviceClearanceCopy(
      'waiting',
      { deviceName: 'iPhone 17 Pro', platform },
      REASON,
      60,
    );

    expect(copy.summary).toBe('Waiting for iPhone 17 Pro to come online');
    expect(copy.detail).toBe(
      `${REASON} Open ${PRODUCT_COPYRIGHT_NAME} ${PRODUCT_NAMES.mobile} on that device to let the task carry on. If it is still offline after 60 minutes, the task continues without it.`,
    );
    expect(copy.detail).not.toContain(PRODUCT_NAMES.desktop);
    expect(copy.detail).not.toContain('computer');
  });

  it.each(['darwin', 'win32', 'linux'])('keeps the computer wording for %s', (platform) => {
    const copy = deviceClearanceCopy(
      'waiting',
      { deviceName: 'Work MacBook', platform },
      REASON,
      60,
    );

    expect(copy.detail).toBe(
      `${REASON} Open ${PRODUCT_COPYRIGHT_NAME} ${PRODUCT_NAMES.desktop} on that computer to let the task carry on. If it is still offline after 60 minutes, the task continues without it.`,
    );
  });
});
