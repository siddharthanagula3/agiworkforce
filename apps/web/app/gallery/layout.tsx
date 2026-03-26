import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'See what AGI Workforce can do. Real examples of AI automation, code generation, research, and desktop control from real users.',
  keywords: [
    'AI automation examples',
    'AGI Workforce gallery',
    'AI agent demos',
    'automation showcase',
    'AI use case examples',
  ],
  openGraph: {
    title: 'Gallery | AGI Workforce',
    description:
      'Real examples of AGI Workforce in action — code generation, research, automation, and more.',
    type: 'website',
    url: 'https://agiworkforce.com/gallery',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce Gallery',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gallery | AGI Workforce',
    description:
      'Real examples of AGI Workforce in action — code generation, research, automation, and more.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/gallery',
  },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Gallery',
            description:
              'See what AGI Workforce can do. Real examples of AI automation, code generation, research, and desktop control.',
            url: 'https://agiworkforce.com/gallery',
          }),
        }}
      />
      {children}
    </>
  );
}
