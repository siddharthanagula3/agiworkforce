import { useEffect } from 'react';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { isTauri } from '../lib/tauri-mock';

const ALLOWED_DEEP_LINK_SCHEME = 'agiworkforce:';
const ALLOWED_MCP_OAUTH_PROVIDERS = new Set([
  'github',
  'google',
  'slack',
  'notion',
  'figma',
  'microsoft',
  'atlassian',
]);

export type ParsedDeepLink =
  | {
      kind: 'auth-callback';
      detail: Record<string, string>;
    }
  | {
      kind: 'mcp-oauth-callback';
      detail: {
        provider: string;
        code: string;
        state: string;
        url: string;
      };
    }
  | {
      kind: 'mcp-oauth-error';
      detail: {
        provider: string;
        error: string;
        error_description: string;
        url: string;
      };
    };

export function useDeepLink() {
  useEffect(() => {
    if (!isTauri) return;

    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const unlisten = await onOpenUrl((urls) => {
          if (!isMounted) return; // Guard against unmounted callbacks
          for (const url of urls) {
            handleDeepLink(url);
          }
        });

        // Only store unlisten if we're still mounted
        if (isMounted) {
          unlistenFn = unlisten;
        } else {
          // Component unmounted while setting up - cleanup immediately
          unlisten();
        }
      } catch (error) {
        console.error('[DeepLink] Failed to setup listener:', error);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
        unlistenFn = null;
      }
    };
  }, []);
}

export function normalizeDeepLinkPath(parsed: URL): string {
  const route = `${parsed.host ? `/${parsed.host}` : ''}${parsed.pathname || '/'}`;
  return route.replace(/\/{2,}/g, '/');
}

export function parseDeepLink(url: string): ParsedDeepLink | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== ALLOWED_DEEP_LINK_SCHEME) {
      return null;
    }

    // Extract params from query string
    const queryParams = Object.fromEntries(parsed.searchParams.entries());

    // Extract params from hash fragment (Supabase often puts them here for implicit flow)
    // format: #access_token=...&refresh_token=...
    let hashParams: Record<string, string> = {};
    if (parsed.hash) {
      const hashStr = parsed.hash.substring(1); // remove #
      const hashSearchParams = new URLSearchParams(hashStr);
      hashParams = Object.fromEntries(hashSearchParams.entries());
    }

    const allParams = { ...queryParams, ...hashParams };
    const normalizedPathname = normalizeDeepLinkPath(parsed);

    // Check for Supabase auth callback (OAuth2 PKCE flow)
    if (normalizedPathname === '/auth/callback') {
      if (!allParams['code'] && !allParams['access_token'] && !allParams['refresh_token']) {
        return null;
      }
      return {
        kind: 'auth-callback',
        detail: {
          url,
          ...allParams,
        },
      };
    }

    // Check for MCP OAuth callback URLs
    // Pattern: agiworkforce://oauth/mcp/{provider}?code={code}&state={state}
    // Or error: agiworkforce://oauth/mcp/{provider}?error={error}&error_description={description}
    const mcpOAuthMatch = normalizedPathname.match(/^\/oauth\/mcp\/([a-zA-Z0-9_-]+)$/);
    if (mcpOAuthMatch) {
      const provider = mcpOAuthMatch[1]!.toLowerCase();
      if (!ALLOWED_MCP_OAUTH_PROVIDERS.has(provider)) {
        return null;
      }
      const error = allParams['error'];
      const errorDescription = allParams['error_description'];
      const code = allParams['code'];
      const state = allParams['state'];

      if (error) {
        return {
          kind: 'mcp-oauth-error',
          detail: {
            provider,
            error,
            error_description: errorDescription || '',
            url,
          },
        };
      }

      if (code && state) {
        return {
          kind: 'mcp-oauth-callback',
          detail: {
            provider,
            code,
            state,
            url,
          },
        };
      }

      return null;
    }

    return null;
  } catch (e) {
    console.error('[DeepLink] Invalid URL:', url, e);
    return null;
  }
}

function handleDeepLink(url: string) {
  const parsedLink = parseDeepLink(url);
  if (!parsedLink) {
    return;
  }

  if (parsedLink.kind === 'auth-callback') {
    const code = parsedLink.detail['code'];
    if (code) {
      (async () => {
        try {
          const { supabaseAuth } = await import('../services/supabaseAuth');
          await supabaseAuth.exchangeCodeForSession(code);
        } catch (error) {
          console.error('[DeepLink] Auth callback exchange failed:', error);
        }
      })();
    }

    window.dispatchEvent(
      new CustomEvent('agi-deep-link', {
        detail: parsedLink.detail,
      }),
    );
    return;
  }

  if (parsedLink.kind === 'mcp-oauth-error') {
    window.dispatchEvent(
      new CustomEvent('mcp-oauth-error', {
        detail: parsedLink.detail,
      }),
    );
    window.dispatchEvent(
      new CustomEvent('agi-deep-link', {
        detail: parsedLink.detail,
      }),
    );
    return;
  }

  window.dispatchEvent(
    new CustomEvent('mcp-oauth-callback', {
      detail: parsedLink.detail,
    }),
  );
  window.dispatchEvent(
    new CustomEvent('agi-deep-link', {
      detail: parsedLink.detail,
    }),
  );
}

/** @deprecated Use `parseDeepLink` for validation before dispatching events. */
export function handleDeepLinkForTests(url: string) {
  handleDeepLink(url);
}
