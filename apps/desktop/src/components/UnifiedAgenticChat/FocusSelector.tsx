import { Globe, Code, BookOpen, Zap, Search } from 'lucide-react';
import { useUnifiedChatStore, type FocusMode } from '../../stores/unifiedChatStore';
import { cn } from '../../lib/utils';

interface FocusPillProps {
  icon: React.ReactNode;
  label: string;
  mode: FocusMode;
  active: boolean;
  onClick: () => void;
  description?: string;
}

function FocusPill({ icon, label, mode: _mode, active, onClick, description }: FocusPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium',
        'transition-all duration-200 ease-spring-bouncy',
        'hover:scale-105 active:scale-95',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-terra-cotta',
        active
          ? 'bg-terra-cotta text-white shadow-halo-terra'
          : 'bg-surface-floating text-zinc-400 hover:bg-surface-floating-hover hover:text-zinc-200',
      )}
      aria-label={`${label} mode${description ? ': ' + description : ''}`}
      aria-pressed={active}
      role="radio"
      tabIndex={0}
    >
      <span className={cn('transition-transform duration-200', active && 'scale-110')}>{icon}</span>
      <span>{label}</span>

      {/* Tooltip */}
      {description && (
        <span
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5',
            'bg-zinc-900 text-zinc-100 text-xs rounded-lg shadow-lg',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
            'pointer-events-none whitespace-nowrap z-50',
          )}
        >
          {description}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-900" />
        </span>
      )}
    </button>
  );
}

interface FocusSelectorProps {
  className?: string;
}

export function FocusSelector({ className }: FocusSelectorProps) {
  const focusMode = useUnifiedChatStore((state) => state.focusMode);
  const setFocusMode = useUnifiedChatStore((state) => state.setFocusMode);
  const setAutonomousMode = useUnifiedChatStore((state) => state.setAutonomousMode);

  const modes: Array<{
    mode: FocusMode;
    icon: React.ReactNode;
    label: string;
    description: string;
  }> = [
    {
      mode: 'web',
      icon: <Globe className="w-4 h-4" />,
      label: 'Web',
      description: 'Search the web for current information',
    },
    {
      mode: 'code',
      icon: <Code className="w-4 h-4" />,
      label: 'Codebase',
      description: 'Analyze and work with your code',
    },
    {
      mode: 'academic',
      icon: <BookOpen className="w-4 h-4" />,
      label: 'Academic',
      description: 'Research papers and scholarly content',
    },
    {
      mode: 'reasoning',
      icon: <Zap className="w-4 h-4" />,
      label: 'Reasoning',
      description: 'Deep logical analysis and problem-solving',
    },
    {
      mode: 'deep-research',
      icon: <Search className="w-4 h-4" />,
      label: 'Deep Research',
      description: 'Comprehensive multi-source research',
    },
  ];

  const handleModeClick = (mode: FocusMode) => {
    // Toggle mode off if clicking the active mode
    if (focusMode === mode) {
      setFocusMode(null);
      // If clicking Deep Research, also toggle autonomous mode off
      if (mode === 'deep-research') {
        setAutonomousMode(false);
      }
    } else {
      setFocusMode(mode);
      // If selecting Deep Research, enable autonomous mode
      if (mode === 'deep-research') {
        setAutonomousMode(true);
      }
    }
  };

  return (
    <div
      className={cn('flex items-center gap-2 px-3 py-2', 'animate-fade-in', className)}
      role="radiogroup"
      aria-label="Focus mode selector"
    >
      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide mr-2">Focus</span>
      {modes.map(({ mode, icon, label, description }) => (
        <FocusPill
          key={mode}
          icon={icon}
          label={label}
          mode={mode}
          active={focusMode === mode}
          onClick={() => handleModeClick(mode)}
          description={description}
        />
      ))}
    </div>
  );
}
