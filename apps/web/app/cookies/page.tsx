import type { Metadata } from 'next';
import CookiePolicyPageWithErrorBoundary from '@/features/pages/legal/CookiePolicy';

export const metadata: Metadata = {
  title: 'Cookie Policy | AGI Workforce',
  description:
    'Learn how AGI Workforce uses cookies and similar technologies to improve your experience, remember preferences, and analyze site traffic.',
  openGraph: {
    title: 'Cookie Policy | AGI Workforce',
    description:
      'Learn how AGI Workforce uses cookies and similar technologies to improve your experience, remember preferences, and analyze site traffic.',
    type: 'website',
  },
};

export default function CookiesPage() {
  return <CookiePolicyPageWithErrorBoundary />;
}
