// FILE: apps/mobile/src/entry/chat-route.ts
// FAILS: entry/ must not reach directly into features/. Route the import
// through core/.

import { ChatComposer } from '@/src/features/chat/Composer'; // ← reported
import { withAppProviders } from '@/src/entry/providers';

export default withAppProviders(ChatComposer);

// Expected diagnostic:
//   crossLayer — Import from layer "features" is not allowed from layer "entry".
//   entry/ wires routes via core/. Route a feature through core/ orchestration
//   instead of importing it directly.
