import { Metadata } from 'next';
import ProductRuntimeProviders from '../ProductRuntimeProviders';

export const metadata: Metadata = {
  title: 'Welcome',
  robots: { index: false, follow: false },
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return <ProductRuntimeProviders>{children}</ProductRuntimeProviders>;
}
