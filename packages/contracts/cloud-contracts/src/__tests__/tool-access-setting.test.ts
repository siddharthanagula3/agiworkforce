import { describe, expect, it } from 'vitest';

import {
  capabilitySwitchAvailable,
  DEFAULT_TOOL_ACCESS_MODE,
  isToolAccessMode,
  parseToolAccessMode,
  TOOL_ACCESS_MODES,
  TOOL_ACCESS_SETTING_KEY,
} from '../index';

describe('the tool access setting', () => {
  it('keeps the three known modes and reads anything else as the default', () => {
    for (const mode of TOOL_ACCESS_MODES) {
      expect(isToolAccessMode(mode)).toBe(true);
      expect(parseToolAccessMode(mode)).toBe(mode);
    }
    expect(DEFAULT_TOOL_ACCESS_MODE).toBe('auto');
    expect(parseToolAccessMode('ALWAYS')).toBe(DEFAULT_TOOL_ACCESS_MODE);
    expect(parseToolAccessMode(undefined)).toBe(DEFAULT_TOOL_ACCESS_MODE);
    expect(isToolAccessMode(3)).toBe(false);
  });

  it('is available only when the server lists its key in a well-formed list', () => {
    expect(capabilitySwitchAvailable([TOOL_ACCESS_SETTING_KEY], TOOL_ACCESS_SETTING_KEY)).toBe(
      true,
    );
    expect(
      capabilitySwitchAvailable(
        ['a-switch-from-a-later-server', TOOL_ACCESS_SETTING_KEY],
        TOOL_ACCESS_SETTING_KEY,
      ),
    ).toBe(true);
    expect(capabilitySwitchAvailable(['artifacts'], TOOL_ACCESS_SETTING_KEY)).toBe(false);
    expect(capabilitySwitchAvailable(TOOL_ACCESS_SETTING_KEY, TOOL_ACCESS_SETTING_KEY)).toBe(false);
    expect(capabilitySwitchAvailable([TOOL_ACCESS_SETTING_KEY, 3], TOOL_ACCESS_SETTING_KEY)).toBe(
      false,
    );
    expect(capabilitySwitchAvailable(undefined, TOOL_ACCESS_SETTING_KEY)).toBe(false);
  });
});
