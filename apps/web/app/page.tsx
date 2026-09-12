import type { Metadata } from 'next';
import { MarketingLanding } from '@/features/marketing/components/MarketingLanding';

const TITLE = 'AGI | One AI Workspace. Six Surfaces. Your Rules.';
const DESCRIPTION =
  'The AI application suite for six surfaces. Local models, your own keys, or AGI managed cloud. You see the route before anything leaves your device.';
const SHARE_DESCRIPTION =
  'One workspace on six surfaces. Local, BYOK, or AGI managed cloud. Your rules.';
const OG_IMAGE = { url: '/api/og', width: 1200, height: 630, alt: 'AGI Web composer' } as const;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
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
    title: TITLE,
    description: SHARE_DESCRIPTION,
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: SHARE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default function Home() {
  return <MarketingLanding />;
}
