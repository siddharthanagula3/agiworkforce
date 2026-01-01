import type { NextConfig } from 'next';

// Workspace dependency fix: Vercel build will now resolve packages directory
// This ensures @agiworkforce/types and @agiworkforce/utils are available

// Content Security Policy configuration
// Note: 'unsafe-inline' for styles is needed for Next.js/React styling
// In production, consider using nonces for stricter CSP
//
// Note about font-src: External fonts from domains like r2cdn.perplexity.ai may be blocked.
// This is expected behavior - CSP only allows fonts from 'self', fonts.gstatic.com, and data:.
// If you see font loading errors in console from browser extensions or third-party scripts,
// this is the CSP working correctly to prevent unauthorized resource loading.
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: blob: https: http:;
  font-src 'self' https://fonts.gstatic.com data:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://vitals.vercel-insights.com https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com;
  frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com;
  frame-ancestors 'self';
  form-action 'self';
  base-uri 'self';
  object-src 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, ' ')
  .trim();

const nextConfig: NextConfig = {
  // Middleware configuration for authentication
  // Using middleware for request-level auth checks (Session & Subscription validation)
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
            value: 'SAMEORIGIN',
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
            value: 'camera=(), microphone=(), geolocation=()',
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
