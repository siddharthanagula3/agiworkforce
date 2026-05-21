// FILE: apps/mobile/src/features/billing/PaywallCard.tsx
// FAILS: features/billing → features/chat is sibling-feature coupling. Cross-
// feature coordination must go through core/ or a documented contract.

import { ChatSendButton } from '@/src/features/chat/SendButton'; // ← reported

export function PaywallCard() {
  return (
    <div>
      <ChatSendButton />
    </div>
  );
}

// Expected diagnostic:
//   siblingFeature — Feature "billing" cannot import directly from sibling
//   feature "chat". Coordinate through core/ or expose a cross-feature
//   contract; do not depend on a peer feature's internals.
