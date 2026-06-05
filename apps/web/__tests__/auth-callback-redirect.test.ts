import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from '@/app/auth/callback/route';

describe('/auth/callback retired route', () => {
  it('redirects stale OAuth callbacks to the visible auth error page', async () => {
    const response = await GET(new NextRequest('http://localhost/auth/callback?code=old-code'));
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    expect(location).toContain('/auth/error');
    expect(location).toContain('auth_route_removed');
  });
});
