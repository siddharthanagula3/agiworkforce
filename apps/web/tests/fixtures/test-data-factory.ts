/**
 * Test Data Factory
 * Provides mock data generators for unit tests
 */

import type { Task } from '@shared/stores/mission-control-store';

// Counter for unique IDs
let taskCounter = 0;
let _messageCounter = 0;

// ===== Mission Plan Factories =====

export function createMockMissionPlan(taskCount: number = 3) {
  const tasks = [];
  for (let i = 0; i < taskCount; i++) {
    tasks.push({
      task: `Task ${i + 1}`,
      tool_required: ['Read', 'Grep', 'Bash'][i % 3],
    });
  }
  return { plan: tasks, reasoning: 'Mock plan reasoning' };
}

export function createCodeReviewPlan() {
  return {
    plan: [
      { task: 'Read authentication files', tool_required: 'Read' },
      { task: 'Search for security patterns', tool_required: 'Grep' },
      { task: 'Analyze code quality', tool_required: 'Glob' },
    ],
    reasoning: 'Code review plan for authentication module',
  };
}

export function createDebugPlan() {
  return {
    plan: [
      { task: 'Identify the bug', tool_required: 'Read' },
      { task: 'Run failing tests', tool_required: 'Bash' },
      { task: 'Apply fix', tool_required: 'Edit' },
    ],
    reasoning: 'Debug plan for identifying and fixing the issue',
  };
}

// ===== Employee Factories =====

export function createMockEmployee(
  overrides: { name?: string; tools?: string[]; systemPrompt?: string; description?: string } = {},
) {
  return {
    name: overrides.name ?? 'mock-employee',
    description: overrides.description ?? `Mock employee: ${overrides.name ?? 'mock-employee'}`,
    tools: overrides.tools ?? ['Read', 'Grep'],
    systemPrompt: overrides.systemPrompt ?? 'You are a helpful assistant.',
    expertise: [],
    model: 'gpt-5.4-mini',
  };
}

export function createCodeReviewerEmployee() {
  return createMockEmployee({
    name: 'code-reviewer',
    tools: ['Read', 'Grep', 'Glob'],
  });
}

export function createDebuggerEmployee() {
  return createMockEmployee({
    name: 'debugger',
    tools: ['Bash', 'Read', 'Edit', 'Grep'],
  });
}

// ===== LLM Response Factory =====

export function createMockLLMResponse(content: string): {
  content: string;
  model: string;
  tokens: { input: number; output: number; total: number };
} {
  return {
    content,
    model: 'gpt-5.4-mini',
    tokens: { input: 100, output: 200, total: 300 },
  };
}

// ===== Task Factories =====

export function createMockTask(overrides: Partial<Task> = {}): Task {
  taskCounter++;
  return {
    id: `task-${taskCounter}`,
    description: `Mock task ${taskCounter}`,
    status: 'pending',
    assignedTo: null,
    ...overrides,
  };
}

export function createPendingTask(description: string): Task {
  return createMockTask({ description, status: 'pending' });
}

export function createInProgressTask(
  description: string,
  assignedTo: string = 'mock-employee',
): Task {
  return createMockTask({
    description,
    status: 'in_progress',
    assignedTo,
    startedAt: new Date(),
  });
}

export function createCompletedTask(description: string, result: string): Task {
  return createMockTask({
    description,
    status: 'completed',
    result,
    completedAt: new Date(),
  });
}

export function createFailedTask(description: string, error: string): Task {
  return createMockTask({
    description,
    status: 'failed',
    error,
  });
}

// ===== Message Factories =====

export function createUserMessage(content: string) {
  _messageCounter++;
  return {
    from: 'user',
    type: 'user' as const,
    content,
  };
}

export function createSystemMessage(content: string) {
  _messageCounter++;
  return {
    from: 'system',
    type: 'system' as const,
    content,
  };
}

export function createEmployeeMessage(employeeName: string, content: string) {
  _messageCounter++;
  return {
    from: employeeName,
    type: 'employee' as const,
    content,
  };
}
