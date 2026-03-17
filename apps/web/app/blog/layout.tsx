import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'News, tutorials, and updates from the AGI Workforce team. Learn about AI automation, desktop agents, and the latest features.',
  keywords: [
    'AI blog',
    'AI automation news',
    'AGI Workforce updates',
    'AI agent tutorials',
    'desktop AI',
  ],
  openGraph: {
    title: 'Blog | AGI Workforce',
    description:
      'News, tutorials, and updates from the AGI Workforce team. AI automation insights and feature announcements.',
    type: 'website',
    url: 'https://agiworkforce.com/blog',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce Blog',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog | AGI Workforce',
    description: 'News, tutorials, and updates about AI automation from the AGI Workforce team.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/blog',
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
