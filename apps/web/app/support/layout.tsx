import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Support',
  description:
    'Get technical support for AGI. Report bugs, request features, check system status, or contact our support team directly.',
  path: '/support',
  keywords: [
    'AGI support',
    'AI agent help',
    'technical support',
    'bug report',
    'feature request',
    'contact support',
  ],
  ogDescription: 'Need help? Contact our support team, report bugs, or request features.',
  imageAlt: 'AGI Support',
});

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
