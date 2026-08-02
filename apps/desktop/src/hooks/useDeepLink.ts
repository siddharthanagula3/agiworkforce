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

/**
 * Deep-link path Clerk redirects to after a social/SSO sign-in completes in the
 * system browser. Google, Microsoft, and Apple all refuse OAuth inside embedded
 * webviews, so that hop is unavoidable — this is how the result comes home.
 *
 * Clerk appends `rotating_token_nonce` only when the redirect URL is
 * allowlisted on the Clerk instance (see `@clerk/expo` `useSSO`). A callback
 * without the nonce is therefore surfaced as an error rather than silently
 * dropped, so a missing dashboard entry is visible instead of looking like a
 * hang.
 */
export const CLOUD_SSO_CALLBACK_PATH = '/sso-callback';

export type ParsedDeepLink =
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
    }
  | {
      kind: 'cloud-sso-callback';
      detail: {
        rotatingTokenNonce: string;
        url: string;
      };
    }
  | {
      kind: 'cloud-sso-error';
      detail: {
        error: string;
        error_description: string;
        url: string;
      };
    };

export function useDeepLink(enabled = true) {
  useEffect(() => {
    if (!enabled || !isTauri) return;

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
  }, [enabled]);
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

    const allParams = queryParams;
    const normalizedPathname = normalizeDeepLinkPath(parsed);

    // Cloud social/SSO sign-in return leg.
    //
    // Accept both `agiworkforce://sso-callback` (host form, which normalizes to
    // a trailing slash) and `agiworkforce:///sso-callback` (path form). Which
    // one arrives depends on how the OS hands the URL over, and a
    // one-character difference must not silently drop a completed sign-in.
    if (normalizedPathname.replace(/\/$/, '') === CLOUD_SSO_CALLBACK_PATH) {
      const error = allParams['error'];
      if (error) {
        return {
          kind: 'cloud-sso-error',
          detail: {
            error,
            error_description: allParams['error_description'] || '',
            url,
          },
        };
      }

      const rotatingTokenNonce = allParams['rotating_token_nonce'];
      if (rotatingTokenNonce) {
        return {
          kind: 'cloud-sso-callback',
          detail: { rotatingTokenNonce, url },
        };
      }

      return {
        kind: 'cloud-sso-error',
        detail: {
          error: 'missing_rotating_token_nonce',
          error_description:
            'The provider returned without an authorization nonce. The AGI Desktop callback URL is not allowlisted on the AGI account service.',
          url,
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

  if (parsedLink.kind === 'cloud-sso-callback' || parsedLink.kind === 'cloud-sso-error') {
    window.dispatchEvent(
      new CustomEvent(parsedLink.kind, {
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
