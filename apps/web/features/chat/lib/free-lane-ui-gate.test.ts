import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FREE_LANE_UI_MODES,
  FREE_LANE_UI_QUERY_PARAM,
  FREE_LANE_UI_STORAGE_KEY,
  resolveFreeLaneUiBuildMode,
  resolveFreeLaneUiEnabled,
  resolveFreeLaneUiMode,
} from './free-lane-ui-gate';

const ENV_KEY = 'NEXT_PUBLIC_FREE_LANE_UI';

function setQuery(value: string | null) {
  const search = value === null ? '' : `?${FREE_LANE_UI_QUERY_PARAM}=${value}`;
  window.history.replaceState({}, '', `/${search}`);
}

afterEach(() => {
  setQuery(null);
  window.localStorage.clear();
  delete process.env[ENV_KEY];
  vi.restoreAllMocks();
});

describe('free lane ui gate', () => {
  /**
   * The server lane (`AGI_FREE_LANE_MODE`) is off, and this gate cannot read
   * it. Defaulting to on would put community-model copy on screen that the
   * routing does not honour.
   */
  it('stays off when nothing asks for the free-lane copy', () => {
    expect(resolveFreeLaneUiMode()).toBe(FREE_LANE_UI_MODES.off);
    expect(resolveFreeLaneUiEnabled()).toBe(false);
  });

  it('takes the build-time default when there is no override', () => {
    process.env[ENV_KEY] = FREE_LANE_UI_MODES.on;

    expect(resolveFreeLaneUiEnabled()).toBe(true);
  });

  it('lets a stored override beat the build-time default', () => {
    process.env[ENV_KEY] = FREE_LANE_UI_MODES.off;
    window.localStorage.setItem(FREE_LANE_UI_STORAGE_KEY, FREE_LANE_UI_MODES.on);

    expect(resolveFreeLaneUiEnabled()).toBe(true);
  });

  it('lets the query param beat both, so an e2e run can pin either side', () => {
    process.env[ENV_KEY] = FREE_LANE_UI_MODES.on;
    window.localStorage.setItem(FREE_LANE_UI_STORAGE_KEY, FREE_LANE_UI_MODES.on);
    setQuery(FREE_LANE_UI_MODES.off);

    expect(resolveFreeLaneUiEnabled()).toBe(false);
  });

  it('ignores values that name neither arm', () => {
    setQuery('community');
    window.localStorage.setItem(FREE_LANE_UI_STORAGE_KEY, 'yes');
    process.env[ENV_KEY] = FREE_LANE_UI_MODES.on;

    expect(resolveFreeLaneUiEnabled()).toBe(true);
  });

  /**
   * The two arms label the same slot differently, so a server render that
   * honoured a client-only override would hand the browser markup it never
   * produced.
   */
  it('gives a server render the build default no matter what the overrides say', () => {
    process.env[ENV_KEY] = FREE_LANE_UI_MODES.off;
    window.localStorage.setItem(FREE_LANE_UI_STORAGE_KEY, FREE_LANE_UI_MODES.on);
    setQuery(FREE_LANE_UI_MODES.on);

    expect(resolveFreeLaneUiBuildMode()).toBe(FREE_LANE_UI_MODES.off);
    expect(resolveFreeLaneUiMode()).toBe(FREE_LANE_UI_MODES.on);
  });

  it('lands off when the build-time default names nothing', () => {
    expect(resolveFreeLaneUiBuildMode()).toBe(FREE_LANE_UI_MODES.off);
  });

  it('falls through to the build-time default when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    process.env[ENV_KEY] = FREE_LANE_UI_MODES.on;

    expect(resolveFreeLaneUiEnabled()).toBe(true);
  });
});
