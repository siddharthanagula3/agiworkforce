import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Frequently Asked Questions',
  description:
    'Find answers to common questions about AGI: features, trust modes, platform support, security, and how to get started.',
  path: '/faq',
  keywords: [
    'AGI FAQ',
    'AI automation questions',
    'AGI pricing',
    'AI agents help',
    'workflow automation FAQ',
  ],
  ogTitle: 'FAQ',
  ogDescription: 'Find answers to common questions about AGI features, trust modes, and security.',
  imageAlt: 'AGI FAQ',
});

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
