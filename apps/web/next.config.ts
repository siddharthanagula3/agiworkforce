import type { NextConfig } from 'next';

// Workspace dependency fix: Vercel build will now resolve packages directory
// This ensures @agiworkforce/types and @agiworkforce/utils are available

// Content Security Policy configuration
// SECURITY NOTES:
// - 'unsafe-inline' for styles: Required for Next.js/React inline styles and Stripe Elements.
//   Consider using nonces in future for stricter CSP (requires custom server).
// - 'unsafe-eval' for scripts: Required for Stripe.js fraud detection and some React dev tools.
//   In production, Stripe.js requires eval for device fingerprinting. If you can accept
//   reduced fraud protection, consider removing 'unsafe-eval' and using Stripe Elements in
//   strict mode, though this may affect payment success rates.
// - 'wasm-unsafe-eval': Allows WebAssembly compilation without full 'unsafe-eval'
//
// Note about font-src: External fonts from domains like r2cdn.perplexity.ai may be blocked.
// This is expected behavior - CSP only allows fonts from 'self', fonts.gstatic.com, and data:.
// If you see font loading errors in console from browser extensions or third-party scripts,
// this is the CSP working correctly to prevent unauthorized resource loading.
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.stripe.com https://challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.stripe.com;
  img-src 'self' data: blob: https:;
  font-src 'self' https://fonts.gstatic.com https://js.stripe.com data:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://vitals.vercel-insights.com https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com;
  frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com;
  frame-ancestors 'none';
  form-action 'self';
  base-uri 'self';
  object-src 'none';
  upgrade-insecure-requests;
  block-all-mixed-content;
`
  .replace(/\s{2,}/g, ' ')
  .trim();

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
            value: 'on',
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
          {
            key: 'Content-Security-Policy',
            value: ContentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
