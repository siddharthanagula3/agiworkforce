import { useEffect, useMemo, useState } from "react";

import TitleBar from "./components/Layout/TitleBar";
import DockingSystem from "./components/Layout/DockingSystem";
import { Sidebar, type NavSection } from "./components/Layout/Sidebar";
import { CostDashboard } from "./components/Analytics/CostDashboard";
import { ChatInterface } from "./components/Chat/ChatInterface";
import { LovableMigrationWizard } from "./components/Migration/LovableMigrationWizard";
import { useWindowManager } from "./hooks/useWindowManager";
import { cn } from "./lib/utils";
import { VisualizationLayer } from "./components/Overlay/VisualizationLayer";
import { CloudStoragePanel } from "./components/Cloud/CloudStoragePanel";
import { CodeWorkspace } from "./components/Code/CodeWorkspace";
import { TerminalWorkspace } from "./components/Terminal/TerminalWorkspace";
import { BrowserWorkspace } from "./components/Browser/BrowserWorkspace";
import { FilesystemWorkspace } from "./components/Filesystem/FilesystemWorkspace";
import { DatabaseWorkspace } from "./components/Database/DatabaseWorkspace";
import { APIWorkspace } from "./components/API/APIWorkspace";
import { EmailWorkspace } from "./components/Communications/EmailWorkspace";
import { CalendarWorkspace } from "./components/Calendar/CalendarWorkspace";
import { ProductivityWorkspace } from "./components/Productivity/ProductivityWorkspace";
import { DocumentWorkspace } from "./components/Document/DocumentWorkspace";
import CommandPalette, { type CommandOption } from "./components/Layout/CommandPalette";
import { useTheme } from "./hooks/useTheme";
import {
  LayoutDashboard,
  ArrowLeftRight,
  MessageCircle,
  Cloud,
  Code2,
  Terminal,
  Globe,
  HardDrive,
  Database,
  Mail,
  Calendar,
  CheckSquare,
  FileText,
  Network,
  Sun,
  Moon,
  Pin,
  PinOff,
  Monitor,
  PanelLeft,
  PanelRight,
  PanelsTopLeft,
  RefreshCcw,
  EyeOff,
  Minimize2 ,
  Maximize2,
  ExternalLink,
} from "lucide-react";

