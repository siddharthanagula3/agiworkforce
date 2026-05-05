import type { Metadata } from 'next';
import ConsultingBusinessesPageWithErrorBoundary from '@/features/pages/use-cases/ConsultingBusinesses';
import { EditorialPage } from '../../../components/marketing/editorial/EditorialPage';

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
  return (
    <EditorialPage tier="paper">
      <ConsultingBusinessesPageWithErrorBoundary />
    </EditorialPage>
  );
}
