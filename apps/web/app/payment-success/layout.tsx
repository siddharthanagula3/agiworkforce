import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment Successful | AGI Workforce',
  description: 'Your payment has been successfully processed. Your subscription is now active.',
  robots: {
    index: false, // Don't index payment pages
  },
  alternates: {
    canonical: 'https://agiworkforce.com/payment-success',
  },
};

export default function PaymentSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
