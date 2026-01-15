# Specialized Integrations Guide

## Overview

This guide covers the integration of specialized libraries used in the AGI Workforce desktop application: xterm.js for terminal emulation, Monaco Editor for code editing, and @xyflow/react for node-based workflows.

## xterm.js Terminal Integration

### Overview

xterm.js v6 provides a full-featured terminal emulator in the browser. The AGI Workforce app uses it for interactive terminal sessions.

**Location**: `src/components/Terminal/Terminal.tsx`

### Basic Setup

```tsx
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';

function Terminal({ sessionId }: { sessionId: string }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Create terminal instance
    const xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      scrollback: 10000,
      convertEol: true,
    });

    // Load addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.loadAddon(searchAddon);

    // Try to load WebGL for better performance
    try {
      const webglAddon = new WebglAddon();
      xterm.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon not available:', e);
    }

    // Open terminal in DOM element
    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    return () => {
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId]);

  return <div ref={terminalRef} className="h-full w-full" />;
}
```

### Themes

Configure terminal colors based on application theme:

```tsx
const darkTheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
};

const lightTheme = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  // ... more colors
};

// Apply theme
xterm.options.theme = theme === 'dark' ? darkTheme : lightTheme;
```

### Input/Output Handling

```tsx
// Handle user input
xterm.onData((data) => {
  sendInput(sessionId, data).catch((error) => {
    console.error('Failed to send input:', error);
  });
});

// Write output to terminal
setupOutputListener(
  sessionId,
  (data: string) => {
    if (xtermRef.current) {
      xtermRef.current.write(data);
    }
  },
  () => {
    if (xtermRef.current) {
      xtermRef.current.writeln('\r\n\x1b[33m[Process exited]\x1b[0m');
    }
  },
);
```

### Resize Handling

```tsx
useEffect(() => {
  if (!isReady || !xtermRef.current || !fitAddonRef.current) return;

  const handleResize = () => {
    if (fitAddonRef.current && xtermRef.current) {
      // Fit terminal to container
      fitAddonRef.current.fit();

      // Notify backend of new size
      const { cols, rows } = xtermRef.current;
      resizeTerminal(sessionId, cols, rows).catch((error) => {
        console.error('Failed to resize terminal:', error);
      });
    }
  };

  // Observe container size changes
  const resizeObserver = new ResizeObserver(handleResize);
  if (terminalRef.current) {
    resizeObserver.observe(terminalRef.current);
  }

  window.addEventListener('resize', handleResize);

  return () => {
    resizeObserver.disconnect();
    window.removeEventListener('resize', handleResize);
  };
}, [isReady, sessionId]);
```

### ANSI Escape Codes

xterm.js supports ANSI escape codes for colors and formatting:

```tsx
// Colors
xterm.write('\x1b[31mRed text\x1b[0m'); // Red foreground
xterm.write('\x1b[42mGreen bg\x1b[0m'); // Green background
xterm.write('\x1b[1mBold text\x1b[0m'); // Bold
xterm.write('\x1b[4mUnderlined\x1b[0m'); // Underline

// Cursor control
xterm.write('\x1b[2J'); // Clear screen
xterm.write('\x1b[H'); // Move cursor to home
xterm.write('\x1b[10;20H'); // Move to row 10, col 20

// Progress indicators
xterm.write('\r\x1b[K'); // Clear current line
xterm.write('Progress: 50%'); // Write progress
```

### Advanced Features

#### Search

```tsx
import { SearchAddon } from '@xterm/addon-search';

const searchAddon = new SearchAddon();
xterm.loadAddon(searchAddon);

// Search for text
searchAddon.findNext('search term', {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
});
```

#### Web Links

```tsx
import { WebLinksAddon } from '@xterm/addon-web-links';

const webLinksAddon = new WebLinksAddon((event, uri) => {
  // Custom link handler
  window.open(uri, '_blank');
});
xterm.loadAddon(webLinksAddon);
```

---

## Monaco Editor Integration

### Overview

Monaco Editor is the same editor that powers VS Code. It provides syntax highlighting, IntelliSense, and many other features.

**Location**: `src/components/Code/CodeEditor.tsx`

### Basic Setup

```tsx
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

function CodeEditor({
  defaultValue = '',
  language = 'typescript',
  path,
  readOnly = false,
  onChange,
  onSave,
}: CodeEditorProps) {
  const [value, setValue] = useState(defaultValue);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const { theme } = useThemeContext();

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure editor options
    editor.updateOptions({
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontLigatures: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      formatOnPaste: true,
      formatOnType: true,
    });
  };

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'light';

  return (
    <Editor
      height="100%"
      defaultLanguage={language}
      defaultValue={defaultValue}
      theme={monacoTheme}
      value={value}
      onChange={(newValue) => setValue(newValue ?? '')}
      onMount={handleEditorDidMount}
      options={{
        readOnly,
      }}
    />
  );
}
```

