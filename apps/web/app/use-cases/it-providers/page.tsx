import type { Metadata } from 'next';
import ITServiceProvidersPageWithErrorBoundary from '@/features/pages/use-cases/ITServiceProviders';

export const metadata: Metadata = {
  title: 'AI for IT Providers | AGI Workforce',
  description:
    'Streamline managed IT services with AI agents. Automate ticketing, monitoring, documentation, and client support workflows.',
  openGraph: {
    title: 'AI for IT Providers | AGI Workforce',
    description:
      'Streamline managed IT services with AI agents. Automate ticketing, monitoring, documentation, and client support workflows.',
    type: 'website',
  },
};

export default function ITProvidersPage() {
  return <ITServiceProvidersPageWithErrorBoundary />;
}
