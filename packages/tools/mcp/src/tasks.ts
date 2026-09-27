import type { Client, RequestOptions } from '@modelcontextprotocol/client';
import {
  CancelTaskResultV2Schema,
  CreateTaskResultV2Schema,
  GetTaskResultV2Schema,
  hasTaskServerCapabilityV2,
  TASKS_EXTENSION_ID_V2,
  UpdateTaskResultV2Schema,
  type CancelTaskResultV2,
  type CreateTaskResultV2,
  type GetTaskResultV2,
  type UpdateTaskResultV2,
} from '@modelcontextprotocol/ext-tasks/core/v2';

export const MCP_TASKS_EXTENSION_ID = TASKS_EXTENSION_ID_V2;

export function parseCreateTaskResult(value: unknown): CreateTaskResultV2 | undefined {
  const parsed = CreateTaskResultV2Schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function serverSupportsTasks(capabilities: Record<string, unknown>): boolean {
  return hasTaskServerCapabilityV2(capabilities);
}

export async function getTask(
  client: Client,
  taskId: string,
  options?: RequestOptions,
): Promise<GetTaskResultV2> {
  return client.request(
    { method: 'tasks/get', params: { taskId } },
    GetTaskResultV2Schema,
    options,
  );
}

export async function updateTask(
  client: Client,
  taskId: string,
  inputResponses: Record<string, unknown>,
  options?: RequestOptions,
): Promise<UpdateTaskResultV2> {
  return client.request(
    { method: 'tasks/update', params: { taskId, inputResponses } },
    UpdateTaskResultV2Schema,
    options,
  );
}

export async function cancelTask(
  client: Client,
  taskId: string,
  options?: RequestOptions,
): Promise<CancelTaskResultV2> {
  return client.request(
    { method: 'tasks/cancel', params: { taskId } },
    CancelTaskResultV2Schema,
    options,
  );
}

export type {
  CancelTaskResultV2 as McpCancelTaskResult,
  CreateTaskResultV2 as McpCreateTaskResult,
  GetTaskResultV2 as McpGetTaskResult,
  UpdateTaskResultV2 as McpUpdateTaskResult,
};
