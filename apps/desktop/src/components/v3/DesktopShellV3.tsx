import { useCallback } from 'react';
import {
  ChatInterface,
  type ChatHostBridge,
  type ChatInterfaceProps,
} from '@agiworkforce/unified-chat';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import { EmptyChat } from './EmptyChat';
import { CapModal } from './CapModal';

export interface DesktopShellV3Props {
  runtime: ChatRuntime | null;
  className?: string;
  hostBridge?: ChatHostBridge | null;
  onModelSelectorClick?: () => void;
  onVoiceClick?: () => void;
  onNavigateView?: ChatInterfaceProps['onNavigateView'];
  onBuyTopUp?: () => void;
}

/**
 * v3 desktop chat shell.
 *
 * Composes the existing `ChatInterface` orchestrator from unified-chat with
 * v3-specific slots:
 *   - `emptyStateSlot`: EmptyChat (serif headline + task chips)
 *   - hard-stop CapModal layered above the chat at 100% budget
 *
 * Default `ChatInterface` behavior — streaming, sidebar, composer, message
 * list, artifact panel — is unchanged. Everything is driven by the host's
 * `runtime` + `hostBridge`, same as the legacy mount point in `App.tsx`.
 */
export function DesktopShellV3({
  runtime,
  className,
  hostBridge,
  onModelSelectorClick,
  onVoiceClick,
  onNavigateView,
  onBuyTopUp,
}: DesktopShellV3Props) {
  const handleSwitchModel = useCallback(() => {
    onModelSelectorClick?.();
  }, [onModelSelectorClick]);

  return (
    <div className={className} data-v3-shell="">
      <ChatInterface
        runtime={runtime}
        className="h-full w-full"
        manageTheme={false}
        enableShortcuts={true}
        hostBridge={hostBridge}
        onModelSelectorClick={onModelSelectorClick}
        onVoiceClick={onVoiceClick}
        onNavigateView={onNavigateView}
        emptyStateSlot={<EmptyChat />}
        showProvenanceFooter={true}
      />
      <CapModal onSwitchModel={handleSwitchModel} onBuyTopUp={onBuyTopUp} />
    </div>
  );
}