### Keyboard Shortcuts

```tsx
const handleEditorDidMount: OnMount = (editor, monaco) => {
  // Save command (Cmd+S / Ctrl+S)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    handleSave();
  });

  // Undo (Cmd+Z / Ctrl+Z)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => {
    editor.trigger('keyboard', 'undo', {});
  });

  // Redo (Cmd+Shift+Z / Ctrl+Shift+Z)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, () => {
    editor.trigger('keyboard', 'redo', {});
  });

  // Format document (Shift+Alt+F)
  editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
    editor.getAction('editor.action.formatDocument')?.run();
  });
};
```

### Auto-Save on Blur

```tsx
editor.onDidBlurEditorText(async () => {
  if (readOnly) return;

  const currentContent = editor.getValue();
  if (currentContent !== originalValue) {
    try {
      await handleSave({ auto: true, content: currentContent });
    } catch (error) {
      console.error('Auto-save failed', error);
    }
  }
});
```

### Language Configuration

Monaco supports many languages out of the box:

```tsx
// Supported languages
const languages = [
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'java',
  'cpp',
  'csharp',
  'html',
  'css',
  'json',
  'markdown',
  'yaml',
  'sql',
  'shell',
  // ... many more
];

// Auto-detect language from file extension
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const extensionMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    cs: 'csharp',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
    sh: 'shell',
  };
  return extensionMap[ext || ''] || 'plaintext';
}
```

### Editor Actions

```tsx
// Get editor instance and trigger actions
const editor = editorRef.current;

// Format document
editor?.getAction('editor.action.formatDocument')?.run();

// Find and replace
editor?.getAction('editor.action.startFindReplaceAction')?.run();

// Go to line
editor?.getAction('editor.action.gotoLine')?.run();

// Toggle comment
editor?.getAction('editor.action.commentLine')?.run();

// Quick fix
editor?.getAction('editor.action.quickFix')?.run();
```

### Markers and Decorations

```tsx
// Add error markers
monaco.editor.setModelMarkers(editor.getModel()!, 'owner', [
  {
    startLineNumber: 5,
    startColumn: 1,
    endLineNumber: 5,
    endColumn: 20,
    message: 'This is an error message',
    severity: monaco.MarkerSeverity.Error,
  },
]);

// Add decorations (highlights, inline text, etc.)
const decorations = editor.deltaDecorations(
  [],
  [
    {
      range: new monaco.Range(3, 1, 3, 10),
      options: {
        isWholeLine: false,
        className: 'highlighted-code',
        glyphMarginClassName: 'glyphMarginClass',
        hoverMessage: { value: 'This is a hover message' },
      },
    },
  ],
);
```

### Diff Viewer

```tsx
import { DiffEditor } from '@monaco-editor/react';

function DiffViewer({ original, modified }: DiffViewerProps) {
  return (
    <DiffEditor
      height="100%"
      language="typescript"
      original={original}
      modified={modified}
      theme="vs-dark"
      options={{
        readOnly: true,
        renderSideBySide: true,
      }}
    />
  );
}
```

---

## @xyflow/react (React Flow) Integration

### Overview

@xyflow/react v12 provides a node-based editor for creating workflows and diagrams.

**Location**: `src/components/Configurator/WorkflowCanvas.tsx`

### Basic Setup

```tsx
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  BackgroundVariant,
} from '@xyflow/react';
import type { Connection, Edge, Node, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

function WorkflowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges],
  );

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

// Wrap in provider
function App() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}
```

### Custom Node Types

```tsx
import { Handle, Position } from '@xyflow/react';

// Define custom node component
function CustomNode({ data }: { data: any }) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-white border-2 border-stone-400">
      <Handle type="target" position={Position.Top} />
      <div>
        <div className="font-bold">{data.label}</div>
        <div className="text-gray-500">{data.description}</div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// Register node types
const nodeTypes = {
  custom: CustomNode,
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
};

<ReactFlow nodeTypes={nodeTypes} ... />
```

### Node Definition

```tsx
interface NodeData {
  label: string;
  description?: string;
  iconName?: string;
  category?: string;
  config?: Record<string, any>;
}

const initialNodes: Node<NodeData>[] = [
  {
    id: 'node-1',
    type: 'custom',
    position: { x: 100, y: 100 },
    data: {
      label: 'Start',
      description: 'Workflow trigger',
    },
  },
  {
    id: 'node-2',
    type: 'custom',
    position: { x: 100, y: 200 },
    data: {
      label: 'Process',
      description: 'Process data',
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    animated: true,
  },
];
```

