import { describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect }));

import { APP_NAV_DESTINATIONS } from '@shared/components/layout/app-nav-items';

import ChatArtifactsRoute from './page';

// The route is typed `never` because redirect() throws; the mock above returns
// normally, so call it through a void signature or TS marks every assertion
// after it unreachable.
const runRoute = ChatArtifactsRoute as unknown as () => void;

describe('/chat/artifacts route', () => {
  it('redirects onto the Artifacts view of Library', () => {
    redirect.mockClear();
    runRoute();

    expect(redirect).toHaveBeenCalledWith('/chat/library?surface=artifact');
  });

  it('lands on the Artifacts filter rather than the unfiltered Library', () => {
    // A user following an old Artifacts bookmark expects artifacts, not every
    // file on the account. `surface` is the classification the server already
    // wrote in classifyGeneratedFile, so this is a filter, not a new concept.
    redirect.mockClear();
    runRoute();

    const target = new URL(String(redirect.mock.calls[0]?.[0]), 'https://app.test');
    expect(target.pathname).toBe('/chat/library');
    expect(target.searchParams.get('surface')).toBe('artifact');
  });
});

describe('Artifacts rail destination', () => {
  it('no longer exists as its own rail entry', () => {
    expect(APP_NAV_DESTINATIONS.find((d) => d.id === 'artifacts')).toBeUndefined();
  });

  it('lights exactly one rail entry on /chat/artifacts', () => {
    // `chat-home` claims every /chat/... path that is not its own section, so
    // omitting /chat/artifacts from CHAT_SECTION_PREFIXES would light both Chat
    // and Library at once while the redirect is in flight.
    const active = APP_NAV_DESTINATIONS.filter((d) => d.isActive('/chat/artifacts'));

    expect(active.map((d) => d.id)).toEqual(['library']);
  });

  it('lights Library on its own route too', () => {
    const active = APP_NAV_DESTINATIONS.filter((d) => d.isActive('/chat/library'));

    expect(active.map((d) => d.id)).toEqual(['library']);
  });

  it('does not claim the public /gallery route', () => {
    // /gallery keeps the marketing chrome, the SEO metadata and the sitemap
    // entry for signed-out visitors; the rail must not send anyone there.
    expect(APP_NAV_DESTINATIONS.filter((d) => d.isActive('/gallery'))).toEqual([]);
  });
});
