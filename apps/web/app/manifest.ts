import type { MetadataRoute } from 'next';

// Next.js App Router file convention: automatically served at /manifest.webmanifest
// and linked into <head> — no manual <link rel="manifest"> or metadata.manifest needed.
// https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AGI | One AI workspace across models and tools.',
    short_name: 'AGI',
    description:
      'AI workspace for chat, code, research, files, projects, artifacts, tools, connectors, memory, and automation with explicit Local, BYOK, and managed cloud modes.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      {
        src: '/logo-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logo-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
