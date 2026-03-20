import { redirect } from 'next/navigation';

const CHAT_URL = process.env['NEXT_PUBLIC_CHAT_URL'] || 'https://chat.agiworkforce.com';

export const dynamic = 'force-dynamic';

export default function ChatLayout() {
  redirect(CHAT_URL);
}
