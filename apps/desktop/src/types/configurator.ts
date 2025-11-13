/**
 * AI Employee Configurator Types
 * Defines all types for the visual workflow configurator
 */

import type { Node, Edge } from 'reactflow';

export type CapabilityCategory = 'data' | 'logic' | 'actions' | 'ai';

export type NodeType = 'trigger' | 'action' | 'condition' | 'loop' | 'ai';

export interface Capability {
  id: string;
  name: string;
  category: CapabilityCategory;
  description: string;
  icon: string;
  nodeType: NodeType;
  configSchema: ConfigSchema;
  isBuiltIn: boolean;
}

export interface ConfigSchema {
  fields: ConfigField[];
}

export interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean' | 'json' | 'variable';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  description?: string;
  defaultValue?: any;
}

export interface CustomEmployee {
  id: string;
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  workflow: WorkflowDefinition;
  customInstructions?: string;
  trainingData: TrainingExample[];
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export interface WorkflowDefinition {
  nodes: Node[];
  edges: Edge[];
  variables: Record<string, any>;
}

export interface TrainingExample {
  id: string;
  input: string;
  expectedOutput: string;
  createdAt: number;
}

export interface TestResult {
  success: boolean;
  output: string;
  executionTimeMs: number;
  qualityScore: number;
  errors?: string[];
  warnings?: string[];
  stepsExecuted: number;
  timestamp: number;
}

export interface EmployeeTemplate {
  id: string;
  name: string;
  role: string;
  description: string;
  thumbnail?: string;
  capabilities: string[];
  workflow: WorkflowDefinition;
  category: string;
  isVerified: boolean;
  cloneCount: number;
}

export interface NodeConfig {
  [key: string]: any;
}

export interface CapabilityItem {
  capability: Capability;
  onDragStart?: (event: React.DragEvent, capability: Capability) => void;
}

// Built-in capabilities catalog
export const BUILT_IN_CAPABILITIES: Capability[] = [
  // Data Sources
  {
    id: 'api_call',
    name: 'API Call',
    category: 'data',
    description: 'Fetch data from APIs',
    icon: 'Globe',
    nodeType: 'action',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'method',
          label: 'HTTP Method',
          type: 'select',
          required: true,
          options: [
            { value: 'GET', label: 'GET' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'DELETE', label: 'DELETE' },
            { value: 'PATCH', label: 'PATCH' },
          ],
          defaultValue: 'GET',
        },
        {
          name: 'url',
          label: 'URL',
          type: 'text',
          required: true,
          placeholder: 'https://api.example.com/endpoint',
        },
        {
          name: 'headers',
          label: 'Headers (JSON)',
          type: 'json',
          placeholder: '{"Authorization": "Bearer ..."}',
        },
        {
          name: 'body',
          label: 'Request Body (JSON)',
          type: 'json',
          placeholder: '{"key": "value"}',
        },
      ],
    },
  },
  {
    id: 'database_query',
    name: 'Database Query',
    category: 'data',
    description: 'Query databases',
    icon: 'Database',
    nodeType: 'action',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'connection',
          label: 'Database Connection',
          type: 'select',
          required: true,
          options: [], // Populated from connections
        },
        {
          name: 'query',
          label: 'SQL Query',
          type: 'textarea',
          required: true,
          placeholder: 'SELECT * FROM users WHERE id = ?',
        },
        {
          name: 'parameters',
          label: 'Query Parameters (JSON)',
          type: 'json',
          placeholder: '["value1", "value2"]',
        },
      ],
    },
  },
  {
    id: 'file_read',
    name: 'File Read',
    category: 'data',
    description: 'Read file contents',
    icon: 'FileText',
    nodeType: 'action',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'path',
          label: 'File Path',
          type: 'text',
          required: true,
          placeholder: '/path/to/file.txt',
        },
        {
          name: 'encoding',
          label: 'Encoding',
          type: 'select',
          options: [
            { value: 'utf8', label: 'UTF-8' },
            { value: 'ascii', label: 'ASCII' },
            { value: 'base64', label: 'Base64' },
          ],
          defaultValue: 'utf8',
        },
      ],
    },
  },
  {
    id: 'web_scrape',
    name: 'Web Scrape',
    category: 'data',
    description: 'Extract web data',
    icon: 'Globe',
    nodeType: 'action',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'url',
          label: 'URL',
          type: 'text',
          required: true,
          placeholder: 'https://example.com',
        },
        {
          name: 'selector',
          label: 'CSS Selector',
          type: 'text',
          placeholder: '.main-content',
        },
        {
          name: 'extract',
          label: 'Extract',
          type: 'select',
          options: [
            { value: 'text', label: 'Text' },
            { value: 'html', label: 'HTML' },
            { value: 'attribute', label: 'Attribute' },
          ],
          defaultValue: 'text',
        },
      ],
    },
  },

  // Logic
  {
    id: 'condition',
    name: 'Condition',
    category: 'logic',
    description: 'Branch based on condition',
    icon: 'GitBranch',
    nodeType: 'condition',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'condition',
          label: 'Condition Expression',
          type: 'text',
          required: true,
          placeholder: 'value > 100',
        },
      ],
    },
  },
  {
    id: 'loop',
    name: 'Loop',
    category: 'logic',
    description: 'Iterate over items',
    icon: 'Repeat',
    nodeType: 'loop',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'items',
          label: 'Items to Loop',
          type: 'variable',
          required: true,
        },
        {
          name: 'maxIterations',
          label: 'Max Iterations',
          type: 'number',
          defaultValue: 100,
        },
      ],
    },
  },
  {
    id: 'filter',
    name: 'Filter',
    category: 'logic',
    description: 'Filter items by condition',
    icon: 'Filter',
    nodeType: 'action',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'items',
          label: 'Items to Filter',
          type: 'variable',
          required: true,
        },
        {
          name: 'condition',
          label: 'Filter Condition',
          type: 'text',
          required: true,
          placeholder: 'item.status === "active"',
        },
      ],
    },
  },
  {
    id: 'transform',
    name: 'Transform',
    category: 'logic',
    description: 'Transform data',
    icon: 'Wand2',
    nodeType: 'action',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'input',
          label: 'Input Data',
          type: 'variable',
          required: true,
        },
        {
          name: 'transformation',
          label: 'Transformation (JavaScript)',
          type: 'textarea',
          required: true,
          placeholder: 'return input.map(x => x.toUpperCase())',
        },
      ],
    },
  },

  // Actions
  {
    id: 'send_email',
    name: 'Send Email',
    category: 'actions',
    description: 'Send an email',
    icon: 'Mail',
    nodeType: 'action',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'to',
          label: 'To',
          type: 'text',
          required: true,
          placeholder: 'user@example.com',
        },
        {
          name: 'subject',
          label: 'Subject',
          type: 'text',
          required: true,
        },
        {
          name: 'body',
          label: 'Body',
          type: 'textarea',
          required: true,
        },
      ],
    },
  },
  {
    id: 'write_file',
    name: 'Write File',
    category: 'actions',
    description: 'Write data to file',
    icon: 'FileEdit',
    nodeType: 'action',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'path',
          label: 'File Path',
          type: 'text',
          required: true,
          placeholder: '/path/to/file.txt',
        },
        {
          name: 'content',
          label: 'Content',
          type: 'textarea',
          required: true,
        },
      ],
    },
  },
  {
    id: 'ui_click',
    name: 'UI Click',
    category: 'actions',
    description: 'Click UI element',
    icon: 'MousePointer',
    nodeType: 'action',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'selector',
          label: 'Element Selector',
          type: 'text',
          required: true,
          placeholder: '#button-id or .button-class',
        },
        {
          name: 'waitTime',
          label: 'Wait Time (ms)',
          type: 'number',
          defaultValue: 0,
        },
      ],
    },
  },
  {
    id: 'notify',
    name: 'Notify',
    category: 'actions',
    description: 'Send notification',
    icon: 'Bell',
    nodeType: 'action',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'title',
          label: 'Title',
          type: 'text',
          required: true,
        },
        {
          name: 'message',
          label: 'Message',
          type: 'textarea',
          required: true,
        },
        {
          name: 'level',
          label: 'Level',
          type: 'select',
          options: [
            { value: 'info', label: 'Info' },
            { value: 'success', label: 'Success' },
            { value: 'warning', label: 'Warning' },
            { value: 'error', label: 'Error' },
          ],
          defaultValue: 'info',
        },
      ],
    },
  },

  // AI Operations
  {
    id: 'summarize',
    name: 'Summarize',
    category: 'ai',
    description: 'Summarize text content',
    icon: 'FileText',
    nodeType: 'ai',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'input',
          label: 'Input Text',
          type: 'variable',
          required: true,
        },
        {
          name: 'maxLength',
          label: 'Max Summary Length',
          type: 'number',
          defaultValue: 200,
        },
      ],
    },
  },
  {
    id: 'classify',
    name: 'Classify',
    category: 'ai',
    description: 'Classify text into categories',
    icon: 'Tags',
    nodeType: 'ai',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'input',
          label: 'Input Text',
          type: 'variable',
          required: true,
        },
        {
          name: 'categories',
          label: 'Categories (comma-separated)',
          type: 'text',
          required: true,
          placeholder: 'positive, negative, neutral',
        },
      ],
    },
  },
  {
    id: 'extract',
    name: 'Extract',
    category: 'ai',
    description: 'Extract structured data',
    icon: 'Scissors',
    nodeType: 'ai',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'input',
          label: 'Input Text',
          type: 'variable',
          required: true,
        },
        {
          name: 'schema',
          label: 'Extraction Schema (JSON)',
          type: 'json',
          required: true,
          placeholder: '{"name": "string", "email": "string"}',
        },
      ],
    },
  },
  {
    id: 'generate',
    name: 'Generate',
    category: 'ai',
    description: 'Generate text content',
    icon: 'Sparkles',
    nodeType: 'ai',
    isBuiltIn: true,
    configSchema: {
      fields: [
        {
          name: 'prompt',
          label: 'Prompt',
          type: 'textarea',
          required: true,
          placeholder: 'Write a professional email about...',
        },
        {
          name: 'maxTokens',
          label: 'Max Tokens',
          type: 'number',
          defaultValue: 500,
        },
      ],
    },
  },
];
