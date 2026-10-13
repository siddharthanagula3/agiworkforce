import type { Metadata } from 'next';
import { MarketingLanding } from '@/features/marketing/components/MarketingLanding';
import { readFreeMediaOfferForRender } from '@/lib/server/free-media-offer-reader';
import { OG_IMAGE } from '@/lib/seo/site';

const TITLE = 'AGI: ChatGPT, Claude, Gemini and more in one app';
const DESCRIPTION =
  'The AI application suite for six surfaces. Local models, your own keys, or AGI managed cloud. You see the route before anything leaves your device.';
const SHARE_DESCRIPTION =
  'Chat, code, research and automate with models from OpenAI, Anthropic, Google and more, in one workspace. Free to start.';

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

export default async function Home() {
  return <MarketingLanding freeMediaOffer={await readFreeMediaOfferForRender()} />;
}
