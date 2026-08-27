import {
  fromJsonSchema,
  type Client,
  type JsonSchemaType,
  type RequestOptions,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/client';
import taskExtensionSchema from '@modelcontextprotocol/ext-tasks/schema/2026-07-28/schema.json';
import type {
  CancelTaskResult,
  CreateTaskResult,
  GetTaskResult,
  UpdateTaskResult,
} from '@modelcontextprotocol/ext-tasks/schema/2026-07-28/schema';

export const MCP_TASKS_EXTENSION_ID = 'io.modelcontextprotocol/tasks';

type OfficialTaskSchemaName =
  | 'CreateTaskResult'
  | 'GetTaskResult'
  | 'UpdateTaskResult'
  | 'CancelTaskResult';

/** Use the immutable official extension schema with the SDK's custom-method validator. */
function officialTaskSchema<T>(name: OfficialTaskSchemaName): StandardSchemaWithJSON<T, T> {
  return fromJsonSchema<T>({
    ...(taskExtensionSchema as unknown as JsonSchemaType),
    $ref: `#/$defs/${name}`,
  });
}

async function validateWithOfficialSchema<T>(
  schema: StandardSchemaWithJSON<T, T>,
  value: unknown,
): Promise<T | undefined> {
  const outcome = await schema['~standard'].validate(value);
  return outcome.issues ? undefined : outcome.value;
}

export async function parseCreateTaskResult(value: unknown): Promise<CreateTaskResult | undefined> {
  if (
    value === null ||
    typeof value !== 'object' ||
    (value as Record<string, unknown>)['resultType'] !== 'task'
  ) {
    return undefined;
  }
  return validateWithOfficialSchema(
    officialTaskSchema<CreateTaskResult>('CreateTaskResult'),
    value,
  );
}

export function serverSupportsTasks(capabilities: Record<string, unknown>): boolean {
  const extensions = capabilities['extensions'];
  return (
    extensions !== null &&
    typeof extensions === 'object' &&
    Object.prototype.hasOwnProperty.call(extensions, MCP_TASKS_EXTENSION_ID)
  );
}

export async function getTask(
  client: Client,
  taskId: string,
  options?: RequestOptions,
): Promise<GetTaskResult> {
  return client.request(
    { method: 'tasks/get', params: { taskId } },
    officialTaskSchema<GetTaskResult>('GetTaskResult'),
    options,
  );
}

export async function updateTask(
  client: Client,
  taskId: string,
  inputResponses: Record<string, unknown>,
  options?: RequestOptions,
): Promise<UpdateTaskResult> {
  return client.request(
    { method: 'tasks/update', params: { taskId, inputResponses } },
    officialTaskSchema<UpdateTaskResult>('UpdateTaskResult'),
    options,
  );
}

export async function cancelTask(
  client: Client,
  taskId: string,
  options?: RequestOptions,
): Promise<CancelTaskResult> {
  return client.request(
    { method: 'tasks/cancel', params: { taskId } },
    officialTaskSchema<CancelTaskResult>('CancelTaskResult'),
    options,
  );
}

export type {
  CancelTaskResult as McpCancelTaskResult,
  CreateTaskResult as McpCreateTaskResult,
  GetTaskResult as McpGetTaskResult,
  UpdateTaskResult as McpUpdateTaskResult,
};
