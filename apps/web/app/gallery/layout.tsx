import type { Metadata } from 'next';

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
        url: '/app-preview.png',
        width: 1024,
        height: 665,
        alt: 'AGI Gallery',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gallery',
    description:
      'Example projects showing AGI in action - code generation, research, automation, and more.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/gallery',
  },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
