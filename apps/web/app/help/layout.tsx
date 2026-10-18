import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Help Center',
  description:
    'Get help with AGI. Step-by-step guides and troubleshooting articles for AI automation, plus a contact route to a human.',
  path: '/help',
  keywords: [
    'AGI help',
    'AI agent support',
    'troubleshooting',
    'how to use AGI',
    'AI automation guide',
  ],
  ogDescription:
    'Find answers fast. Guides, troubleshooting articles, and a contact route to a human.',
  imageAlt: 'AGI Help Center',
});

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
