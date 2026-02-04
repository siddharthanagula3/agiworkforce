# Implementation TODO List

**Generated:** 2026-02-04
**Source:** Comprehensive parallel agent review
**Note:** User will handle Claude Haiku empty messages separately. All other models working correctly.

---

## 🔴 PRIORITY 0 - CRITICAL BLOCKERS

### LLM-001: Fix Streaming Tool Call Parsing

**Status:** 🔴 CRITICAL | **Effort:** 1 day
**Files:** `apps/desktop/src-tauri/src/core/llm/sse_parser.rs:201-398`

**Issue:** `StreamChunk.tool_calls` always `None` - never populated from streaming deltas

**Tasks:**

- [ ] Parse `delta.tool_calls` in OpenAI streaming
- [ ] Parse `content_block_start` + `input_json_delta` in Anthropic
- [ ] Accumulate partial JSON across chunks
- [ ] Add unit + integration tests

---

### LLM-002: Fix Anthropic Multi-turn Tool Conversations

**Status:** 🔴 CRITICAL | **Effort:** 6 hours
**Files:** `apps/web/lib/llm-providers/anthropic.ts:23-90`

**Issue:** Missing `tool_use` and `tool_result` content blocks

**Tasks:**

- [ ] Transform assistant tool calls → `tool_use` blocks
- [ ] Transform tool results → `tool_result` blocks
- [ ] Handle mixed content
- [ ] Add tests

---

### LLM-003: Add Reasoning Content Extraction

**Status:** 🔴 HIGH | **Effort:** 1 day
**Files:** `apps/desktop/src-tauri/src/core/llm/` + `apps/web/app/api/llm/v1/chat/completions/route.ts`

**Issue:** Reasoning tokens generated but never displayed

**Tasks:**

- [ ] Add `reasoning_content` field to StreamChunk
- [ ] Extract from OpenAI, Anthropic, DeepSeek parsers
- [ ] Forward through transform stream
- [ ] Add UI display (collapsible)

---

### LLM-004: Sanitize Error Messages

**Status:** 🔴 HIGH (Security) | **Effort:** 4 hours
**Files:** `apps/web/app/api/llm/v1/chat/completions/route.ts:819-846`

**Issue:** Raw errors expose API keys, stack traces

**Tasks:**

- [ ] Create sanitizer with allowlist
- [ ] Add correlation IDs
- [ ] Remove sensitive patterns
- [ ] Security test

---

## ⚠️ PRIORITY 1 - HIGH PRIORITY

### LLM-005: Enable Extended Thinking

**Effort:** 1 day total

- [ ] OpenAI `reasoning_effort` parameter (2h)
- [ ] Google `thinkingConfig` levels 0-4 (2h)
- [ ] DeepSeek/Moonshot conditional thinking (3h)

### LLM-006: Add Response Schema Validation (Rust)

**Effort:** 4 hours

- [ ] Define Serde structs
- [ ] Replace unsafe JSON navigation
- [ ] Test malformed responses

### LLM-007: Add Input Validation

**Effort:** 4 hours

- [ ] Sanitize control characters
- [ ] Detect prompt injection
- [ ] Validate multimodal content

---

## 🟡 PRIORITY 2 - MEDIUM

### LLM-008: Type-Safe Tool Transformations

**Effort:** 3 hours

- [ ] Define interfaces, remove `any`
- [ ] Add Zod validation

### LLM-009: Add Response Metadata

**Effort:** 4 hours

- [ ] reasoning_tokens, thinking_tokens
- [ ] grounding_metadata, cached_tokens

### LLM-010: Performance Optimization

**Effort:** 4 hours

- [ ] Replace Vec with VecDeque
- [ ] Pre-allocate strings
- [ ] Benchmark

---

**Estimated Total:** ~10 engineering days
