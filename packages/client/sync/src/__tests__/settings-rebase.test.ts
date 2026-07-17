import { describe, expect, it } from 'vitest';
import {
  diffCloudSafeSettings,
  mergeCloudSafeSettings,
  rebaseCloudSafeSettings,
} from '../settings';

describe('cloud-safe settings field-level rebase', () => {
  it('overlays only fields changed locally and preserves remote-only fields', () => {
    const result = rebaseCloudSafeSettings(
      {
        appearance: { theme: 'dark', contrast: 'high' },
        notifications: { enabled: false },
        editor: { remoteOnly: true },
      },
      {
        appearance: { theme: 'light' },
        notifications: { enabled: true },
      },
      {
        appearance: { theme: 'system' },
        notifications: { enabled: true },
      },
    );

    expect(result.localChanges).toEqual({ appearance: { theme: 'system' } });
    expect(result.settings).toEqual({
      appearance: { theme: 'system', contrast: 'high' },
      notifications: { enabled: false },
      editor: { remoteOnly: true },
    });
    expect(result.hasLocalChanges).toBe(true);
  });

  it('does not interpret fields omitted by a narrower surface as deletions', () => {
    expect(
      diffCloudSafeSettings(
        { personalization: { nickname: 'Sid', webOnlyStyle: 'dense' } },
        { personalization: { nickname: 'Sid' } },
      ),
    ).toEqual({});
    expect(
      mergeCloudSafeSettings(
        { personalization: { nickname: 'Sid', webOnlyStyle: 'dense' } },
        { personalization: { nickname: 'Siddhartha' } },
      ),
    ).toEqual({ personalization: { nickname: 'Siddhartha', webOnlyStyle: 'dense' } });
  });

  it('drops prototype-pollution keys from untrusted settings documents', () => {
    const untrusted = JSON.parse(
      '{"appearance":{"theme":"dark","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}}',
    );

    const merged = mergeCloudSafeSettings(untrusted, { appearance: { contrast: 'high' } });

    expect(JSON.stringify(merged)).not.toMatch(/__proto__|constructor|polluted/);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
