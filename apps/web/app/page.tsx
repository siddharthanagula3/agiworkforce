import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { ChatStreamRuntimeProvider } from '@/features/chat/components/ChatStreamRuntimeProvider';
import { WebChatRoot } from '@/features/chat/components/WebChatRoot';
import { MarketingLanding } from '@/features/marketing/components/MarketingLanding';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AGI | One AI Workspace. Six Surfaces. Your Rules.',
  description:
    'The AI application suite for six surfaces. Local models, your own keys, or AGI managed cloud. You see the route before anything leaves your device.',
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
    title: 'AGI | One AI Workspace. Six Surfaces. Your Rules.',
    description: 'One workspace on six surfaces. Local, BYOK, or AGI managed cloud. Your rules.',
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'AGI Web composer' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI | One AI Workspace. Six Surfaces. Your Rules.',
    description: 'One workspace on six surfaces. Local, BYOK, or AGI managed cloud. Your rules.',
    images: ['/api/og'],
  },
};

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    await requireCurrentTermsAcceptance(userId, '/');
    return (
      <ChatStreamRuntimeProvider>
        <WebChatRoot />
      </ChatStreamRuntimeProvider>
    );
  }

  return <MarketingLanding />;
}
