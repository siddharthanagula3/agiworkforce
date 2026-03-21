import type { NextConfig } from 'next';

// Workspace dependency fix: Vercel build will now resolve packages directory
// This ensures @agiworkforce/types and @agiworkforce/utils are available

// Content Security Policy is now set per-request by proxy.ts with a nonce,
// replacing 'unsafe-inline' in script-src for stronger inline-script protection.
// See: apps/web/proxy.ts → buildCspWithNonce()

const nextConfig: NextConfig = {
  // Turbopack config (Next.js 16+ default bundler)
  turbopack: {
    resolveAlias: {
      // @webcontainer/api is optional — stub to empty module
      '@webcontainer/api': {
        browser: './shared/lib/empty-module.ts',
        default: './shared/lib/empty-module.ts',
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
    optimizePackageImports: ['@supabase/ssr'],
  },
  // Chat app is served as static files from public/chat/ (built from apps/desktop Vite app)
  // SPA fallback rewrite is in vercel.json: /chat/:path* → /chat/index.html
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
              'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=(), xr-spatial-tracking=(), picture-in-picture=(), encrypted-media=()',
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

export default nextConfig;
