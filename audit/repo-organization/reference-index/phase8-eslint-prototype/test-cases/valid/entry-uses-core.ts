// FILE: apps/mobile/src/entry/chat-route.ts
// PASSES: entry/ → core/ is the canonical wiring path.

import { ChatScreenOrchestrator } from '@/src/core/chat/orchestrator';
import { withAppProviders } from '@/src/entry/providers';

export default withAppProviders(ChatScreenOrchestrator);
