import React, { useState, useRef } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Pin,
  X,
  Activity,
  Brain,
  FileText,
  Terminal,
  Wrench,
  ListTodo,
  Users,
} from 'lucide-react';
import { useUnifiedChatStore, SidecarSection } from '../../stores/unifiedChatStore';
import { ActiveOperationsSection } from './Sidecar/ActiveOperationsSection';

export interface SidecarPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  position?: 'right' | 'left' | 'bottom';
  width?: number;
  onWidthChange?: (width: number) => void;
  className?: string;
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 400;

const SECTION_ICONS: Record<SidecarSection, React.ReactNode> = {
  operations: <Activity size={16} />,
  reasoning: <Brain size={16} />,
  files: <FileText size={16} />,
  terminal: <Terminal size={16} />,
  tools: <Wrench size={16} />,
  tasks: <ListTodo size={16} />,
  agents: <Users size={16} />,
};

const SECTION_LABELS: Record<SidecarSection, string> = {
  operations: 'Operations',
  reasoning: 'Reasoning',
  files: 'Files',
  terminal: 'Terminal',
  tools: 'Tools',
  tasks: 'Tasks',
  agents: 'Agents',
};

export const SidecarPanel: React.FC<SidecarPanelProps> = ({
  isOpen,
  onToggle,
  position = 'right',
  width: controlledWidth,
  onWidthChange,
  className = '',
}) => {
  const sidecarSection = useUnifiedChatStore((state) => state.sidecarSection);
  const setSidecarSection = useUnifiedChatStore((state) => state.setSidecarSection);
  const sidecarWidth = useUnifiedChatStore((state) => state.sidecarWidth);
  const setSidecarWidth = useUnifiedChatStore((state) => state.setSidecarWidth);

  const width = controlledWidth ?? sidecarWidth ?? DEFAULT_WIDTH;
  const [isResizing, setIsResizing] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = position === 'right' ? window.innerWidth - e.clientX : e.clientX;

      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));

      if (onWidthChange) {
        onWidthChange(clampedWidth);
      } else {
        setSidecarWidth(clampedWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, position, onWidthChange, setSidecarWidth]);

  if (!isOpen) {
    return null;
  }

  const sections: SidecarSection[] = [
    'operations',
    'reasoning',
    'files',
    'terminal',
    'tools',
    'tasks',
    'agents',
  ];

  return (
    <div
      ref={panelRef}
      className={`sidecar-panel flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 ${className}`}
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle */}
      <div
        className={`absolute ${position === 'right' ? 'left-0' : 'right-0'} top-0 bottom-0 w-1 hover:w-1.5 bg-transparent hover:bg-blue-500 cursor-col-resize transition-all ${
          isResizing ? 'bg-blue-500 w-1.5' : ''
        }`}
        onMouseDown={handleMouseDown}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sidecar</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsPinned(!isPinned)}
            className={`p-1.5 rounded transition-colors ${
              isPinned
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin size={14} />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors text-gray-600 dark:text-gray-400"
            title="Close sidecar"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {sections.map((section) => (
          <button
            key={section}
            onClick={() => setSidecarSection(section)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
              sidecarSection === section
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {SECTION_ICONS[section]}
            <span>{SECTION_LABELS[section]}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {sidecarSection === 'operations' && <ActiveOperationsSection />}

        {sidecarSection === 'reasoning' && (
          <div className="space-y-4 p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Reasoning</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Reasoning steps will appear here when the agent is thinking.
            </p>
          </div>
        )}

        {sidecarSection === 'files' && (
          <div className="space-y-4 p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              File Operations
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              File operations will be logged here.
            </p>
          </div>
        )}

        {sidecarSection === 'terminal' && (
          <div className="space-y-4 p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Terminal Commands
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Terminal command history will appear here.
            </p>
          </div>
        )}

        {sidecarSection === 'tools' && (
          <div className="space-y-4 p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tool Usage</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Tool execution statistics will appear here.
            </p>
          </div>
        )}

        {sidecarSection === 'tasks' && (
          <div className="space-y-4 p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Background Tasks
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Background tasks will be shown here.
            </p>
          </div>
        )}

        {sidecarSection === 'agents' && (
          <div className="space-y-4 p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Multi-Agent Status
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Active agents will be displayed here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SidecarPanel;
