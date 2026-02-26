import type { NextConfig } from 'next';

// Workspace dependency fix: Vercel build will now resolve packages directory
// This ensures @agiworkforce/types and @agiworkforce/utils are available

// Content Security Policy is now set per-request by middleware.ts with a nonce,
// replacing 'unsafe-inline' in script-src for stronger inline-script protection.
// See: apps/web/middleware.ts → buildCspWithNonce()

const nextConfig: NextConfig = {
  // Instrumentation is automatically enabled in Next.js 16+
  // See: apps/web/instrumentation.ts
  experimental: {
    optimizePackageImports: ['@supabase/ssr'],
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
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
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
