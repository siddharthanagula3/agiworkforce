/**
 * Browser Automation Visualization - Usage Examples
 *
 * This file contains practical examples of how to use the browser visualization components.
 */

import React from 'react';
import {
  BrowserVisualization,
  BrowserViewer,
  BrowserActionLog,
  BrowserDebugPanel,
  BrowserRecorder,
  BrowserWorkspace,
} from './index';
import { useBrowserStore } from '../../stores/browserStore';

// ============================================================================
// Example 1: Basic Integration - Full Visualization Panel
// ============================================================================

export function Example1_BasicVisualization() {
  return (
    <div className="h-screen p-4">
      <h1 className="text-2xl font-bold mb-4">Browser Automation Visualization</h1>
      <BrowserVisualization />
    </div>
  );
}

// ============================================================================
// Example 2: Side-by-Side with Controls
// ============================================================================

export function Example2_SideBySide() {
  return (
    <div className="h-screen grid grid-cols-2 gap-4 p-4">
      {/* Left: Controls */}
      <div className="flex flex-col">
        <h2 className="text-xl font-bold mb-4">Browser Controls</h2>
        <BrowserWorkspace />
      </div>

      {/* Right: Visualization */}
      <div className="flex flex-col">
        <h2 className="text-xl font-bold mb-4">Live Visualization</h2>
        <BrowserVisualization />
      </div>
    </div>
  );
}

// ============================================================================
// Example 3: Custom Layout - Dashboard Style
// ============================================================================

export function Example3_Dashboard() {
  return (
    <div className="h-screen grid grid-rows-2 grid-cols-3 gap-4 p-4">
      {/* Top row: Large viewer */}
      <div className="col-span-2 row-span-2">
        <BrowserViewer />
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4">
        <div className="flex-1">
          <BrowserRecorder />
        </div>
        <div className="flex-1">
          <BrowserActionLog />
        </div>
      </div>

      {/* Bottom: Debug panel */}
      <div className="col-span-2">
        <BrowserDebugPanel />
      </div>
    </div>
  );
}

// ============================================================================
// Example 4: Programmatic Control
// ============================================================================

export function Example4_ProgrammaticControl() {
  const {
    isStreaming,
    startStreaming,
    stopStreaming,
    highlightElement,
    sessions,
    activeSessionId,
  } = useBrowserStore();

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeTab = activeSession?.tabs.find((t) => t.active);

  const handleHighlightButton = async () => {
    if (activeTab) {
      try {
        await highlightElement(activeTab.id, 'button[type="submit"]');
      } catch (error) {
        console.error('Failed to highlight button:', error);
      }
    }
  };

  const handleToggleStreaming = () => {
    if (activeTab) {
      if (isStreaming) {
        stopStreaming();
      } else {
        startStreaming(activeTab.id);
      }
    }
  };

  return (
    <div className="h-screen flex flex-col p-4">
      {/* Control Panel */}
      <div className="flex items-center gap-4 mb-4 p-4 bg-muted rounded-lg">
        <h2 className="text-xl font-bold">Control Panel</h2>

        <button
          onClick={handleToggleStreaming}
          className="px-4 py-2 bg-primary text-primary-foreground rounded"
          disabled={!activeTab}
        >
          {isStreaming ? 'Stop Streaming' : 'Start Streaming'}
        </button>

        <button
          onClick={handleHighlightButton}
          className="px-4 py-2 bg-secondary text-secondary-foreground rounded"
          disabled={!activeTab}
        >
          Highlight Submit Button
        </button>

        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-sm text-muted-foreground">
            {isStreaming ? 'Live' : 'Paused'}
          </span>
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1">
        <BrowserViewer />
      </div>
    </div>
  );
}

// ============================================================================
// Example 5: Action Log with Custom Handler
// ============================================================================

export function Example5_ActionLogWithHandler() {
  const { screenshots } = useBrowserStore();

  const handleActionClick = (action: any) => {
    console.log('Action clicked:', action);

    // Find screenshot for this action
    if (action.screenshotId) {
      const screenshot = screenshots.find((s) => s.id === action.screenshotId);
      if (screenshot) {
        // Do something with the screenshot
        console.log('Screenshot found:', screenshot);
      }
    }

    // You could also:
    // - Show action details in a modal
    // - Jump to that point in time
    // - Replay the action
  };

  return (
    <div className="h-screen p-4">
      <h1 className="text-2xl font-bold mb-4">Action Timeline</h1>
      <BrowserActionLog onActionClick={handleActionClick} />
    </div>
  );
}

