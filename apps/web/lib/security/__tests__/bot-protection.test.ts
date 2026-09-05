import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BOT_PROTECTION_ENV_VAR,
  BOT_PROTECTION_MODES,
  BOT_PROTECTION_PUBLIC_ENV_VAR,
  clientBotProtectionMode,
  parseBotProtectionMode,
  resolveBotProtectionMode,
} from '../bot-protection';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseBotProtectionMode', () => {
  it('accepts the declared modes case- and space-insensitively', () => {
    expect(parseBotProtectionMode(' Platform ')).toBe(BOT_PROTECTION_MODES.platform);
    expect(parseBotProtectionMode('OFF')).toBe(BOT_PROTECTION_MODES.off);
  });

  it('rejects anything else', () => {
    expect(parseBotProtectionMode(undefined)).toBeUndefined();
    expect(parseBotProtectionMode('')).toBeUndefined();
    expect(parseBotProtectionMode('true')).toBeUndefined();
  });
});

describe('resolveBotProtectionMode', () => {
  it('honours the explicit server name over everything else', () => {
    expect(
      resolveBotProtectionMode(
        {
          [BOT_PROTECTION_ENV_VAR]: BOT_PROTECTION_MODES.off,
          [BOT_PROTECTION_PUBLIC_ENV_VAR]: BOT_PROTECTION_MODES.platform,
        },
        true,
      ),
    ).toBe(BOT_PROTECTION_MODES.off);
  });

  it('falls back to the public name so one build-time value drives both halves', () => {
    expect(
      resolveBotProtectionMode({ [BOT_PROTECTION_PUBLIC_ENV_VAR]: BOT_PROTECTION_MODES.off }, true),
    ).toBe(BOT_PROTECTION_MODES.off);
  });

  it('defaults to the platform provider only where the platform is hosting', () => {
    expect(resolveBotProtectionMode({}, true)).toBe(BOT_PROTECTION_MODES.platform);
    expect(resolveBotProtectionMode({}, false)).toBe(BOT_PROTECTION_MODES.off);
  });

  it('ignores an unrecognised value and uses the hosting default', () => {
    expect(resolveBotProtectionMode({ [BOT_PROTECTION_ENV_VAR]: 'yes' }, false)).toBe(
      BOT_PROTECTION_MODES.off,
    );
  });
});

describe('clientBotProtectionMode', () => {
  it('stays on when the build left the public name unset', () => {
    vi.stubEnv(BOT_PROTECTION_PUBLIC_ENV_VAR, '');
    expect(clientBotProtectionMode()).toBe(BOT_PROTECTION_MODES.platform);
  });

  it('turns off for a build that declared it off', () => {
    vi.stubEnv(BOT_PROTECTION_PUBLIC_ENV_VAR, BOT_PROTECTION_MODES.off);
    expect(clientBotProtectionMode()).toBe(BOT_PROTECTION_MODES.off);
  });
});
