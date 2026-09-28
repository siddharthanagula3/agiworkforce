'use client';

import {
  DEVICE_HOST_HEADER,
  encodeDesktopHostDeclaration,
  offeredDeviceStepTools,
} from '@agiworkforce/local-runtime-contract';
import { readDeviceHostDeclaration } from '@/features/desktop-host';
import { useChatStore } from '@shared/stores/web-chat-store';
import type { ManagedChatSurface } from '@agiworkforce/utils/managed-chat-idempotency';

/**
 * What this client tells the cloud about the machine it is running on.
 *
 * A page in a browser sends nothing and is treated as `web`, which is what
 * keeps device tools off every surface that could not run one. Inside the
 * desktop shell the surface is `desktop` and the declaration rides alongside
 * it, so the tools the model is offered match the folders and permissions this
 * installation actually has.
 */

export interface ChatHostContext {
  surface: ManagedChatSurface;
  headers: Record<string, string>;
  deviceId: string | null;
}

const WEB_ONLY: ChatHostContext = { surface: 'web', headers: {}, deviceId: null };

function deviceStepsWanted(conversationId: string | null | undefined): boolean {
  if (!conversationId) return true;
  return useChatStore.getState().getComposerToggles(conversationId).deviceStepsEnabled !== false;
}

export async function readChatHostContext(
  conversationId?: string | null,
): Promise<ChatHostContext> {
  const declaration = await readDeviceHostDeclaration().catch(() => null);
  if (!declaration) return WEB_ONLY;
  if (!deviceStepsWanted(conversationId)) {
    return { surface: 'desktop', headers: {}, deviceId: declaration.deviceId };
  }
  // A shell with no granted folder, or every device capability refused, has
  // nothing to offer. Declaring it anyway would put tools in front of the model
  // that this machine would refuse on the first call.
  if (offeredDeviceStepTools(declaration).length === 0) {
    return { surface: 'desktop', headers: {}, deviceId: declaration.deviceId };
  }
  return {
    surface: 'desktop',
    headers: { [DEVICE_HOST_HEADER]: encodeDesktopHostDeclaration(declaration) },
    deviceId: declaration.deviceId,
  };
}
