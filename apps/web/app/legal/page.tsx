import type { Metadata } from 'next';
import { BusinessLegalPageWithErrorBoundary } from '@/features/pages/legal/BusinessLegalPage';

export const metadata: Metadata = {
  title: 'Legal | AGI Workforce',
  description:
    'Legal information for AGI Workforce, including terms of service, privacy policy, and other legal documents.',
  openGraph: {
    title: 'Legal | AGI Workforce',
    description:
      'Legal information for AGI Workforce, including terms of service, privacy policy, and other legal documents.',
    type: 'website',
  },
};

export default function LegalPage() {
  return <BusinessLegalPageWithErrorBoundary />;
}
