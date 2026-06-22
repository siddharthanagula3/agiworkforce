import { redirect } from 'next/navigation';

// Skills, Plugins, and Connectors are consolidated into the Settings modal (the single
// home for them). The standalone /customize surface duplicated that content, so this
// route is retained only as a redirect to keep existing links/bookmarks landing in-app.
// Reach the same content via the Chat rail's "Customize" entry → Settings → Skills.
export default function CustomizePage() {
  redirect('/chat');
}
