import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MESSAGE_VARIANTS_MODES,
  MESSAGE_VARIANTS_QUERY_PARAM,
  MESSAGE_VARIANTS_STORAGE_KEY,
  resolveMessageVariantsBuildEnabled,
  resolveMessageVariantsBuildMode,
  resolveMessageVariantsEnabled,
  resolveMessageVariantsMode,
} from './message-variants-gate';

const ENV_KEY = 'NEXT_PUBLIC_MESSAGE_VARIANTS';

function setQuery(value: string | null) {
  const search = value === null ? '' : `?${MESSAGE_VARIANTS_QUERY_PARAM}=${value}`;
  window.history.replaceState({}, '', `/${search}`);
}

afterEach(() => {
  setQuery(null);
  window.localStorage.clear();
  delete process.env[ENV_KEY];
  vi.restoreAllMocks();
});

describe('message variants gate', () => {
  it('keeps regenerate replacing until something asks for variants', () => {
    expect(resolveMessageVariantsMode()).toBe(MESSAGE_VARIANTS_MODES.off);
    expect(resolveMessageVariantsEnabled()).toBe(false);
  });

  it('takes the build-time default when there is no override', () => {
    process.env[ENV_KEY] = MESSAGE_VARIANTS_MODES.on;

    expect(resolveMessageVariantsEnabled()).toBe(true);
  });

  it('lets a stored override beat the build-time default', () => {
    process.env[ENV_KEY] = MESSAGE_VARIANTS_MODES.off;
    window.localStorage.setItem(MESSAGE_VARIANTS_STORAGE_KEY, MESSAGE_VARIANTS_MODES.on);

    expect(resolveMessageVariantsEnabled()).toBe(true);
  });

  it('lets the query param beat both, so an e2e run can pin either side', () => {
    process.env[ENV_KEY] = MESSAGE_VARIANTS_MODES.on;
    window.localStorage.setItem(MESSAGE_VARIANTS_STORAGE_KEY, MESSAGE_VARIANTS_MODES.on);
    setQuery(MESSAGE_VARIANTS_MODES.off);

    expect(resolveMessageVariantsEnabled()).toBe(false);
  });

  it('ignores values that name neither behaviour', () => {
    setQuery('yes');
    window.localStorage.setItem(MESSAGE_VARIANTS_STORAGE_KEY, 'true');
    process.env[ENV_KEY] = MESSAGE_VARIANTS_MODES.on;

    expect(resolveMessageVariantsEnabled()).toBe(true);
  });

  /**
   * The pager occupies a slot in the action row, so a server render that honoured
   * a client-only override would hand the browser a row it never produced.
   */
  it('gives a server render the build default no matter what the overrides say', () => {
    process.env[ENV_KEY] = MESSAGE_VARIANTS_MODES.off;
    window.localStorage.setItem(MESSAGE_VARIANTS_STORAGE_KEY, MESSAGE_VARIANTS_MODES.on);
    setQuery(MESSAGE_VARIANTS_MODES.on);

    expect(resolveMessageVariantsBuildMode()).toBe(MESSAGE_VARIANTS_MODES.off);
    expect(resolveMessageVariantsBuildEnabled()).toBe(false);
    expect(resolveMessageVariantsEnabled()).toBe(true);
  });

  it('lands off when the build-time default names nothing', () => {
    expect(resolveMessageVariantsBuildMode()).toBe(MESSAGE_VARIANTS_MODES.off);
  });

  it('falls through to the build-time default when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    process.env[ENV_KEY] = MESSAGE_VARIANTS_MODES.on;

    expect(resolveMessageVariantsEnabled()).toBe(true);
  });
});
