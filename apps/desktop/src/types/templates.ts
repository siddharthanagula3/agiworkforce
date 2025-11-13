/**
 * Agent Template Types
 */

export enum TemplateCategory {
  Finance = 'finance',
  CustomerService = 'customer_service',
  Development = 'development',
  Marketing = 'marketing',
  HR = 'hr',
  Operations = 'operations',
  DataEntry = 'data_entry',
  Research = 'research',
  Content = 'content',
  Deployment = 'deployment',
}

export enum DifficultyLevel {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard',
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  tool_id: string;
  parameters: Record<string, unknown>;
  expected_output: string;
  retry_on_failure: boolean;
  max_retries: number;
  timeout_seconds: number;
}

export interface WorkflowDefinition {
  steps: WorkflowStep[];
  parallel_execution: boolean;
  failure_strategy: 'stop' | 'continue' | 'retry';
}

export interface AgentTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  icon: string;
  tools: string[];
  workflow: WorkflowDefinition;
  default_prompts: Record<string, string>;
  success_criteria: string[];
  estimated_duration_ms: number;
  difficulty_level: DifficultyLevel;
  install_count: number;
  created_at: number;
}

export interface TemplateExecutionParams {
  template_id: string;
  params: Record<string, string>;
}

export interface TemplateInstall {
  user_id: string;
  template_id: string;
  installed_at: number;
}

/**
 * Template category display information
 */
export const CATEGORY_INFO: Record<
  TemplateCategory,
  { name: string; description: string; icon: string }
> = {
  [TemplateCategory.Finance]: {
    name: 'Finance',
    description: 'Accounting, invoicing, and expense management',
    icon: '💰',
  },
  [TemplateCategory.CustomerService]: {
    name: 'Customer Service',
    description: 'Support ticket handling and customer communication',
    icon: '🎧',
  },
  [TemplateCategory.Development]: {
    name: 'Development',
    description: 'Code review, testing, and documentation',
    icon: '💻',
  },
  [TemplateCategory.Marketing]: {
    name: 'Marketing',
    description: 'Social media, content, and lead generation',
    icon: '📱',
  },
  [TemplateCategory.HR]: {
    name: 'HR',
    description: 'Recruitment and employee management',
    icon: '👥',
  },
  [TemplateCategory.Operations]: {
    name: 'Operations',
    description: 'Email management and meeting scheduling',
    icon: '⚙️',
  },
  [TemplateCategory.DataEntry]: {
    name: 'Data Entry',
    description: 'Automated data extraction and entry',
    icon: '⌨️',
  },
  [TemplateCategory.Research]: {
    name: 'Research',
    description: 'Information gathering and analysis',
    icon: '🔬',
  },
  [TemplateCategory.Content]: {
    name: 'Content',
    description: 'Content writing and creation',
    icon: '✍️',
  },
  [TemplateCategory.Deployment]: {
    name: 'Deployment',
    description: 'Application deployment and CI/CD',
    icon: '🚀',
  },
};

/**
 * Difficulty level display information
 */
export const DIFFICULTY_INFO: Record<
  DifficultyLevel,
  { name: string; color: string; description: string }
> = {
  [DifficultyLevel.Easy]: {
    name: 'Easy',
    color: 'green',
    description: 'Simple setup, minimal configuration',
  },
  [DifficultyLevel.Medium]: {
    name: 'Medium',
    color: 'yellow',
    description: 'Moderate setup, some configuration required',
  },
  [DifficultyLevel.Hard]: {
    name: 'Hard',
    color: 'red',
    description: 'Complex setup, extensive configuration',
  },
};

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`;
  } else if (ms < 3600000) {
    return `${Math.round(ms / 60000)}m`;
  } else {
    return `${Math.round(ms / 3600000)}h`;
  }
}

/**
 * Get category color
 */
export function getCategoryColor(category: TemplateCategory): string {
  const colors: Record<TemplateCategory, string> = {
    [TemplateCategory.Finance]: 'green',
    [TemplateCategory.CustomerService]: 'blue',
    [TemplateCategory.Development]: 'purple',
    [TemplateCategory.Marketing]: 'pink',
    [TemplateCategory.HR]: 'orange',
    [TemplateCategory.Operations]: 'gray',
    [TemplateCategory.DataEntry]: 'yellow',
    [TemplateCategory.Research]: 'cyan',
    [TemplateCategory.Content]: 'indigo',
    [TemplateCategory.Deployment]: 'red',
  };
  return colors[category] || 'gray';
}
