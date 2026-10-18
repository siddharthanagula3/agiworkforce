import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Payment Failed',
  description:
    'Your payment was not processed successfully. Please try again or contact support for assistance.',
  path: '/payment-failure',
  robots: { index: false },
});

export default function PaymentFailureLayout({ children }: { children: React.ReactNode }) {
  return children;
}
