import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

// Workspace dependency fix: Vercel build will now resolve packages directory
// This ensures @agiworkforce/types and @agiworkforce/utils are available

// Content Security Policy is now set per-request by proxy.ts with a nonce,
// replacing 'unsafe-inline' in script-src for stronger inline-script protection.
// See: apps/web/proxy.ts → buildCspWithNonce()

const configDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(configDir, '../..');

const nextConfig: NextConfig = {
  devIndicators: false,
  // Turbopack config (Next.js 16+ default bundler)
  turbopack: {
    root: workspaceRoot,
    resolveAlias: {
      // @webcontainer/api is optional — stub to empty module
      '@webcontainer/api': {
        browser: './shared/lib/empty-module.ts',
        default: './shared/lib/empty-module.ts',
      },
      // agentContext.ts uses AsyncLocalStorage from node:async_hooks, which is
      // unavailable in the browser. Stub async_hooks so client components that
      // transitively import @agiworkforce/client-runtime don't pull in Node-only APIs.
      'node:async_hooks': {
        browser: './shared/lib/async-hooks-stub.ts',
        default: './shared/lib/async-hooks-stub.ts',
      },
    },
  },
  // Type checking during build — all TS errors resolved as of 2026-02-28.
  typescript: {
    ignoreBuildErrors: false,
  },
  // Instrumentation is automatically enabled in Next.js 16+
  // See: apps/web/instrumentation.ts
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'framer-motion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      'sonner',
      'react-markdown',
      '@radix-ui/react-accordion',
      '@radix-ui/react-tabs',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-tooltip',
      'class-variance-authority',
    ],
  },
  // api.agiworkforce.com is this same Vercel project; the OpenAI-compatible
  // /v1/* surface maps onto the web-twin API routes by Host header. These
  // MUST live here, not in vercel.json — Vercel ignores vercel.json rewrites
  // for Next.js projects, which left the api host serving /_not-found for
  // every /v1 path in production (verified via x-matched-path, 2026-07-17).
  async rewrites() {
    const apiHost = [{ type: 'host' as const, value: 'api.agiworkforce.com' }];
    return [
      {
        source: '/v1/chat/completions',
        destination: '/api/llm/v1/chat/completions',
        has: apiHost,
      },
      { source: '/v1/models', destination: '/api/llm/v1/models', has: apiHost },
      {
        source: '/v1/credits/balance',
        destination: '/api/llm/v1/credits/balance',
        has: apiHost,
      },
      {
        source: '/v1/audio/transcriptions',
        destination: '/api/llm/v1/audio/transcriptions',
        has: apiHost,
      },
      { source: '/health', destination: '/api/health', has: apiHost },
    ];
  },

  // /chat is a native Next.js route (app/chat). The old static-SPA-from-public/chat
  // architecture was removed in restructure Wave 1 (2026-07-09).
  async redirects() {
    return [
      // Brand rename 2026-06-13
      { source: '/cowork', destination: '/agi-work', permanent: true },
      // Retired route aliases (restructure Wave 1): keep old URLs working
      { source: '/chats', destination: '/chat', permanent: false },
      { source: '/chat-multi', destination: '/chat', permanent: false },
    ];
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'off',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(self), geolocation=(), interest-cohort=(), payment=(), usb=(), xr-spatial-tracking=(), picture-in-picture=(), encrypted-media=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
        ],
      },
    ];
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env['ANALYZE'] === 'true',
});

export default withBundleAnalyzer(nextConfig);
