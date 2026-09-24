import type { ReactNode } from 'react';
import ProductRuntimeProviders from '../ProductRuntimeProviders';

export default function ModelsLayout({ children }: { children: ReactNode }) {
  return <ProductRuntimeProviders>{children}</ProductRuntimeProviders>;
}
