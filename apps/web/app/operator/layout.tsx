import type { ReactNode } from 'react';
import ProductRuntimeProviders from '../ProductRuntimeProviders';

export default function OperatorLayout({ children }: { children: ReactNode }) {
  return <ProductRuntimeProviders>{children}</ProductRuntimeProviders>;
}
