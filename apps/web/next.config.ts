import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withWorkflow } from 'workflow/next';

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
      //
      // BROWSER ONLY — deliberately no `default:` condition. Turbopack applies
      // `default:` to the server compilation as well, and until 2026-08-09 this
      // entry carried one: the built server got the stub instead of the builtin
      // (5 files under .next/server/chunks/ contained the stub body verbatim and
      // .next/server held zero `require("node:async_hooks")` calls). The stub
      // keeps its value in a single plain instance field, so on the server it
      // (a) drops the value at the first `await` and (b) shares one slot across
      // every request handled by the same instance — and Fluid Compute reuses an
      // instance across concurrent invocations, so a request-scoped store could
      // read another request's value. @clerk/nextjs server code and
      // lib/observability/trace-context.ts both bind AsyncLocalStorage at module
      // scope, so both were affected. Server and edge must get the real builtin.
      'node:async_hooks': {
        browser: './shared/lib/async-hooks-stub.ts',
      },
    },
  },
  // argon2 is a native addon: argon2.cjs picks its .node binary at require time
  // via node-gyp-build(__dirname), which output tracing can only follow to the
  // BUILD host's platform. Vercel builds on linux-x64 and runs the functions on
  // linux-arm64, so the single prebuild that got traced was never the one the
  // lambda needed:
  //   No native build was found for platform=linux arch=arm64 ... node=24.18.0
  //   loaded from: /var/task/node_modules/.pnpm/argon2@0.44.0/node_modules/argon2
  // api-key-service.ts touches argon2 at module scope and lib/api-auth.ts imports
  // it statically, so that miss took down every handler whose graph reaches it —
  // 143 of 196 API routes answered an empty-body 500 instead of a 401. Shipping
  // every prebuild removes the dependency on which machine built the deployment.
  // The glob targets the pnpm store path because that is the realpath __dirname
  // resolves to at runtime, as the error above shows.
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/.pnpm/argon2@*/node_modules/argon2/prebuilds/**'],
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
  //
  // Necessary but not sufficient. Rewrites are step 6 of Next's routing order
  // and proxy.ts is step 3, so the api-host bounce there still sees the raw
  // `/v1/...` path — not the rewritten `/api/llm/v1/...` its `/api/` guard
  // assumes — and 307s the request to the app host, where the `has` host
  // condition below can no longer match. That bounce must exempt `/v1/*` and
  // `/health` for any of this to fire. Redirecting instead of rewriting is not
  // an option: the hop is cross-origin, so clients drop the Authorization
  // header and a caller's API key never reaches the handler.
  //
  // Live as of 2026-08-09: api.agiworkforce.com/v1/chat/completions answers
  // 307 → agiworkforce.com/v1/chat/completions → 404 /_not-found.
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
      // Moved under /chat 2026-07-27. These four are reached from the chat
      // sidebar and belong to the chat workspace, but sat at the top level, so
      // opening one dropped out of `/chat` and its layout — including the auth
      // gate and the stream runtime provider. Nested, they inherit both.
      // Kept as redirects rather than deleted: they have been linkable URLs,
      // and `/library` is in robots.ts and the sitemap.
      { source: '/projects', destination: '/chat/projects', permanent: false },
      { source: '/projects/:id', destination: '/chat/projects/:id', permanent: false },
      { source: '/library', destination: '/chat/library', permanent: false },
      { source: '/schedules', destination: '/chat/schedules', permanent: false },
      { source: '/customize', destination: '/chat/customize', permanent: false },

      // ---------------------------------------------------------------------
      // Legal policy aliases. ONE canonical page per policy.
      //
      // `/terms-of-service`, `/privacy-policy` and `/cookie-policy` each used to
      // be an app-router page whose only job was to call `redirect()`. That
      // works, but it emits a 307 (temporary), renders a React route on every
      // hit, and carries no canonical metadata — so search engines and archive
      // tools kept treating the alias as a live, indexable legal document. These
      // are permanent aliases of a canonical policy, so they belong here as 308s
      // alongside the aliases above, and the stub pages are deleted.
      //
      // Duplicate legal text that drifts is a liability, not a convenience: keep
      // exactly one page per policy and alias everything else to it. Aliases are
      // excluded from `app/sitemap.ts` by design.
      // ---------------------------------------------------------------------
      { source: '/terms-of-service', destination: '/terms', permanent: true },
      { source: '/privacy-policy', destination: '/privacy', permanent: true },
      { source: '/cookie-policy', destination: '/cookies', permanent: true },
      // Acceptable use is commonly linked as /aup in security questionnaires and
      // vendor forms; both short forms resolve to the canonical page.
      { source: '/aup', destination: '/acceptable-use', permanent: true },
      { source: '/acceptable-use-policy', destination: '/acceptable-use', permanent: true },
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
      {
        // Narrow exception for the authenticated native PDF viewer. The file
        // route validates `preview=pdf` against the stored MIME before serving
        // bytes, so generated HTML/code can never use this frame permission.
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

export default withWorkflow(withBundleAnalyzer(nextConfig));
