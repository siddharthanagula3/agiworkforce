// FILE: apps/mobile/src/ui/button.tsx
// FAILS: ui/ is presentation-only. It cannot reach into features, core,
// integrations, data, platform, or entry. Move the logic out of ui/.

import { useChatSendShortcut } from '@/src/features/chat/hooks'; // ← reported
import { trackEvent } from '@/src/integrations/analytics'; // ← reported

export function Button({ label }: { label: string }) {
  useChatSendShortcut();
  return <button onClick={() => trackEvent('btn')}>{label}</button>;
}

// Expected diagnostics: two "crossLayer" reports (ui → features, ui → integrations).
