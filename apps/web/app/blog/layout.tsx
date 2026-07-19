import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'News, tutorials, and updates from the AGI team. Learn about AI automation, desktop agents, and the latest features.',
  keywords: ['AI blog', 'AI automation news', 'AGI updates', 'AI agent tutorials', 'desktop AI'],
  openGraph: {
    title: 'Blog',
    description:
      'News, tutorials, and updates from the AGI team. AI automation insights and feature announcements.',
    type: 'website',
    url: 'https://agiworkforce.com/blog',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'AGI Blog',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog',
    description: 'News, tutorials, and updates about AI automation from the AGI team.',
    images: ['/api/og'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/blog',
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
