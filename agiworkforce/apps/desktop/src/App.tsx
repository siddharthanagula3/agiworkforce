import { useMemo, useState } from 'react';

import TitleBar from './components/Layout/TitleBar';
import DockingSystem from './components/Layout/DockingSystem';
import { Sidebar, type NavSection } from './components/Layout/Sidebar';
import { CostDashboard } from './components/Analytics/CostDashboard';
import { ChatInterface } from './components/Chat/ChatInterface';
import { LovableMigrationWizard } from './components/Migration/LovableMigrationWizard';
import { useWindowManager } from './hooks/useWindowManager';
import { cn } from './lib/utils';
import { VisualizationLayer } from './components/Overlay/VisualizationLayer';
import { CloudStoragePanel } from './components/Cloud/CloudStoragePanel';
import { CodeWorkspace } from './components/Code/CodeWorkspace';
import { TerminalWorkspace } from './components/Terminal/TerminalWorkspace';
import { BrowserWorkspace } from './components/Browser/BrowserWorkspace';
import { FilesystemWorkspace } from './components/Filesystem/FilesystemWorkspace';
import { DatabaseWorkspace } from './components/Database/DatabaseWorkspace';
import { APIWorkspace } from './components/API/APIWorkspace';
import { EmailWorkspace } from './components/Communications/EmailWorkspace';
import { CalendarWorkspace } from './components/Calendar/CalendarWorkspace';
import { ProductivityWorkspace } from './components/Productivity/ProductivityWorkspace';

const App = () => {
  const isOverlayMode = typeof window !== 'undefined' && window.location.search.includes('mode=overlay');

  if (isOverlayMode) {
    return <VisualizationLayer />;
  }

  const { state, actions } = useWindowManager();
  const [activeSection, setActiveSection] = useState<NavSection>('chats');

  const shellClass = useMemo(() => {
    return cn(
      'flex flex-col h-screen w-screen bg-background',
      'border border-border rounded-2xl overflow-hidden',
      'transition-all duration-200',
      state.focused && 'border-primary/40 shadow-2xl',
      !state.focused && 'border-border/40 shadow-lg',
    );
  }, [state.focused]);

  return (
    <div className={shellClass}>
      <DockingSystem docked={state.dock} preview={state.dockPreview} />
      <TitleBar state={state} actions={actions} />
      <main className="flex flex-1 overflow-hidden">
        <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
        <div className="flex-1 overflow-hidden">
          {activeSection === 'dashboard' && <CostDashboard />}
          {activeSection === 'migration' && <LovableMigrationWizard />}
          {activeSection === 'chats' && <ChatInterface className="h-full" />}
          {activeSection === 'projects' && <CloudStoragePanel />}
          {activeSection === 'code' && <CodeWorkspace className="h-full" />}
          {activeSection === 'terminal' && <TerminalWorkspace className="h-full" />}
          {activeSection === 'browser' && <BrowserWorkspace className="h-full" />}
          {activeSection === 'files' && <FilesystemWorkspace className="h-full" />}
          {activeSection === 'database' && <DatabaseWorkspace className="h-full" />}
          {activeSection === 'communications' && <EmailWorkspace className="h-full" />}
          {activeSection === 'calendar' && <CalendarWorkspace className="h-full" />}
          {activeSection === 'productivity' && <ProductivityWorkspace className="h-full" />}
          {activeSection === 'api' && <APIWorkspace className="h-full" />}
          {activeSection !== 'dashboard' &&
            activeSection !== 'migration' &&
            activeSection !== 'chats' &&
            activeSection !== 'projects' &&
            activeSection !== 'code' &&
            activeSection !== 'terminal' &&
            activeSection !== 'browser' &&
            activeSection !== 'files' &&
            activeSection !== 'database' &&
            activeSection !== 'communications' &&
            activeSection !== 'calendar' &&
            activeSection !== 'productivity' &&
            activeSection !== 'api' && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)} workspace is coming soon.
              </div>
            )}
        </div>
      </main>
    </div>
  );
};

export default App;
