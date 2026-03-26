import type { Metadata } from 'next';
import SalesTeamsPageWithErrorBoundary from '@/features/pages/use-cases/SalesTeams';

export const metadata: Metadata = {
  title: 'AI for Sales Teams | AGI Workforce',
  description:
    'Supercharge your sales pipeline with AI-powered workflows. Automate prospecting, lead scoring, outreach, and CRM updates.',
  openGraph: {
    title: 'AI for Sales Teams | AGI Workforce',
    description:
      'Supercharge your sales pipeline with AI-powered workflows. Automate prospecting, lead scoring, outreach, and CRM updates.',
    type: 'website',
  },
};

export default function SalesTeamsPage() {
  return <SalesTeamsPageWithErrorBoundary />;
}
