import { z } from 'zod';

export const TOOL_DIRECTORY_TOOL_NAME = 'load_connector_tools';
export const DEFAULT_TOOL_SCHEMA_BYTES = 24_000;
export const TOOL_SCHEMA_STATE_CHECKPOINT_KEY = 'x_tool_schema_state';

const MAX_SCHEMA_STATE_NAMES = 1024;
const MAX_SCHEMA_STATE_NAME_CHARS = 512;

export const ToolSchemaStateSchema = z
  .object({
    loadedQualifiedNames: z
      .array(z.string().min(1).max(MAX_SCHEMA_STATE_NAME_CHARS))
      .max(MAX_SCHEMA_STATE_NAMES),
  })
  .strict()
  .refine(
    (state) =>
      new TextEncoder().encode(JSON.stringify(state)).byteLength <= DEFAULT_TOOL_SCHEMA_BYTES,
  );

export type ToolSchemaState = z.infer<typeof ToolSchemaStateSchema>;

export function withoutToolSchemaState(request: Record<string, unknown>): Record<string, unknown> {
  const { [TOOL_SCHEMA_STATE_CHECKPOINT_KEY]: _privateState, ...publicRequest } = request;
  return publicRequest;
}

export function createToolSchemaState(loadedQualifiedNames: Iterable<string>): ToolSchemaState {
  return ToolSchemaStateSchema.parse({
    loadedQualifiedNames: [...new Set(loadedQualifiedNames)].sort(),
  });
}
