// FILE: apps/mobile/src/data/memory-store.ts  (also legal at apps/mobile/src/storage/memory-store.ts)
// FAILS: data/ (a.k.a. storage/) is a leaf — it cannot depend on features.
// Invert the dependency: have the caller pass in what it needs.

import { ChatMessage } from '@/src/features/chat/types'; // ← reported
import { secureWrite } from '@/src/integrations/secure-store'; // (would also fail — data → integrations blocked)

export function persistMessage(m: ChatMessage) {
  return secureWrite('chat', m);
}

// Expected diagnostics: two "crossLayer" reports
//   1. data → features  (the rationale points at the leaf rule)
//   2. data → integrations  (the rationale also points at the leaf rule)
