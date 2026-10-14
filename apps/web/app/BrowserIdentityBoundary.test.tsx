// @vitest-environment node

import type { ReactNode } from 'react';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserIdentityBoundary } from './BrowserIdentityBoundary';
import { useSession } from '@/lib/identity/client';

const navigation = vi.hoisted(() => ({ pathname: '/', segments: [] as string[] }));
const MISSING_PROVIDER_ERROR = /useAuth[\s\S]*ClerkProvider/;

vi.mock('next/navigation', async (importOriginal) => {
  type NavigationModule = typeof import('next/navigation');
  const actual = await importOriginal<NavigationModule>();
  return {
    ...actual,
    usePathname: () => navigation.pathname,
    useSelectedLayoutSegments: () => navigation.segments,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  };
});

function SessionReader() {
  const session = useSession();
  return <p>{session.userId ?? 'Anonymous artifact viewer'}</p>;
}

function renderServer(element: ReactNode): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    let html = '';
    output.on('data', (chunk: Buffer) => {
      html += chunk.toString();
    });
    output.on('end', () => resolve(html));
    output.on('error', reject);
    const stream = renderToPipeableStream(element, {
      onAllReady: () => stream.pipe(output),
      onError: reject,
      onShellError: () => output.destroy(),
    });
  });
}

describe('BrowserIdentityBoundary', () => {
  const fetch = vi.fn(() => Promise.reject(new Error('Network is unavailable in this control')));

  beforeEach(() => {
    vi.stubEnv(
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      `pk_test_${Buffer.from('clerk-fixture.invalid$').toString('base64')}`,
    );
    vi.stubGlobal('fetch', fetch);
    navigation.pathname = '/';
    navigation.segments = [];
  });

  afterEach(() => {
    try {
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('detects the real missing-provider failure without replacing the session hook', async () => {
    await expect(renderServer(<SessionReader />)).rejects.toThrow(MISSING_PROVIDER_ERROR);
  });

  it.each(['direct', 'rewrite'])(
    'supplies the real provider for a %s published-artifact route',
    async (mode) => {
      const token = 'a'.repeat(24);
      navigation.pathname = mode === 'direct' ? `/shared-artifact/${token}` : '/';
      navigation.segments = mode === 'direct' ? [] : ['shared-artifact', token];
      await expect(
        renderServer(
          <BrowserIdentityBoundary>
            <SessionReader />
          </BrowserIdentityBoundary>,
        ),
      ).resolves.toContain('Anonymous artifact viewer');
      await expect(renderServer(<SessionReader />)).rejects.toThrow(MISSING_PROVIDER_ERROR);
    },
  );
});
