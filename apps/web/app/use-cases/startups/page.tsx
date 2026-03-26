import type { Metadata } from 'next';
import StartupsPageWithErrorBoundary from '@/features/pages/use-cases/Startups';

export const metadata: Metadata = {
  title: 'AI for Startups | AGI Workforce',
  description:
    'Scale your startup with an AI workforce. Automate operations, research, sales outreach, and more — without hiring a full team.',
  openGraph: {
    title: 'AI for Startups | AGI Workforce',
    description:
      'Scale your startup with an AI workforce. Automate operations, research, sales outreach, and more — without hiring a full team.',
    type: 'website',
  },
};

export default function StartupsPage() {
  return <StartupsPageWithErrorBoundary />;
}
