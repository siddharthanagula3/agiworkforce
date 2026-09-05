import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withBotId } from 'botid/next/config';
import { withWorkflow } from 'workflow/next';
import { API_HOST_REWRITE_ROUTES } from './lib/api-host-route-contract';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(configDir, '../..');

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
    resolveAlias: {
      '@webcontainer/api': {
        browser: './shared/lib/empty-module.ts',
        default: './shared/lib/empty-module.ts',
      },
      'node:async_hooks': {
        browser: './shared/lib/async-hooks-stub.ts',
      },
    },
  },
  outputFileTracingIncludes: {
    '/**': [
      '../../.agents/skills/**',
      '../../skills-lock.json',
      '../../node_modules/.pnpm/argon2@*/node_modules/argon2/prebuilds/**',
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  serverExternalPackages: ['undici'],
  experimental: {
    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false,
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
  async rewrites() {
    const apiHost = [{ type: 'host' as const, value: 'api.agiworkforce.com' }];
    return API_HOST_REWRITE_ROUTES.map(({ source, destination }) => ({
      source,
      destination,
      has: apiHost,
    }));
  },

  async redirects() {
    return [
      { source: '/cowork', destination: '/agi-work', permanent: true },
      { source: '/chats', destination: '/chat', permanent: false },
      { source: '/chat-multi', destination: '/chat', permanent: false },
      { source: '/projects', destination: '/chat/projects', permanent: false },
      { source: '/projects/:id', destination: '/chat/projects/:id', permanent: false },
      { source: '/library', destination: '/chat/library', permanent: false },
      { source: '/schedules', destination: '/chat/schedules', permanent: false },
      { source: '/customize', destination: '/chat/customize', permanent: false },

      { source: '/terms-of-service', destination: '/terms', permanent: true },
      { source: '/privacy-policy', destination: '/privacy', permanent: true },
      { source: '/cookie-policy', destination: '/cookies', permanent: true },
      { source: '/aup', destination: '/acceptable-use', permanent: true },
      { source: '/acceptable-use-policy', destination: '/acceptable-use', permanent: true },
    ];
  },

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
      {
        source: '/api/files/:id',
        has: [{ type: 'query', key: 'preview', value: 'pdf' }],
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ];
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env['ANALYZE'] === 'true',
});

export default withWorkflow(withBotId(withBundleAnalyzer(nextConfig)));
