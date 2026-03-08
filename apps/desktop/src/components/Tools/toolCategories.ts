/**
 * Tool category definitions for the Tools panel.
 *
 * Each category maps to one or more Rust-side tool executor categories.
 * The `invokeCommand` is the Tauri command name used to run a direct invocation.
 * The `fields` array describes the form fields shown in ToolInvoker.
 */

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'file';

export interface ToolField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  description?: string;
}

export interface ToolCategory {
  id: string;
  name: string;
  description: string;
  /** Lucide icon name — imported in consumers via dynamic mapping */
  icon: string;
  invokeCommand: string;
  fields: ToolField[];
  /** Optional example output shown before a tool is run */
  exampleOutput?: string;
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'file-read',
    name: 'File Read',
    description: 'Read the contents of any local file',
    icon: 'FileText',
    invokeCommand: 'tool_exec_read_file',
    fields: [
      {
        key: 'path',
        label: 'File Path',
        type: 'text',
        placeholder: '/path/to/file.txt',
        required: true,
        description: 'Absolute or relative path to the file',
      },
      {
        key: 'offset',
        label: 'Start Line (optional)',
        type: 'number',
        placeholder: '1',
        min: 1,
        description: 'First line to read (1-based)',
      },
      {
        key: 'limit',
        label: 'Max Lines (optional)',
        type: 'number',
        placeholder: '200',
        min: 1,
        max: 10000,
        description: 'Maximum number of lines to return',
      },
    ],
    exampleOutput: '     1→Hello World\n     2→This is line two',
  },
  {
    id: 'file-write',
    name: 'File Write',
    description: 'Write or overwrite a file with new content',
    icon: 'FilePlus',
    invokeCommand: 'tool_exec_write_file',
    fields: [
      {
        key: 'path',
        label: 'File Path',
        type: 'text',
        placeholder: '/path/to/output.txt',
        required: true,
        description: 'Destination file path (will be created if absent)',
      },
      {
        key: 'content',
        label: 'Content',
        type: 'textarea',
        placeholder: 'File content…',
        required: true,
        description: 'Text to write to the file',
      },
    ],
  },
  {
    id: 'file-edit',
    name: 'File Edit',
    description: 'Apply a targeted string replacement inside a file',
    icon: 'FileEdit',
    invokeCommand: 'tool_exec_edit_file',
    fields: [
      {
        key: 'path',
        label: 'File Path',
        type: 'text',
        placeholder: '/path/to/file.ts',
        required: true,
      },
      {
        key: 'old_string',
        label: 'Old String',
        type: 'textarea',
        placeholder: 'Exact text to find…',
        required: true,
        description: 'Must be unique in the file',
      },
      {
        key: 'new_string',
        label: 'New String',
        type: 'textarea',
        placeholder: 'Replacement text…',
        required: true,
      },
    ],
  },
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web and return ranked results',
    icon: 'Search',
    invokeCommand: 'tool_exec_web_search',
    fields: [
      {
        key: 'query',
        label: 'Search Query',
        type: 'text',
        placeholder: 'What are the best Rust async runtimes?',
        required: true,
      },
      {
        key: 'max_results',
        label: 'Max Results',
        type: 'number',
        placeholder: '10',
        min: 1,
        max: 50,
        defaultValue: 10,
      },
    ],
    exampleOutput: '1. tokio — Async runtime for Rust\n   https://tokio.rs\n   …',
  },
  {
    id: 'web-fetch',
    name: 'Web Fetch',
    description: 'Download and extract content from a URL',
    icon: 'Globe',
    invokeCommand: 'tool_exec_web_fetch',
    fields: [
      {
        key: 'url',
        label: 'URL',
        type: 'text',
        placeholder: 'https://example.com/page',
        required: true,
      },
      {
        key: 'max_length',
        label: 'Max Characters',
        type: 'number',
        placeholder: '8000',
        min: 100,
        max: 100000,
        defaultValue: 8000,
      },
    ],
  },
  {
    id: 'bash',
    name: 'Terminal / Bash',
    description: 'Run a shell command and capture stdout/stderr',
    icon: 'Terminal',
    invokeCommand: 'tool_exec_bash',
    fields: [
      {
        key: 'command',
        label: 'Command',
        type: 'textarea',
        placeholder: 'ls -la ~',
        required: true,
        description: 'Shell command to execute',
      },
      {
        key: 'timeout_ms',
        label: 'Timeout (ms)',
        type: 'number',
        placeholder: '30000',
        min: 1000,
        max: 300000,
        defaultValue: 30000,
      },
    ],
    exampleOutput: 'total 48\ndrwxr-xr-x  12 user  staff  384 Mar  8 12:00 .',
  },
  {
    id: 'code-execution',
    name: 'Code Execution',
    description: 'Execute Python code in a sandboxed environment',
    icon: 'Code2',
    invokeCommand: 'tool_exec_code',
    fields: [
      {
        key: 'code',
        label: 'Python Code',
        type: 'textarea',
        placeholder: 'print("Hello from Python!")',
        required: true,
      },
      {
        key: 'timeout_ms',
        label: 'Timeout (ms)',
        type: 'number',
        placeholder: '10000',
        min: 1000,
        max: 60000,
        defaultValue: 10000,
      },
    ],
  },
  {
    id: 'screenshot',
    name: 'Screenshot',
    description: 'Capture the current screen or a specific window',
    icon: 'Camera',
    invokeCommand: 'tool_exec_screenshot',
    fields: [
      {
        key: 'window_title',
        label: 'Window Title (optional)',
        type: 'text',
        placeholder: 'Leave blank to capture full screen',
        description: 'Partial match of the window title to target',
      },
    ],
  },
  {
    id: 'browser',
    name: 'Browser Control',
    description: 'Navigate, click, and extract data from web pages',
    icon: 'Monitor',
    invokeCommand: 'tool_exec_browser',
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        options: [
          { value: 'navigate', label: 'Navigate to URL' },
          { value: 'click', label: 'Click Element' },
          { value: 'type', label: 'Type Text' },
          { value: 'extract', label: 'Extract Content' },
          { value: 'screenshot', label: 'Take Screenshot' },
        ],
        defaultValue: 'navigate',
      },
      {
        key: 'url',
        label: 'URL',
        type: 'text',
        placeholder: 'https://example.com',
        description: 'Required for "Navigate to URL"',
      },
      {
        key: 'selector',
        label: 'CSS Selector',
        type: 'text',
        placeholder: '#main-button',
        description: 'Required for click / type / extract actions',
      },
      {
        key: 'text',
        label: 'Text to Type',
        type: 'text',
        placeholder: 'Hello world',
        description: 'Required for "Type Text" action',
      },
    ],
  },
  {
    id: 'memory-read',
    name: 'Memory Read',
    description: 'Retrieve facts stored in the agent long-term memory',
    icon: 'Brain',
    invokeCommand: 'tool_exec_memory_read',
    fields: [
      {
        key: 'query',
        label: 'Search Query',
        type: 'text',
        placeholder: 'user preferred programming language',
        required: true,
      },
      {
        key: 'limit',
        label: 'Max Results',
        type: 'number',
        placeholder: '5',
        min: 1,
        max: 50,
        defaultValue: 5,
      },
    ],
  },
  {
    id: 'memory-write',
    name: 'Memory Write',
    description: 'Store a new fact in the agent long-term memory',
    icon: 'BookOpen',
    invokeCommand: 'tool_exec_memory_write',
    fields: [
      {
        key: 'content',
        label: 'Fact / Note',
        type: 'textarea',
        placeholder: 'User prefers TypeScript over JavaScript',
        required: true,
      },
    ],
  },
  {
    id: 'glob',
    name: 'Glob Search',
    description: 'Find files matching a glob pattern',
    icon: 'FolderSearch',
    invokeCommand: 'tool_exec_glob',
    fields: [
      {
        key: 'pattern',
        label: 'Glob Pattern',
        type: 'text',
        placeholder: '**/*.ts',
        required: true,
      },
      {
        key: 'base_dir',
        label: 'Base Directory',
        type: 'text',
        placeholder: '/Users/me/project',
        description: 'Directory to search in (defaults to home directory)',
      },
    ],
    exampleOutput: 'src/App.tsx\nsrc/components/Chat/index.tsx\n…',
  },
  {
    id: 'grep',
    name: 'Content Search',
    description: 'Search file contents with a regex pattern',
    icon: 'AlignLeft',
    invokeCommand: 'tool_exec_grep',
    fields: [
      {
        key: 'pattern',
        label: 'Regex Pattern',
        type: 'text',
        placeholder: 'invoke\\(',
        required: true,
      },
      {
        key: 'path',
        label: 'Search Path',
        type: 'text',
        placeholder: '/Users/me/project',
        required: true,
      },
      {
        key: 'file_glob',
        label: 'File Filter (optional)',
        type: 'text',
        placeholder: '*.ts',
        description: 'Glob to restrict which files are searched',
      },
      {
        key: 'case_insensitive',
        label: 'Case Insensitive',
        type: 'toggle',
        defaultValue: false,
      },
    ],
  },
  {
    id: 'clipboard',
    name: 'Clipboard',
    description: 'Read from or write to the system clipboard',
    icon: 'Clipboard',
    invokeCommand: 'tool_exec_clipboard',
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        options: [
          { value: 'read', label: 'Read clipboard' },
          { value: 'write', label: 'Write to clipboard' },
        ],
        defaultValue: 'read',
      },
      {
        key: 'content',
        label: 'Content (for Write)',
        type: 'textarea',
        placeholder: 'Text to copy to clipboard…',
        description: 'Only needed when action is "Write to clipboard"',
      },
    ],
  },
  {
    id: 'ocr',
    name: 'OCR / Vision',
    description: 'Extract text from an image file using optical character recognition',
    icon: 'ScanText',
    invokeCommand: 'tool_exec_ocr',
    fields: [
      {
        key: 'path',
        label: 'Image File Path',
        type: 'text',
        placeholder: '/path/to/image.png',
        required: true,
        description: 'PNG, JPG, or TIFF file',
      },
    ],
  },
  {
    id: 'process',
    name: 'Process Manager',
    description: 'List running processes or send signals',
    icon: 'Activity',
    invokeCommand: 'tool_exec_process',
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        options: [
          { value: 'list', label: 'List processes' },
          { value: 'kill', label: 'Kill process by PID' },
        ],
        defaultValue: 'list',
      },
      {
        key: 'pid',
        label: 'PID (for Kill)',
        type: 'number',
        placeholder: '12345',
        min: 1,
        description: 'Process ID — only needed for "Kill process"',
      },
    ],
  },
  {
    id: 'notifications',
    name: 'Desktop Notification',
    description: 'Send a native desktop notification',
    icon: 'Bell',
    invokeCommand: 'tool_exec_notify',
    fields: [
      {
        key: 'title',
        label: 'Title',
        type: 'text',
        placeholder: 'Task Complete',
        required: true,
      },
      {
        key: 'body',
        label: 'Body',
        type: 'textarea',
        placeholder: 'Your export finished successfully.',
        required: true,
      },
    ],
  },
];
