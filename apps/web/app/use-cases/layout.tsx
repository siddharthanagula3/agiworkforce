import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Use cases: startups, consultants, sales, and IT providers',
  description:
    'How AGI is used across startups, consulting firms, IT service providers, and sales teams: one page per job, each opening on the surface that job runs on.',
  path: '/use-cases',
  keywords: [
    'AI automation use cases',
    'AI for business',
    'AI for startups',
    'AI for consultants',
    'AI for IT service providers',
    'AI for sales teams',
    'enterprise AI automation',
  ],
  imageAlt: 'AGI use cases',
});

export default function UseCasesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