const DesktopShell = () => {
  const { state, actions } = useWindowManager();
  const [activeSection, setActiveSection] = useState<NavSection>("chats");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  const commandShortcutHint = isMac ? "Cmd+K" : "Ctrl+K";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const commandOptions = useMemo(() => {
    const buildOption = (definition: {
      id: string;
      title: string;
      group: string;
      action: () => void;
      icon?: typeof LayoutDashboard;
      subtitle?: string;
      shortcut?: string;
      active?: boolean;
    }): CommandOption => {
      const option: CommandOption = {
        id: definition.id,
        title: definition.title,
        group: definition.group,
        action: definition.action,
      };

      if (definition.icon) {
        option.icon = definition.icon;
      }

      if (definition.subtitle) {
        option.subtitle = definition.subtitle;
      }

      if (definition.shortcut) {
        option.shortcut = definition.shortcut;
      }

      if (typeof definition.active === "boolean") {
        option.active = definition.active;
      }

      return option;
    };
    const navigationCommands = [
      {
        id: "nav-dashboard",
        section: "dashboard" as NavSection,
        title: "Go to Overview dashboard",
        subtitle: "View cost analytics and budgets",
        icon: LayoutDashboard,
        shortcut: isMac ? "Cmd+1" : "Ctrl+1",
      },
      {
        id: "nav-migration",
        section: "migration" as NavSection,
        title: "Open Migration workspace",
        subtitle: "Lovable migration assistant",
        icon: ArrowLeftRight,
      },
      {
        id: "nav-chats",
        section: "chats" as NavSection,
        title: "Open Chats workspace",
        subtitle: "Conversations and automations",
        icon: MessageCircle,
        shortcut: isMac ? "Cmd+2" : "Ctrl+2",
      },
      {
        id: "nav-projects",
        section: "projects" as NavSection,
        title: "Open Cloud Storage",
        subtitle: "Google Drive, Dropbox, OneDrive",
        icon: Cloud,
      },
      {
        id: "nav-code",
        section: "code" as NavSection,
        title: "Open Code workspace",
        subtitle: "Monaco editor and diff tools",
        icon: Code2,
        shortcut: isMac ? "Cmd+3" : "Ctrl+3",
      },
      {
        id: "nav-terminal",
        section: "terminal" as NavSection,
        title: "Open Terminal workspace",
        icon: Terminal,
      },
      {
        id: "nav-browser",
        section: "browser" as NavSection,
        title: "Open Browser automation",
        icon: Globe,
      },
      {
        id: "nav-files",
        section: "files" as NavSection,
        title: "Open Files workspace",
        icon: HardDrive,
      },
      {
        id: "nav-database",
        section: "database" as NavSection,
        title: "Open Database workspace",
        icon: Database,
      },
      {
        id: "nav-communications",
        section: "communications" as NavSection,
        title: "Open Email workspace",
        icon: Mail,
      },
      {
        id: "nav-calendar",
        section: "calendar" as NavSection,
        title: "Open Calendar workspace",
        icon: Calendar,
      },
      {
        id: "nav-productivity",
        section: "productivity" as NavSection,
        title: "Open Productivity workspace",
        icon: CheckSquare,
      },
      {
        id: "nav-documents",
        section: "documents" as NavSection,
        title: "Open Documents workspace",
        icon: FileText,
      },
      {
        id: "nav-api",
        section: "api" as NavSection,
        title: "Open API workspace",
        icon: Network,
      },
    ];

    const navigationOptions = navigationCommands.map((command) => {
      const definition: {
        id: string;
        title: string;
        group: string;
        action: () => void;
        icon: typeof LayoutDashboard;
        subtitle?: string;
        shortcut?: string;
        active?: boolean;
      } = {
        id: command.id,
        title: command.title,
        group: "Navigation",
        action: () => setActiveSection(command.section),
        icon: command.icon,
      };

      if (command.subtitle) {
        definition.subtitle = command.subtitle;
      }

      if (command.shortcut) {
        definition.shortcut = command.shortcut;
      }

      definition.active = activeSection === command.section;

      return buildOption(definition);
    });

    const windowOptions: CommandOption[] = [];

    const addWindowCommand = (definition: {
      id: string;
      title: string;
      group: string;
      action: () => void;
      icon: typeof LayoutDashboard;
      subtitle?: string;
      shortcut?: string;
      active?: boolean;
    }) => {
      windowOptions.push(buildOption(definition));
    };

    addWindowCommand({
      id: "window-pin",
      title: state.pinned ? "Unpin from desktop" : "Pin to desktop",
      subtitle: state.pinned
        ? "Allow Commander to behave like other windows"
        : "Keep Commander visible when switching apps",
      group: "Window",
      icon: state.pinned ? PinOff : Pin,
      shortcut: isMac ? "Cmd+Alt+P" : "Ctrl+Alt+P",
      active: state.pinned,
      action: () => actions.togglePinned(),
    });

    addWindowCommand({
      id: "window-always-on-top",
      title: state.alwaysOnTop ? "Disable always-on-top" : "Enable always-on-top",
      subtitle: "Keep Commander visible while you multitask",
      group: "Window",
      icon: Monitor,
      shortcut: isMac ? "Cmd+Alt+T" : "Ctrl+Alt+T",
      active: state.alwaysOnTop,
      action: () => actions.toggleAlwaysOnTop(),
    });

    addWindowCommand({
      id: "window-dock-left",
      title: "Dock to left edge",
      group: "Window",
      icon: PanelLeft,
      shortcut: isMac ? "Cmd+Alt+?" : "Ctrl+Alt+?",
      active: state.dock === "left",
      action: () => actions.dock("left"),
    });

    addWindowCommand({
      id: "window-dock-right",
      title: "Dock to right edge",
      group: "Window",
      icon: PanelRight,
      shortcut: isMac ? "Cmd+Alt+?" : "Ctrl+Alt+?",
      active: state.dock === "right",
      action: () => actions.dock("right"),
    });

    addWindowCommand({
      id: "window-undock",
      title: "Undock window",
      group: "Window",
      icon: PanelsTopLeft,
      shortcut: isMac ? "Cmd+Alt+?" : "Ctrl+Alt+?",
      active: state.dock === null,
      action: () => actions.dock(null),
    });

    addWindowCommand({
      id: "window-minimize",
      title: "Minimize Commander",
      group: "Window",
      icon: Minimize2,
      shortcut: isMac ? "Cmd+M" : "Ctrl+M",
      action: () => actions.minimize(),
    });

    addWindowCommand({
      id: "window-toggle-maximize",
      title: "Toggle maximize",
      group: "Window",
      icon: Maximize2,
      shortcut: isMac ? "Cmd+Ctrl+F" : "Ctrl+Alt+F",
      action: () => actions.toggleMaximize(),
    });

    addWindowCommand({
      id: "window-hide",
      title: "Hide Commander",
      subtitle: "Send the window to the background until summoned",
      group: "Window",
      icon: EyeOff,
      shortcut: isMac ? "Cmd+H" : "Ctrl+H",
      action: () => actions.hide(),
    });

    addWindowCommand({
      id: "window-refresh",
      title: "Refresh window state",
      subtitle: "Re-sync dock and focus status from the desktop service",
      group: "Window",
      icon: RefreshCcw,
      action: () => actions.refresh(),
    });

    const appearanceOptions = [
      buildOption({
        id: "toggle-theme",
        title: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        group: "Appearance",
        icon: theme === "dark" ? Sun : Moon,
        shortcut: isMac ? "Cmd+Shift+L" : "Ctrl+Shift+L",
        action: () => toggleTheme(),
      }),
    ];

    const utilityOptions = [
      buildOption({
        id: "open-overlay",
        title: "Open overlay window",
        subtitle: "Launch the visualization layer in a separate window",
        group: "Utilities",
        icon: ExternalLink,
        action: () => {
          const target = `${window.location.pathname}?mode=overlay`;
          window.open(target, "agi-workforce-overlay", "noopener,noreferrer");
        },
      }),
    ];

    return [...navigationOptions, ...windowOptions, ...appearanceOptions, ...utilityOptions];
  }, [
    actions,
    activeSection,
    isMac,
    setActiveSection,
    state.alwaysOnTop,
    state.dock,
    state.pinned,
    theme,
    toggleTheme,
  ]);

  const shellClass = useMemo(() => {
    return cn(
      "flex flex-col h-screen w-screen bg-background",
      "border border-border rounded-2xl overflow-hidden",
      "transition-all duration-200",
      state.focused && "border-primary/40 shadow-2xl",
      !state.focused && "border-border/40 shadow-lg",
    );
  }, [state.focused]);

  return (
    <div className={shellClass}>
      <DockingSystem docked={state.dock} preview={state.dockPreview} />
      <TitleBar
        state={state}
        actions={actions}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        commandShortcutHint={commandShortcutHint}
      />
      <main className="flex flex-1 overflow-hidden">
        <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
        <div className="flex-1 overflow-hidden">
          {activeSection === "dashboard" && <CostDashboard />}
          {activeSection === "migration" && <LovableMigrationWizard />}
          {activeSection === "chats" && <ChatInterface className="h-full" />}
          {activeSection === "projects" && <CloudStoragePanel />}
          {activeSection === "code" && <CodeWorkspace className="h-full" />}
          {activeSection === "terminal" && <TerminalWorkspace className="h-full" />}
          {activeSection === "browser" && <BrowserWorkspace className="h-full" />}
          {activeSection === "files" && <FilesystemWorkspace className="h-full" />}
          {activeSection === "database" && <DatabaseWorkspace className="h-full" />}
          {activeSection === "communications" && <EmailWorkspace className="h-full" />}
          {activeSection === "calendar" && <CalendarWorkspace className="h-full" />}
          {activeSection === "productivity" && <ProductivityWorkspace className="h-full" />}
          {activeSection === "documents" && <DocumentWorkspace className="h-full" />}
          {activeSection === "api" && <APIWorkspace className="h-full" />}
          {activeSection !== "dashboard" &&
            activeSection !== "migration" &&
            activeSection !== "chats" &&
            activeSection !== "projects" &&
            activeSection !== "code" &&
            activeSection !== "terminal" &&
            activeSection !== "browser" &&
            activeSection !== "files" &&
            activeSection !== "database" &&
            activeSection !== "communications" &&
            activeSection !== "calendar" &&
            activeSection !== "productivity" &&
            activeSection !== "api" && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)} workspace is coming soon.
              </div>
            )}
        </div>
      </main>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        options={commandOptions}
      />
    </div>
  );
};

const App = () => {
  const isOverlayMode =
    typeof window !== "undefined" && window.location.search.includes("mode=overlay");

  if (isOverlayMode) {
    return <VisualizationLayer />;
  }

  return <DesktopShell />;
};

export default App;









