import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Finances',
  description: 'A read-only view of the bank accounts you connected.',
  robots: { index: false, follow: false },
};

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
