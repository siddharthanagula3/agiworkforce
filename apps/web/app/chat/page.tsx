import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../services/supabase-server';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login?redirectTo=/chat');
  }

  // Redirect to the chat app with the session token so it can authenticate
  // The chat app reads the token from the URL hash and sets it in Supabase
  const chatUrl = process.env['NEXT_PUBLIC_CHAT_URL'] || 'https://chat.agiworkforce.com';
  const tokenParam = `#access_token=${session.access_token}&refresh_token=${session.refresh_token}&type=bearer`;

  redirect(`${chatUrl}/${tokenParam}`);
}
