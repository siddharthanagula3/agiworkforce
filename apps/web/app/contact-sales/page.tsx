import type { Metadata } from 'next';
import ContactSalesPageWithErrorBoundary from '@/features/pages/ContactSales';

export const metadata: Metadata = {
  title: 'Contact Sales | AGI Workforce',
  description:
    'Get in touch with our sales team to learn how AGI Workforce can transform your business with AI-powered automation.',
  openGraph: {
    title: 'Contact Sales | AGI Workforce',
    description:
      'Get in touch with our sales team to learn how AGI Workforce can transform your business with AI-powered automation.',
    type: 'website',
  },
};

export default function ContactSalesPage() {
  return <ContactSalesPageWithErrorBoundary />;
}