// ============================================================================
// Example 6: Debug Panel with Auto-Refresh
// ============================================================================

export function Example6_DebugPanel() {
  const { getDOMSnapshot, getConsoleLogs, getNetworkActivity } = useBrowserStore();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefreshAll = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const activeTabId = 'your-tab-id'; // Get from store
      await Promise.all([
        getDOMSnapshot(activeTabId),
        getConsoleLogs(activeTabId),
        getNetworkActivity(activeTabId),
      ]);
    } catch (error) {
      console.error('Failed to refresh debug data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [getConsoleLogs, getDOMSnapshot, getNetworkActivity]);

  React.useEffect(() => {
    // Auto-refresh every 5 seconds
    const interval = setInterval(handleRefreshAll, 5000);
    return () => clearInterval(interval);
  }, [handleRefreshAll]);

  return (
    <div className="h-screen flex flex-col p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Debug Panel</h1>
        <button
          onClick={handleRefreshAll}
          disabled={isRefreshing}
          className="px-4 py-2 bg-primary text-primary-foreground rounded"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh All'}
        </button>
      </div>
      <BrowserDebugPanel className="flex-1" />
    </div>
  );
}

// ============================================================================
// Example 7: Recording with Code Preview
// ============================================================================

export function Example7_RecorderWithPreview() {
  const { isRecording, recordedSteps, generatePlaywrightCode } = useBrowserStore();
  const [generatedCode, setGeneratedCode] = React.useState('');

  React.useEffect(() => {
    if (recordedSteps.length > 0) {
      setGeneratedCode(generatePlaywrightCode());
    }
  }, [recordedSteps, generatePlaywrightCode]);

  return (
    <div className="h-screen grid grid-cols-2 gap-4 p-4">
      {/* Left: Recorder */}
      <div className="flex flex-col">
        <h2 className="text-xl font-bold mb-4">
          Recording {isRecording && <span className="text-red-500">(Live)</span>}
        </h2>
        <BrowserRecorder />
      </div>

      {/* Right: Code Preview */}
      <div className="flex flex-col">
        <h2 className="text-xl font-bold mb-4">
          Generated Code ({recordedSteps.length} steps)
        </h2>
        <div className="flex-1 bg-muted rounded-lg p-4 overflow-auto">
          <pre className="text-sm font-mono">
            <code>{generatedCode || 'No code generated yet...'}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Example 8: Full Automation Workspace
// ============================================================================

export function Example8_FullWorkspace() {
  const [view, setView] = React.useState<'controls' | 'visualization'>('controls');

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-2xl font-bold">Browser Automation Workspace</h1>

        <div className="flex gap-2">
          <button
            onClick={() => setView('controls')}
            className={`px-4 py-2 rounded ${
              view === 'controls' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            Controls
          </button>
          <button
            onClick={() => setView('visualization')}
            className={`px-4 py-2 rounded ${
              view === 'visualization' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            Visualization
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === 'controls' ? (
          <BrowserWorkspace />
        ) : (
          <BrowserVisualization />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Example 9: Minimal Live View
// ============================================================================

export function Example9_MinimalLiveView() {
  return (
    <div className="h-screen bg-black">
      <BrowserViewer />
    </div>
  );
}

// ============================================================================
// Example 10: Action Log Only (for sidebar)
// ============================================================================

export function Example10_SidebarActionLog() {
  return (
    <div className="h-full w-80 border-l">
      <BrowserActionLog />
    </div>
  );
}

// Export all examples
export const examples = {
  'Basic Visualization': Example1_BasicVisualization,
  'Side by Side': Example2_SideBySide,
  'Dashboard': Example3_Dashboard,
  'Programmatic Control': Example4_ProgrammaticControl,
  'Action Log Handler': Example5_ActionLogWithHandler,
  'Debug Panel': Example6_DebugPanel,
  'Recorder with Preview': Example7_RecorderWithPreview,
  'Full Workspace': Example8_FullWorkspace,
  'Minimal Live View': Example9_MinimalLiveView,
  'Sidebar Action Log': Example10_SidebarActionLog,
};
