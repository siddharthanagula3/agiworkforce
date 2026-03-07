import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SharedSessionViewer } from '@/components/share/SharedSessionViewer';
import type { SharedSession } from '@/components/share/SharedSessionViewer';
import { ExpiredShareBanner } from '@/components/share/ExpiredShareBanner';

interface Props {
  params: Promise<{ token: string }>;
}

const TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('shared_sessions')
    .select('title, total_messages')
    .eq('token', token)
    .single();

  return {
    title: data ? `${data.title} — AGI Workforce` : 'Shared Session — AGI Workforce',
    description: data
      ? `${data.total_messages} message conversation shared from AGI Workforce`
      : undefined,
  };
}

export default async function SharedSessionPage({ params }: Props) {
  const { token } = await params;

  if (!TOKEN_REGEX.test(token)) {
    notFound();
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('shared_sessions')
    .select('title, model_id, provider, messages, total_messages, expires_at, created_at')
    .eq('token', token)
    .single();

  if (!data) {
    notFound();
  }

  if (new Date(data.expires_at) < new Date()) {
    return <ExpiredShareBanner />;
  }

  return <SharedSessionViewer session={data as SharedSession} />;
}
