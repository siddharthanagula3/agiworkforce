import { useEffect } from 'react';
import { useExecutionSidecarStore, type SidecarContext } from '../stores/executionSidecarStore';
import { useToolStore } from '../stores/chat/toolStore';
import { useComputerUseStore } from '../stores/computerUseStore';
import { useBrowserStore } from '../stores/browserStore';

/**
 * Auto-detects the best sidecar context view based on current system state.
 *
 * Priority:
 *  1. userOverrideContext (if set by user click) takes precedence
 *  2. Pending approvals exist -> 'approval'
 *  3. Computer-use is active -> 'screenshot'
 *  4. Browser streaming active -> 'browser'
 *  5. Active Bash tool streams -> 'terminal'
 *  6. Any active tool streams -> 'timeline'
 *  7. Default -> 'timeline'
 */
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

  // Open the sidecar the first time the agent actually does something.
  //
  // `open()` previously had no caller anywhere, so the whole sidecar rendered
  // `null` forever and a running agent gave the user no visual feedback at all.
  // An approval request is the strongest case: the run is blocked on a decision
  // the user cannot see.
  //
  // `userClosedThisSession` is respected so this never fights someone who
  // deliberately closed the panel; `stores/executionSidecarStore` clears that
  // flag on `reset()` when a new agentic session begins.
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
    // If user has overridden, defer to their choice
    if (userOverrideContext !== null) {
      return;
    }

    let detected: SidecarContext = 'timeline';

    // Check for pending approvals
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
