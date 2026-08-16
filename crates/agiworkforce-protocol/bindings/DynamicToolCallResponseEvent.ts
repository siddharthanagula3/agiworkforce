import type { DynamicToolCallOutputContentItem } from './DynamicToolCallOutputContentItem';
import type { JsonValue } from './serde_json/JsonValue';

export type DynamicToolCallResponseEvent = {
  call_id: string;
  turn_id: string;
  namespace: string | null;
  tool: string;
  arguments: JsonValue;
  content_items: Array<DynamicToolCallOutputContentItem>;
  success: boolean;
  error: string | null;
  duration: string;
};
