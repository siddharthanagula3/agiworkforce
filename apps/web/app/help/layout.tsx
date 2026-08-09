import type { Metadata } from 'next';

/**
 * These descriptions are the copy search engines and link previews quote, so
 * they must not promise a support channel that does not exist. `/community`
 * (apps/web/app/community/page.tsx) states plainly that there is no Discord,
 * forum, or Slack workspace — the real channels are the changelog and the
 * contact mailbox — so "community support" was removed here rather than left
 * to contradict it.
 */
export const metadata: Metadata = {
  title: 'Help Center',
  description:
    'Get help with AGI. Step-by-step guides and troubleshooting articles for AI automation, plus a contact route to a human.',
  keywords: [
    'AGI help',
    'AI agent support',
    'troubleshooting',
    'how to use AGI',
    'AI automation guide',
  ],
  openGraph: {
    title: 'Help Center',
    description:
      'Find answers fast. Guides, troubleshooting articles, and a contact route to a human.',
    type: 'website',
    url: 'https://agiworkforce.com/help',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'AGI Help Center',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Help Center',
    description:
      'Find answers fast. Guides, troubleshooting articles, and a contact route to a human.',
    images: ['/api/og'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/help',
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
