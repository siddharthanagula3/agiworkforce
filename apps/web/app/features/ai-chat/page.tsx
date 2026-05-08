import { redirect } from 'next/navigation';

// /features/ai-chat — redirected to homepage. The chat surface is the
// product itself; it doesn't need a separate features page.
export default function FeaturesAiChatPage(): never {
  redirect('/');
}
