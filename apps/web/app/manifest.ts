import type { MetadataRoute } from 'next';
import { PRODUCT_NAMES } from '@agiworkforce/types';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAMES.chat,
    short_name: PRODUCT_NAMES.chat,
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
