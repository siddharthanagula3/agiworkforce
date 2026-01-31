# TODO List - Tool Use Implementation

## High Priority - COMPLETE

- [x] Create `tools.rs` with tool definition builder
- [x] Create tool executor function (`execute_chat_tool`)
- [x] Modify `mod.rs` to pass tools to LLM
- [x] Handle tool_calls in LLM response
- [x] Implement multi-turn tool loop
- [x] Integrate MCP tools dynamically

## Medium Priority

- [ ] Add safety tier system (confirmation for dangerous tools)
- [ ] Track tool executions for undo
- [ ] Add tool call events for UI visualization

## Low Priority

- [ ] Add tool usage analytics
- [ ] Optimize tool selection based on context
- [ ] Add tool caching for repeated calls

## Future Enhancements

- [ ] Streaming support for tool calls (requires SSE parser changes)
- [ ] Web search API integration
- [ ] Advanced browser automation tools

## Done

- [x] Audit current implementation
- [x] Identify gaps
- [x] Create implementation plan
- [x] Create tools.rs with tool definitions
- [x] Add execute_chat_tool function for file/terminal/browser operations
- [x] Add tool call handling loop in chat_send_message
- [x] Update system prompt with tool instructions
- [x] Emit UI events for tool calls
- [x] Integrate MCP tools (mcp**server**tool format)
- [x] Pass McpState to chat_send_message

---

Last Updated: 2026-01-31
