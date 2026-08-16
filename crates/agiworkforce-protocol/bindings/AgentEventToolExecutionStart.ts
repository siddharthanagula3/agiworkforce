import type { AgentEventToolCategory } from './AgentEventToolCategory';
import type { JsonValue } from './serde_json/JsonValue';

export type AgentEventToolExecutionStart = {
  toolCallId: string;
  name: string;
  category: AgentEventToolCategory;
  summary: string;
  input: JsonValue;
};
