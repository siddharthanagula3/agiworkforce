jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: { cloudTasks: true, research: false, schedules: true },
}));

import {
  nativeRouteForProductLink,
  productLinkWebFallbackUrl,
  readProductLink,
} from '../lib/productLinks';
import { API_URL } from '../lib/constants';

describe('product links on mobile', () => {
  it('reads a link only from a known target and a safe id', () => {
    expect(readProductLink({ target: 'work', targetId: 'run-1' })).toEqual({
      target: 'work',
      id: 'run-1',
    });
    expect(readProductLink({ target: 'invoice', targetId: 'inv-1' })).toBeNull();
    expect(readProductLink({ target: 'work', targetId: '../settings' })).toBeNull();
    expect(readProductLink(undefined)).toBeNull();
  });

  it('opens the native screen when this build ships it', () => {
    expect(nativeRouteForProductLink({ target: 'browser-task', id: 'run-1' })).toBe('/(app)/tasks');
    expect(nativeRouteForProductLink({ target: 'file', id: 'asset-1' })).toBe('/(app)/library');
  });

  it('falls back to the web resolver when the native screen is switched off', () => {
    const link = { target: 'research' as const, id: 'report-1' };
    expect(nativeRouteForProductLink(link)).toBeNull();
    expect(productLinkWebFallbackUrl(link)).toBe(
      new URL('/open/research/report-1', API_URL).toString(),
    );
  });
});
