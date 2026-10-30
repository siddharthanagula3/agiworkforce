import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import RendererProbe from './RendererProbe';

export default function RendererProbePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Suspense fallback={null}>
      <RendererProbe />
    </Suspense>
  );
}
