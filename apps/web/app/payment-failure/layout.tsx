import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment Failed | AGI Workforce',
  description:
    'Your payment was not processed successfully. Please try again or contact support for assistance.',
  robots: {
    index: false, // Don't index payment pages
  },
  alternates: {
    canonical: 'https://agiworkforce.com/payment-failure',
  },
};

export default function PaymentFailureLayout({ children }: { children: React.ReactNode }) {
  return children;
}
