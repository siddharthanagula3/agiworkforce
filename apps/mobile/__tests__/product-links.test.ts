jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: { cloudTasks: true, research: false, schedules: true, cloudChat: true },
}));

import {
  nativeRouteForProductLink,
  productLinkWebFallbackUrl,
  readProductLink,
  resolveNativeProductLinkRoute,
} from '../src/features/notifications/productLinks';
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

  it('opens an account chat on its own conversation screen', () => {
    expect(nativeRouteForProductLink({ target: 'chat', id: 'conv-1' })).toBe('/(app)/chat/conv-1');
  });

  it('opens a chat already on this device without waiting for a sync', async () => {
    const sync = jest.fn(async () => undefined);
    const route = await resolveNativeProductLinkRoute(
      { target: 'chat', id: 'conv-1' },
      { hasConversation: () => true, sync },
    );
    expect(route).toBe('/(app)/chat/conv-1');
    expect(sync).not.toHaveBeenCalled();
  });

  it('pulls the account history once before opening a chat started elsewhere', async () => {
    let synced = false;
    const route = await resolveNativeProductLinkRoute(
      { target: 'chat', id: 'conv-2' },
      {
        hasConversation: () => synced,
        sync: async () => {
          synced = true;
        },
      },
    );
    expect(route).toBe('/(app)/chat/conv-2');
  });

  it('hands a chat this account cannot load to the web resolver instead of an empty screen', async () => {
    const route = await resolveNativeProductLinkRoute(
      { target: 'chat', id: 'conv-3' },
      { hasConversation: () => false, sync: async () => undefined },
    );
    expect(route).toBeNull();
  });

  it('resolves other targets without touching chat history', async () => {
    const sync = jest.fn(async () => undefined);
    const route = await resolveNativeProductLinkRoute(
      { target: 'file', id: 'asset-1' },
      { hasConversation: () => false, sync },
    );
    expect(route).toBe('/(app)/library');
    expect(sync).not.toHaveBeenCalled();
  });
});
