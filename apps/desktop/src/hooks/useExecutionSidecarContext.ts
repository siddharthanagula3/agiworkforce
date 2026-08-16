import { useEffect } from 'react';
import { useExecutionSidecarStore, type SidecarContext } from '../stores/executionSidecarStore';
import { useToolStore } from '../stores/chat/toolStore';
import { useComputerUseStore } from '../stores/computerUseStore';
import { useBrowserStore } from '../stores/browserStore';

export function useExecutionSidecarContext(): void {
  const userOverrideContext = useExecutionSidecarStore((s) => s.userOverrideContext);
  const setActiveContext = useExecutionSidecarStore((s) => s.setActiveContext);
  const isOpen = useExecutionSidecarStore((s) => s.isOpen);
  const userClosedThisSession = useExecutionSidecarStore((s) => s.userClosedThisSession);
  const open = useExecutionSidecarStore((s) => s.open);

  const pendingApprovals = useToolStore((s) => s.pendingApprovals);
  const activeToolStreams = useToolStore((s) => s.activeToolStreams);

  const computerUseActive = useComputerUseStore((s) => s.isActive);
  const browserIsStreaming = useBrowserStore((s) => s.isStreaming);
  const browserHasSessions = useBrowserStore((s) => s.sessions.length > 0);

  const hasAgentActivity =
    pendingApprovals.length > 0 ||
    computerUseActive ||
    browserIsStreaming ||
    Array.from(activeToolStreams.values()).some((s) => s.status === 'running');

  useEffect(() => {
    if (hasAgentActivity && !isOpen && !userClosedThisSession) {
      open();
    }
  }, [hasAgentActivity, isOpen, userClosedThisSession, open]);

  useEffect(() => {
    if (userOverrideContext !== null) {
      return;
    }

    let detected: SidecarContext = 'timeline';

    if (pendingApprovals.length > 0) {
      detected = 'approval';
    }
    // Check for computer-use activity
    else if (computerUseActive) {
      detected = 'screenshot';
    }
    // Check for browser streaming
    else if (browserIsStreaming || browserHasSessions) {
      detected = 'browser';
    }
    // Check for active bash/terminal streams
    else {
      const streams = Array.from(activeToolStreams.values());
      const hasActiveBash = streams.some(
        (s) =>
          s.status === 'running' &&
          (s.tool_name.toLowerCase().includes('bash') ||
            s.tool_name.toLowerCase().includes('terminal') ||
            s.tool_name.toLowerCase().includes('run command')),
      );

      if (hasActiveBash) {
        detected = 'terminal';
      } else if (streams.some((s) => s.status === 'running')) {
        detected = 'timeline';
      }
    }

    setActiveContext(detected);
  }, [
    userOverrideContext,
    pendingApprovals.length,
    computerUseActive,
    browserIsStreaming,
    browserHasSessions,
    activeToolStreams,
    setActiveContext,
  ]);
}
