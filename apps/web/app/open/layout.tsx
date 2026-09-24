import type { ReactNode } from 'react';
import ProductRuntimeProviders from '../ProductRuntimeProviders';

export default function OpenLayout({ children }: { children: ReactNode }) {
  return <ProductRuntimeProviders>{children}</ProductRuntimeProviders>;
}
