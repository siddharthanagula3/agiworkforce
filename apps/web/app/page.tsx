import type { Metadata } from 'next';
import { LandingPage } from '@/features/marketing/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'AGI: pick where the request runs',
  description:
    'AGI answers on your own hardware, on your own provider account, or on capacity we run, and labels which one it was.',
  keywords: [
    'AI workspace',
    'multi-provider AI',
    'local AI',
    'BYOK AI',
    'AI agents',
    'AI tools',
    'AI automation',
    'AI coding assistant',
    'AI research assistant',
    'artifacts',
    'connectors',
    'Ollama',
    'LM Studio',
  ],
  openGraph: {
    title: 'AGI: pick where the request runs',
    description:
      'AGI answers on your own hardware, on your own provider account, or on capacity we run, and labels which one it was.',
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'AGI Web composer' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI: pick where the request runs',
    description:
      'AGI answers on your own hardware, on your own provider account, or on capacity we run, and labels which one it was.',
    images: ['/api/og'],
  },
};

export default function Home() {
  return <LandingPage />;
}
