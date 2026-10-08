import { describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect }));

import { APP_NAV_DESTINATIONS } from '@shared/components/layout/app-nav-items';

import ChatImagesRoute from './page';

const runRoute = ChatImagesRoute as unknown as () => void;

describe('/chat/images route', () => {
  it('redirects onto the Images tab of Library', () => {
    redirect.mockClear();
    runRoute();

    const target = new URL(String(redirect.mock.calls[0]?.[0]), 'https://app.test');
    expect(target.pathname).toBe('/chat/library');
    expect(target.searchParams.get('tab')).toBe('images');
  });

  it('is no longer its own rail entry', () => {
    expect(APP_NAV_DESTINATIONS.find((d) => d.id === 'images')).toBeUndefined();
  });

  it('lights no rail entry while the redirect is in flight', () => {
    expect(APP_NAV_DESTINATIONS.filter((d) => d.isActive('/chat/images'))).toEqual([]);
  });
});
