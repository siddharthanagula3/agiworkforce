import type { Metadata } from 'next';
import { OG_IMAGE } from '@/lib/seo/site';

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'See what AGI can do. Example projects showing AI automation, code generation, research, and desktop control.',
  keywords: [
    'AI automation examples',
    'AGI gallery',
    'AI agent demos',
    'automation showcase',
    'AI use case examples',
  ],
  openGraph: {
    title: 'Gallery',
    description:
      'Example projects showing AGI in action - code generation, research, automation, and more.',
    type: 'website',
    url: 'https://agiworkforce.com/gallery',
    images: [
      {
        url: OG_IMAGE.url,
        width: 1200,
        height: 630,
        alt: 'AGI Gallery',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gallery',
    description:
      'Example projects showing AGI in action - code generation, research, automation, and more.',
    images: [OG_IMAGE.url],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/gallery',
  },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
