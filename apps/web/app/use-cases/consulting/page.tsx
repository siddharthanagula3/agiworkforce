import type { Metadata } from 'next';
import ConsultingBusinessesPageWithErrorBoundary from '@/features/pages/use-cases/ConsultingBusinesses';

export const metadata: Metadata = {
  title: 'AI for Consulting Firms | AGI Workforce',
  description:
    'Empower your consulting practice with AI agents. Automate research, client deliverables, data analysis, and reporting at scale.',
  openGraph: {
    title: 'AI for Consulting Firms | AGI Workforce',
    description:
      'Empower your consulting practice with AI agents. Automate research, client deliverables, data analysis, and reporting at scale.',
    type: 'website',
  },
};

export default function ConsultingPage() {
  return <ConsultingBusinessesPageWithErrorBoundary />;
}
