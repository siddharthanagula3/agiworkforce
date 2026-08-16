
/**
 * The honest stop vocabulary this envelope exists partly to introduce.
 * Today's `StreamChunkStop['reason']`
 * (`packages/contracts/types/src/provider-adapter.ts`) is `'end_turn' | 'max_tokens'
 * | 'tool_use' | 'stop_sequence' | 'error' | 'cancel'` — no dedicated
 * refusal member. `packages/ai/providers/anthropic/src/stream.ts`'s
 * `mapStopReason` documents the resulting gap directly: Anthropic's real
 * `stop_reason: 'refusal'` (streaming safety classifiers intervening
 * mid-generation) has nowhere honest to go today and is mapped to
 * `'error'` as the least-wrong existing option. `Refusal` here is that
 * missing member — the canonical target for BOTH Anthropic's `refusal`
 * stop_reason and OpenAI's wire `finish_reason: 'content_filter'`
 * (`packages/ai/provider-protocol/src/openai-wire-compat.ts`'s
 * `OpenAIWireFinishReason`; also desktop's `StreamChunk.finish_reason`
 * string, `sse_parser.rs`): both mean "the provider's safety layer
 * stopped this response," which is the one honest concept, not two
 * vendor-specific ones. Wiring the Anthropic/OpenAI adapters to actually
 * emit it is separate work (execution program §W6 item 1); this envelope
 * only needs a real place for that fix to land.
 *
 * The other six variants are the union of `StreamChunkStop.reason`,
 * desktop's `finish_reason` (`"stop" | "length" | "tool_calls" |
 * "content_filter"`), and app-server's `TurnStatus` (`Running | Completed
 * | Interrupted | Failed`, `developer_session.rs`) — `Running` has no
 * stop-reason analog (it is not a terminal state) and is intentionally
 * not a variant here.
 */
export type AgentEventStopReason =
  | 'end-turn'
  | 'max-tokens'
  | 'tool-use'
  | 'stop-sequence'
  | 'refusal'
  | 'cancelled'
  | 'error';
