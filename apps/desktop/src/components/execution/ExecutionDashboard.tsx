/**
 * Execution Dashboard Component
 *
 * Main dashboard component that combines all execution panels.
 * Provides tabbed interface for Thinking, Terminal, Browser, and Files views.
 * Similar to Cursor Composer's execution transparency.
 */

import { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Terminal as TerminalIcon,
  Globe,
  Files,
  X,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useExecutionStore,
  selectPanelVisible,
  selectActiveTab,
  selectActiveGoal,
  selectSteps,
  selectTerminalLogs,
  selectBrowserActions,
  selectFileChanges,
  selectPendingFileChanges,
} from '../../stores/executionStore';
import { ThinkingPanel } from './ThinkingPanel';
import { TerminalPanel } from './TerminalPanel';
import { BrowserPanel } from './BrowserPanel';
import { FilesPanel } from './FilesPanel';
import { Button } from '../ui/Button';

export interface ExecutionDashboardProps {
  className?: string;
}

export function ExecutionDashboard({ className }: ExecutionDashboardProps) {
  const panelVisible = useExecutionStore(selectPanelVisible);
  const activeTab = useExecutionStore(selectActiveTab);
  const activeGoal = useExecutionStore(selectActiveGoal);
  const steps = useExecutionStore(selectSteps);
  const terminalLogs = useExecutionStore(selectTerminalLogs);
  const browserActions = useExecutionStore(selectBrowserActions);
  const fileChanges = useExecutionStore(selectFileChanges);
  const pendingFileChanges = useExecutionStore(selectPendingFileChanges);

  const setPanelVisible = useExecutionStore((state) => state.setPanelVisible);
  const setActiveTab = useExecutionStore((state) => state.setActiveTab);
  const togglePanel = useExecutionStore((state) => state.togglePanel);

  const [isMaximized, setIsMaximized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + E - Toggle panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        togglePanel();
      }

      // Cmd/Ctrl + Shift + T - Thinking tab
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setActiveTab('thinking');
        setPanelVisible(true);
      }

      // Cmd/Ctrl + Shift + R - Terminal tab
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        setActiveTab('terminal');
        setPanelVisible(true);
      }

      // Cmd/Ctrl + Shift + B - Browser tab
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        setActiveTab('browser');
        setPanelVisible(true);
      }

      // Cmd/Ctrl + Shift + F - Files tab
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setActiveTab('files');
        setPanelVisible(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel, setActiveTab, setPanelVisible]);

  // Auto-show panel when goal starts
  useEffect(() => {
    if (activeGoal && !panelVisible) {
      setPanelVisible(true);
    }
  }, [activeGoal, panelVisible, setPanelVisible]);

  // Get badge counts for tabs
  const activeStepCount = steps.filter((s) => s.status === 'in-progress').length;
  const terminalCount = terminalLogs.length;
  const browserCount = browserActions.length;
  const fileCount = fileChanges.length;
  const pendingFileCount = pendingFileChanges.length;

  if (!panelVisible) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex flex-col border-t border-border bg-background shadow-2xl',
          isMaximized ? 'top-0' : isCollapsed ? 'h-12' : 'h-[500px]',
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">Execution Dashboard</h2>
            {activeGoal && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>•</span>
                <span>
                  {activeGoal.completedSteps}/{activeGoal.totalSteps} steps
                </span>
                <span>•</span>
                <span>{activeGoal.progressPercent}%</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Collapse/Expand */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {/* Maximize/Minimize */}
            {!isCollapsed && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsMaximized(!isMaximized)}
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                {isMaximized ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Close */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPanelVisible(false)}
              title="Close (Cmd+Shift+E)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        {!isCollapsed && (
          <Tabs.Root
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as typeof activeTab)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            {/* Tab list */}
            <Tabs.List className="flex border-b border-border bg-muted/30 px-4">
              <Tabs.Trigger
                value="thinking"
                className={cn(
                  'relative flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  activeTab === 'thinking' && 'border-primary text-foreground',
                )}
              >
                <Brain className="h-4 w-4" />
                Thinking
                {activeStepCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    {activeStepCount}
                  </span>
                )}
              </Tabs.Trigger>

              <Tabs.Trigger
                value="terminal"
                className={cn(
                  'relative flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  activeTab === 'terminal' && 'border-primary text-foreground',
                )}
              >
                <TerminalIcon className="h-4 w-4" />
                Terminal
                {terminalCount > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {terminalCount}
                  </span>
                )}
              </Tabs.Trigger>

              <Tabs.Trigger
                value="browser"
                className={cn(
                  'relative flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  activeTab === 'browser' && 'border-primary text-foreground',
                )}
              >
                <Globe className="h-4 w-4" />
                Browser
                {browserCount > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {browserCount}
                  </span>
                )}
              </Tabs.Trigger>

              <Tabs.Trigger
                value="files"
                className={cn(
                  'relative flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  activeTab === 'files' && 'border-primary text-foreground',
                )}
              >
                <Files className="h-4 w-4" />
                Files
                {pendingFileCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    {pendingFileCount}
                  </span>
                )}
                {fileCount > 0 && pendingFileCount === 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {fileCount}
                  </span>
                )}
              </Tabs.Trigger>
            </Tabs.List>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              <Tabs.Content value="thinking" className="h-full">
                <ThinkingPanel />
              </Tabs.Content>

              <Tabs.Content value="terminal" className="h-full">
                <TerminalPanel />
              </Tabs.Content>

              <Tabs.Content value="browser" className="h-full">
                <BrowserPanel />
              </Tabs.Content>

              <Tabs.Content value="files" className="h-full">
                <FilesPanel />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        )}

        {/* Keyboard shortcuts hint */}
        {!isCollapsed && (
          <div className="border-t border-border bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
            <kbd className="rounded bg-background px-1.5 py-0.5">Cmd+Shift+E</kbd> Toggle •
            <kbd className="ml-2 rounded bg-background px-1.5 py-0.5">Cmd+Shift+T</kbd> Thinking •
            <kbd className="ml-2 rounded bg-background px-1.5 py-0.5">Cmd+Shift+R</kbd> Terminal •
            <kbd className="ml-2 rounded bg-background px-1.5 py-0.5">Cmd+Shift+B</kbd> Browser •
            <kbd className="ml-2 rounded bg-background px-1.5 py-0.5">Cmd+Shift+F</kbd> Files
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default ExecutionDashboard;
