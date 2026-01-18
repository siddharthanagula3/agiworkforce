# Component Documentation

## Overview

This document provides detailed documentation for major feature components in the AGI Workforce desktop application.

## Table of Contents

- [UnifiedAgenticChat](#unifiedagenticchat)
- [Terminal Components](#terminal-components)
- [Code Editor Components](#code-editor-components)
- [Workflow Canvas](#workflow-canvas)
- [Settings Panel](#settings-panel)
- [MCP Integration](#mcp-integration)
- [File Upload Components](#file-upload-components)
- [Calendar Components](#calendar-components)

---

## UnifiedAgenticChat

The main chat interface for interacting with AI agents.

**Location**: `src/components/UnifiedAgenticChat/`

### Architecture

The chat component consists of several sub-components:

- **MessageList**: Displays conversation history
- **MessageInput**: Text input with attachments and voice
- **Sidebar**: Conversation management
- **CommandPalette**: Slash commands and AI tools
- **InlinePanels**: Contextual panels (terminal, browser, code)
- **ToolExecutionPanel**: Real-time tool execution display

### Basic Usage

```tsx
import { UnifiedAgenticChat } from '@/components/UnifiedAgenticChat';

function App() {
  return (
    <UnifiedAgenticChat
      className="h-screen"
      layout="default"
      defaultSidecarOpen={false}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  );
}
```

### Props

```tsx
interface UnifiedAgenticChatProps {
  className?: string;
  layout?: 'default' | 'compact' | 'floating';
  defaultSidecarOpen?: boolean;
  onOpenSettings?: () => void;
}
```

### Message Structure

```tsx
interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    tokenCount?: number;
    model?: string;
    cost?: number;
    thinking?: {
      title?: string;
      details?: string;
    };
  };
  attachments?: Attachment[];
  artifacts?: Artifact[];
  streaming?: boolean;
  error?: string;
}
```

### Sending Messages

```tsx
import { useUnifiedChatStore } from '@/stores/unifiedChatStore';

function CustomInput() {
  const sendMessage = useUnifiedChatStore((state) => state.sendMessage);

  const handleSend = async () => {
    await sendMessage({
      content: 'Hello, AI!',
      attachments: [],
    });
  };

  return <button onClick={handleSend}>Send</button>;
}
```

### Message Rendering

Messages support various content types:

````tsx
// Text message
{
  role: 'user',
  content: 'Hello, how are you?',
}

// Message with code block
{
  role: 'assistant',
  content: '```typescript\nconst greeting = "Hello";\n```',
}

// Message with thinking process
{
  role: 'assistant',
  content: 'Here is the answer...',
  metadata: {
    thinking: {
      title: 'Analyzing request',
      details: 'Breaking down the problem...',
    },
  },
}

// Message with attachments
{
  role: 'user',
  content: 'Analyze this image',
  attachments: [{
    id: 'attach-1',
    type: 'image',
    name: 'screenshot.png',
    path: '/path/to/image.png',
  }],
}
````

### Inline Panels

Inline panels provide contextual information within messages:

```tsx
interface InlinePanel {
  id: string;
  type: 'terminal' | 'browser' | 'code' | 'database';
  content: InlinePanelContent;
  expanded?: boolean;
}

// Terminal panel
{
  type: 'terminal',
  content: {
    terminal: {
      command: 'npm install',
      stdout: 'Installing packages...',
      status: 'running',
    },
  },
}

// Code panel
{
  type: 'code',
  content: {
    code: {
      filePath: '/src/app.ts',
      language: 'typescript',
      content: 'const app = express();',
      isModified: true,
    },
  },
}
```

### Slash Commands

Built-in slash commands for quick actions:

```tsx
const slashCommands = [
  {
    command: '/edit',
    description: 'Edit code files',
    category: 'Code',
  },
  {
    command: '/terminal',
    description: 'Execute terminal commands',
    category: 'System',
  },
  {
    command: '/browser',
    description: 'Automate web browsing',
    category: 'Web',
  },
  {
    command: '/search',
    description: 'Search the web',
    category: 'Research',
  },
];

// Usage in message input
// Type "/" to trigger command autocomplete
```

---

## Terminal Components

### Terminal

Full-featured terminal emulator using xterm.js.

**Location**: `src/components/Terminal/Terminal.tsx`

#### Usage

```tsx
import { Terminal } from '@/components/Terminal/Terminal';

function TerminalWorkspace() {
  const [sessionId] = useState(() => `session-${Date.now()}`);

  return (
    <div className="h-screen">
      <Terminal sessionId={sessionId} />
    </div>
  );
}
```

#### Props

```tsx
interface TerminalProps {
  sessionId: string;
  className?: string;
}
```

#### Store Integration

```tsx
import { useTerminalStore } from '@/stores/terminalStore';

function TerminalControls({ sessionId }: { sessionId: string }) {
  const { createSession, killSession, sendInput } = useTerminalStore();

  const handleCreate = async () => {
    await createSession({
      shell: '/bin/zsh',
      cwd: process.env.HOME,
    });
  };

  const handleKill = async () => {
    await killSession(sessionId);
  };

  const handleCommand = async (command: string) => {
    await sendInput(sessionId, command + '\n');
  };

  return (
    <div>
      <button onClick={handleCreate}>New Terminal</button>
      <button onClick={handleKill}>Close Terminal</button>
      <button onClick={() => handleCommand('ls -la')}>Run ls</button>
    </div>
  );
}
```

### Terminal AI Assistant

AI-powered terminal assistant that suggests and explains commands.

**Location**: `src/components/Terminal/TerminalAIAssistant.tsx`

#### Usage

```tsx
import { TerminalAIAssistant } from '@/components/Terminal/TerminalAIAssistant';

function EnhancedTerminal() {
  return (
    <div className="flex h-screen">
      <div className="flex-1">
        <Terminal sessionId={sessionId} />
      </div>
      <div className="w-80 border-l">
        <TerminalAIAssistant sessionId={sessionId} />
      </div>
    </div>
  );
}
```

#### Features

- Command suggestions based on context
- Error explanation and fixes
- Command history analysis
- Best practices recommendations

---

## Code Editor Components

### CodeEditor

Monaco-based code editor with syntax highlighting and IntelliSense.

**Location**: `src/components/Code/CodeEditor.tsx`

#### Usage

```tsx
import { CodeEditor } from '@/components/Code/CodeEditor';

function FileEditor({ filePath }: { filePath: string }) {
  const [content, setContent] = useState('');

  const handleSave = async (newContent: string) => {
    await invoke('file_write', { path: filePath, content: newContent });
    toast.success('File saved');
  };

  return (
    <CodeEditor
      defaultValue={content}
      language="typescript"
      path={filePath}
      onChange={setContent}
      onSave={handleSave}
    />
  );
}
```

#### Props

```tsx
interface CodeEditorProps {
  defaultValue?: string;
  language?: string;
  path?: string;
  readOnly?: boolean;
  onChange?: (value: string | undefined) => void;
  onSave?: (value: string, context: { auto: boolean; path?: string }) => Promise<void>;
  className?: string;
}
```

#### Features

- Auto-save on blur
- Keyboard shortcuts (Cmd+S to save)
- Format document (Shift+Alt+F)
- Syntax highlighting for 50+ languages
- IntelliSense and autocomplete
- Error markers and diagnostics
- Find and replace
- Multi-cursor editing

### FileTree

File system tree view with expand/collapse.

**Location**: `src/components/Code/FileTree.tsx`

#### Usage

```tsx
import { FileTree } from '@/components/Code/FileTree';

function CodeWorkspace() {
  const handleFileSelect = (path: string) => {
    console.log('Selected:', path);
    openFile(path);
  };

  return (
    <div className="flex h-screen">
      <FileTree rootPath="/project" onFileSelect={handleFileSelect} className="w-64 border-r" />
      <CodeEditor />
    </div>
  );
}
```

### DiffViewer

Side-by-side diff viewer for comparing files.

**Location**: `src/components/Code/DiffViewer.tsx`

#### Usage

```tsx
import { DiffViewer } from '@/components/Code/DiffViewer';

function FileDiff() {
  const [original, setOriginal] = useState('original content');
  const [modified, setModified] = useState('modified content');

  return (
    <DiffViewer original={original} modified={modified} language="typescript" splitView={true} />
  );
}
```

---

## Settings Panel

Application settings management.

**Location**: `src/components/Settings/SettingsPanel.tsx`

### Usage

```tsx
import { SettingsPanel } from '@/components/Settings/SettingsPanel';

function App() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Settings</button>
      <SettingsPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
```

### Settings Categories

```tsx
// LLM Settings
import { useSettingsStore } from '@/stores/settingsStore';

function LLMSettings() {
  const { llmConfig, setDefaultProvider, setTemperature, setMaxTokens } = useSettingsStore();

  return (
    <div className="space-y-4">
      <Select value={llmConfig.defaultProvider} onValueChange={setDefaultProvider}>
        <SelectItem value="managed_cloud">Managed Cloud</SelectItem>
        <SelectItem value="ollama">Ollama</SelectItem>
      </Select>

      <Slider
        label="Temperature"
        value={[llmConfig.temperature]}
        onValueChange={([temp]) => setTemperature(temp)}
        min={0}
        max={2}
        step={0.1}
      />

      <Input
        label="Max Tokens"
        type="number"
        value={llmConfig.maxTokens}
        onChange={(e) => setMaxTokens(Number(e.target.value))}
      />
    </div>
  );
}
```

---

## MCP Integration

Model Context Protocol server management.

**Location**: `src/components/MCP/`

### MCP Workspace

```tsx
import { MCPWorkspace } from '@/components/MCP/MCPWorkspace';

function MCPManager() {
  return <MCPWorkspace className="h-screen" />;
}
```

### Components

#### MCPServerBrowser

Browse and manage MCP servers.

```tsx
import { MCPServerBrowser } from '@/components/MCP/MCPServerBrowser';

function ServerList() {
  return <MCPServerBrowser onServerSelect={(server) => console.log('Selected:', server)} />;
}
```

#### MCPToolBrowser

Browse available MCP tools.

```tsx
import { MCPToolBrowser } from '@/components/MCP/MCPToolBrowser';

function ToolExplorer() {
  return (
    <MCPToolBrowser serverId="github-mcp" onToolSelect={(tool) => console.log('Selected:', tool)} />
  );
}
```

#### MCPConfigEditor

Edit MCP server configuration.

```tsx
import { MCPConfigEditor } from '@/components/MCP/MCPConfigEditor';

function ConfigManager() {
  const handleSave = async (config: MCPConfig) => {
    await invoke('mcp_update_config', { config });
  };

  return <MCPConfigEditor serverId="github-mcp" onSave={handleSave} />;
}
```

---

## File Upload Components

File handling and preview components.

**Location**: `src/components/FileUpload/`

### FileUploadButton

Simple file upload button.

```tsx
import { FileUploadButton } from '@/components/FileUpload/FileUploadButton';

function Uploader() {
  const handleUpload = async (files: File[]) => {
    console.log('Uploaded:', files);
  };

  return <FileUploadButton onUpload={handleUpload} accept="image/*,application/pdf" multiple />;
}
```

### FileDropZone

Drag-and-drop file upload area.

```tsx
import { FileDropZone } from '@/components/FileUpload/FileDropZone';

function DropArea() {
  const handleDrop = (files: File[]) => {
    console.log('Dropped:', files);
  };

  return (
    <FileDropZone
      onDrop={handleDrop}
      accept={['image/*', 'application/pdf']}
      maxSize={10 * 1024 * 1024} // 10MB
    >
      <div className="text-center">
        <p>Drop files here or click to browse</p>
      </div>
    </FileDropZone>
  );
}
```

### FilePreviewModal

Preview uploaded files before processing.

```tsx
import { FilePreviewModal } from '@/components/FileUpload/FilePreviewModal';

function FilePreview() {
  const [file, setFile] = useState<File | null>(null);

  return (
    <FilePreviewModal
      file={file}
      open={!!file}
      onOpenChange={(open) => !open && setFile(null)}
      onConfirm={() => processFile(file)}
    />
  );
}
```

### PDFViewer

View PDF documents.

```tsx
import { PDFViewer } from '@/components/FileUpload/PDFViewer';

function DocumentViewer({ path }: { path: string }) {
  return <PDFViewer filePath={path} className="h-screen" />;
}
```

---

## Calendar Components

Calendar and event management.

**Location**: `src/components/Calendar/`

### CalendarWorkspace

Full calendar interface with multiple views.

```tsx
import { CalendarWorkspace } from '@/components/Calendar/CalendarWorkspace';

function CalendarApp() {
  return <CalendarWorkspace className="h-screen" />;
}
```

### Views

#### MonthView

```tsx
import { CalendarMonthView } from '@/components/Calendar/CalendarMonthView';

function MonthCalendar() {
  const handleDateClick = (date: Date) => {
    console.log('Clicked:', date);
  };

  const handleEventClick = (event: CalendarEvent) => {
    console.log('Event:', event);
  };

  return (
    <CalendarMonthView
      currentDate={new Date()}
      events={events}
      onDateClick={handleDateClick}
      onEventClick={handleEventClick}
    />
  );
}
```

#### WeekView

```tsx
import { CalendarWeekView } from '@/components/Calendar/CalendarWeekView';

function WeekCalendar() {
  return (
    <CalendarWeekView currentDate={new Date()} events={events} onEventClick={handleEventClick} />
  );
}
```

#### DayView

```tsx
import { CalendarDayView } from '@/components/Calendar/CalendarDayView';

function DayCalendar() {
  return (
    <CalendarDayView
      currentDate={new Date()}
      events={events}
      onEventClick={handleEventClick}
      onTimeSlotClick={handleTimeSlotClick}
    />
  );
}
```

### EventDialog

Create and edit calendar events.

```tsx
import { EventDialog } from '@/components/Calendar/EventDialog';

function EventManager() {
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<CalendarEvent | null>(null);

  const handleSave = async (eventData: CalendarEvent) => {
    await invoke('calendar_create_event', { event: eventData });
    setOpen(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)}>New Event</button>
      <EventDialog open={open} onOpenChange={setOpen} event={event} onSave={handleSave} />
    </>
  );
}
```

---

## Best Practices

### 1. Component Organization

```
Component/
├── index.tsx          # Main component
├── SubComponent.tsx   # Sub-components
├── types.ts           # TypeScript types
├── hooks.ts           # Component-specific hooks
├── utils.ts           # Helper functions
└── __tests__/         # Tests
    └── Component.test.tsx
```

### 2. Props Validation

```tsx
import { z } from 'zod';

const propsSchema = z.object({
  title: z.string(),
  count: z.number().min(0),
  onAction: z.function(),
});

type Props = z.infer<typeof propsSchema>;

function Component(props: Props) {
  // Validate props in development
  if (import.meta.env.DEV) {
    propsSchema.parse(props);
  }

  return <div>{props.title}</div>;
}
```

### 3. Error Handling

```tsx
function Component() {
  const [error, setError] = useState<Error | null>(null);

  const handleAction = async () => {
    try {
      await performAction();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      toast.error('Action failed');
    }
  };

  if (error) {
    return <ErrorDisplay error={error} onRetry={handleAction} />;
  }

  return <div>Component content</div>;
}
```

### 4. Loading States

```tsx
function Component() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (!data) return <EmptyState />;

  return <DataDisplay data={data} />;
}
```

### 5. Accessibility

```tsx
function AccessibleButton({ label, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
        }
      }}
    >
      {label}
    </button>
  );
}
```