### Drag and Drop

```tsx
function WorkflowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeData = event.dataTransfer.getData('application/reactflow');
      if (!nodeData || !reactFlowInstance) return;

      const data = JSON.parse(nodeData);
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `node-${Date.now()}`,
        type: data.type,
        position,
        data: {
          label: data.label,
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes],
  );

  return (
    <div ref={reactFlowWrapper} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={setReactFlowInstance}
        // ... other props
      />
    </div>
  );
}

// Draggable item
function NodePalette() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({ type: nodeType, label: 'New Node' }),
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div>
      <div draggable onDragStart={(e) => onDragStart(e, 'custom')} className="cursor-move">
        Custom Node
      </div>
    </div>
  );
}
```

### Node Selection and Interaction

```tsx
const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
  console.log('Node clicked:', node.id);
  setSelectedNode(node);
}, []);

const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
  console.log('Node double-clicked:', node.id);
  openNodeEditor(node);
}, []);

const onSelectionChange = useCallback(({ nodes, edges }) => {
  console.log('Selected nodes:', nodes);
  console.log('Selected edges:', edges);
}, []);

<ReactFlow
  onNodeClick={onNodeClick}
  onNodeDoubleClick={onNodeDoubleClick}
  onSelectionChange={onSelectionChange}
  // ... other props
/>;
```

### Auto-Layout

```tsx
import dagre from 'dagre';

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB' }); // Top to Bottom

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 150, height: 50 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 75,
        y: nodeWithPosition.y - 25,
      },
    };
  });
}
```

### Edge Customization

```tsx
import { getBezierPath } from '@xyflow/react';

function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      <text>
        <textPath
          href={`#${id}`}
          style={{ fontSize: 12 }}
          startOffset="50%"
          textAnchor="middle"
        >
          Edge Label
        </textPath>
      </text>
    </>
  );
}

const edgeTypes = {
  custom: CustomEdge,
};

<ReactFlow edgeTypes={edgeTypes} ... />
```

### Persistence

```tsx
// Save workflow
const saveWorkflow = useCallback(() => {
  if (!reactFlowInstance) return;

  const flow = reactFlowInstance.toObject();
  localStorage.setItem('workflow', JSON.stringify(flow));
  console.log('Workflow saved');
}, [reactFlowInstance]);

// Load workflow
const loadWorkflow = useCallback(() => {
  const flowData = localStorage.getItem('workflow');
  if (!flowData) return;

  const flow = JSON.parse(flowData);
  setNodes(flow.nodes || []);
  setEdges(flow.edges || []);
  console.log('Workflow loaded');
}, [setNodes, setEdges]);
```

### Zoom and Pan Controls

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  defaultViewport={{ x: 0, y: 0, zoom: 1 }}
  minZoom={0.2}
  maxZoom={4}
  fitView
  fitViewOptions={{ padding: 0.2 }}
  // ... other props
>
  <Controls showZoom showFitView showInteractive position="bottom-right" />
</ReactFlow>
```

### Validation

```tsx
const isValidConnection = useCallback(
  (connection: Connection) => {
    // Prevent self-connections
    if (connection.source === connection.target) {
      return false;
    }

    // Check if target already has incoming connection
    const targetHasConnection = edges.some(
      (edge) => edge.target === connection.target
    );

    return !targetHasConnection;
  },
  [edges]
);

<ReactFlow isValidConnection={isValidConnection} ... />
```

## Best Practices

### xterm.js

1. Always dispose terminal instances on unmount
2. Use WebGL addon for better performance
3. Implement proper resize handling
4. Debounce frequent writes to terminal
5. Use ANSI codes for formatting

### Monaco Editor

1. Reuse editor instances when possible
2. Configure auto-save to prevent data loss
3. Add keyboard shortcuts for common actions
4. Use language-specific configurations
5. Clean up markers and decorations

### @xyflow/react

1. Wrap in ReactFlowProvider at app root
2. Use custom node types for complex nodes
3. Implement validation for connections
4. Save/load workflows for persistence
5. Use auto-layout for better organization

## Performance Tips

1. **Debounce Updates**: Debounce frequent state updates
2. **Virtualization**: Use virtual scrolling for large datasets
3. **Memoization**: Memoize expensive computations
4. **Lazy Loading**: Load heavy features on demand
5. **Web Workers**: Offload intensive tasks to workers
