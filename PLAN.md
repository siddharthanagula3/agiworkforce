# LLM Integration Fix Plan

**Created:** 2026-02-04
**Status:** All models working EXCEPT Haiku (user handling)
**Effort:** ~10 engineering days

---

## ✅ Current Status

**Working Models:**

- GPT-5 nano, GPT-5.2, GPT-5 Pro ✅
- Claude Opus 4.5, Sonnet 4.5 ✅
- Google Gemini 3 ✅
- DeepSeek, Moonshot, Qwen ✅

**Known Issues:**

- Streaming tool calls BROKEN
- Multi-turn tool conversations BROKEN
- Extended thinking not extracted
- Security: Error message leaks

---

## Phase 1: Critical Fixes (Days 1-2)

### Day 1: Streaming Tool Calls (LLM-001)

**Files:** `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`

- AM: OpenAI tool call parsing
- PM: Anthropic tool call parsing
- Tests: Partial JSON accumulation

**Success:** Tools execute during streaming

---

### Day 2: Multi-turn Conversations (LLM-002)

**Files:** `apps/web/lib/llm-providers/anthropic.ts`

- AM: Transform to `tool_use` blocks
- PM: Transform to `tool_result` blocks
- Tests: Multi-turn workflow

**Success:** Agentic conversations work

---

## Phase 2: Thinking & Security (Days 3-4)

### Day 3: Reasoning Extraction (LLM-003)

- AM: Update Rust parsers
- PM: Web transform + UI
- Tests: GPT-5.2, o3, Claude, DeepSeek

---

### Day 4: Security (LLM-004, LLM-006)

- AM: Error sanitization
- PM: Response schema validation
- Tests: Security audit

**Success:** No API keys in errors, type-safe parsing

---

## Phase 3: Extended Thinking (Days 5-6)

### Day 5: Provider Support (LLM-005)

- AM: OpenAI reasoning_effort
- PM: Google thinkingConfig, DeepSeek/Moonshot

---

### Day 6: Input Validation (LLM-007, LLM-008)

- AM: Sanitization + injection detection
- PM: Type-safe tools

**Success:** All providers support thinking

---

## Phase 4: Polish (Days 7-10)

- Add metadata (LLM-009)
- Optimize performance (LLM-010)
- Integration testing
- Security audit

---

## Rollout

**Phase 1-2:** Deploy to staging → QA → production
**Phase 3-4:** Feature flags → beta → gradual rollout

---

## Approval Required

**DO NOT START** until user signals: "Start implementation"

**Next:** User reviews docs → approves plan → we begin Phase 1
