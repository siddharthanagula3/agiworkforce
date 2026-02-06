# AGI Workforce - Strategic Planner

**Last Updated:** 2026-01-28
**Analysis Scope:** Claude Desktop, Claude Code, Cursor IDE, Moltbot, Kimi K2.5, Computer Use, Voice AI

---

## Executive Summary

This document identifies **critical capability gaps** between AGI Workforce and leading competitors. Analysis reveals **47 missing features** across 8 categories, with **15 high-priority gaps** that directly impact the core product vision of "non-technical users completing tasks autonomously."

---

## 1. Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGI WORKFORCE ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  FRONTEND (React 19 + Vite)          │  BACKEND (Tauri 2.9 + Rust)          │
│  ├── UnifiedAgenticChat              │  ├── core/agent/ - AGI Loop          │
│  ├── Zustand Stores (25+)            │  ├── core/mcp/ - MCP Integration     │
│  ├── Inline Tool Results             │  ├── core/llm/ - Provider Router     │
│  └── Sidecar Panels                  │  ├── automation/ - Screen/Browser    │
│                                      │  └── features/ - Documents/Calendar  │
├─────────────────────────────────────────────────────────────────────────────┤
│  WEB (Next.js 16)                    │  SERVICES                            │
│  ├── Billing/Subscriptions           │  ├── API Gateway (port 3000)         │
│  ├── LLM Proxy                       │  └── Signaling Server (port 4000)    │
│  └── Supabase Backend                │                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Current Capabilities Summary

| Category           | Implemented | Notes                                          |
| ------------------ | ----------- | ---------------------------------------------- |
| AGI Reasoning Loop | ✅          | 1000 iterations, 5min timeout, 3-failure limit |
| MCP Integration    | ✅          | Tool IDs, auto-start, keyring credentials      |
| LLM Providers      | ✅          | 9+ providers with routing                      |
| Undo System        | ✅          | Change tracking, UndoManager                   |
| Screen Automation  | ✅          | Capture, OCR, click, type                      |
| Browser Automation | ✅          | DOM ops, Playwright, CDP                       |
| Document Creation  | ✅          | Word, Excel                                    |
| Calendar/Email     | ✅          | Google, Outlook, SMTP                          |
| Real-time Sync     | ✅          | WebSocket, pairing codes                       |

---

## 2. Competitive Gap Analysis

### 2.1 CRITICAL GAPS (Blocking Core Vision)

| Gap                     | Competitor Reference           | Impact                           | Priority |
| ----------------------- | ------------------------------ | -------------------------------- | -------- |
| **Voice Interface**     | Claude Mobile, OpenAI Realtime | Non-technical users prefer voice | P0       |
| **Extended Thinking**   | Claude 4, Cursor               | Complex reasoning visibility     | P0       |
| **Computer Use (Full)** | Anthropic API, OpenAI Operator | Universal app automation         | P0       |
| **Research Mode**       | Claude Desktop                 | Multi-source investigation       | P0       |
| **Memory Persistence**  | Claude Desktop, Moltbot        | Cross-session context            | P0       |

### 2.2 HIGH-PRIORITY GAPS (Competitive Parity)

| Gap                        | Competitor Reference        | Impact                           | Priority |
| -------------------------- | --------------------------- | -------------------------------- | -------- |
| **Agent Swarm**            | Kimi K2.5 (100 agents)      | 4.5x faster complex tasks        | P1       |
| **Background Agents**      | Cursor (8 parallel)         | Continue work while user away    | P1       |
| **MCP Desktop Extensions** | Claude Desktop (.mcpb)      | One-click tool install           | P1       |
| **Interactive Tools**      | Claude Desktop (Jan 2026)   | In-chat UI widgets               | P1       |
| **Model Fallback Chain**   | Moltbot, Claude Code        | Reliability on provider failures | P1       |
| **Context Compaction**     | Moltbot, Claude Code        | Long session management          | P1       |
| **Skills System**          | Claude Desktop, Claude Code | Lightweight task templates       | P1       |
| **Hooks System**           | Claude Code                 | Customizable automation triggers | P1       |
| **Doctor/Diagnostics**     | Moltbot, Claude Code        | Self-healing, troubleshooting    | P1       |
| **Artifacts/Previews**     | Claude Desktop              | Live document/code preview       | P1       |

### 2.3 MEDIUM-PRIORITY GAPS (Differentiation)

| Gap                   | Competitor Reference       | Impact                    | Priority |
| --------------------- | -------------------------- | ------------------------- | -------- |
| **Codebase Indexing** | Cursor (RAG)               | Better code understanding | P2       |
| **Web Search/Fetch**  | Claude Desktop             | Real-time information     | P2       |
| **PDF Processing**    | Claude Desktop (100 pages) | Document analysis         | P2       |
| **Multi-Modal Input** | All competitors            | Images in chat            | P2       |
| **Git Integration**   | Claude Code                | Commit/PR workflows       | P2       |
| **Browser Preview**   | Cursor                     | Visual development        | P2       |
| **TTS/Readback**      | ElevenLabs integration     | Accessibility             | P2       |
| **Project Memory**    | Claude Desktop             | Per-project context       | P2       |
| **Custom Styles**     | Claude Desktop             | Response personalization  | P2       |
| **Incognito Mode**    | Claude Desktop             | Privacy option            | P2       |

### 2.4 LOWER-PRIORITY GAPS (Future Enhancement)

| Gap                           | Competitor Reference   | Impact                      | Priority |
| ----------------------------- | ---------------------- | --------------------------- | -------- |
| **Programmatic Tool Calling** | Claude API             | Code-based orchestration    | P3       |
| **Cloud Agents**              | Cursor                 | Remote background execution | P3       |
| **SAML/SCIM**                 | Cursor Enterprise      | Enterprise SSO              | P3       |
| **Multi-Channel**             | Moltbot (15+ channels) | WhatsApp/Telegram/Slack     | P3       |
| **Agent Marketplace**         | Google Mariner         | Third-party workflows       | P3       |
| **Teach & Repeat**            | Google Mariner         | User demonstration learning | P3       |
| **Visual Code Editor**        | Cursor                 | Drag-and-drop UI building   | P3       |

---

## 3. Feature Gap Details

### 3.1 Voice Interface (P0)

**What competitors do:**

- **OpenAI Realtime API**: 200ms latency, WebSocket streaming, 10 voices, function calling
- **Google Gemini Live**: 24 languages, barge-in, affective dialog, proactive audio
- **Claude Mobile**: ElevenLabs TTS, 5 voice options
- **ElevenLabs**: 75ms latency, 5000+ voices, 70+ languages

**Current AGI Workforce state:** None

**Recommended implementation:**

```
┌─────────────────────────────────────────────────────────────────┐
│                     VOICE ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────┤
│  React Frontend                                                  │
│    └── VoiceButton component                                    │
│          └── WebAudio API (microphone capture)                  │
│                └── 20ms chunks to Rust backend                  │
├─────────────────────────────────────────────────────────────────┤
│  Rust Backend                                                    │
│    ├── Silero VAD (ONNX) - Voice activity detection            │
│    ├── WebSocket to Deepgram Nova-3 (STT, 150ms)               │
│    ├── Existing AGI Loop (LLM processing)                       │
│    └── WebSocket to ElevenLabs Flash (TTS, 75ms)               │
├─────────────────────────────────────────────────────────────────┤
│  Target Metrics                                                  │
│    ├── Time to first audio: < 300ms                            │
│    ├── Barge-in response: < 200ms                              │
│    └── End-to-end latency: < 500ms                             │
└─────────────────────────────────────────────────────────────────┘
```

**Files to create/modify:**

- `src-tauri/src/core/voice/mod.rs` - Voice processing module
- `src-tauri/src/core/voice/vad.rs` - Silero VAD integration
- `src-tauri/src/core/voice/stt.rs` - Speech-to-text (Deepgram)
- `src-tauri/src/core/voice/tts.rs` - Text-to-speech (ElevenLabs)
- `src/components/VoiceInput/` - React voice components
- `src/stores/voiceStore.ts` - Voice state management

---

### 3.2 Extended Thinking (P0)

**What competitors do:**

- **Claude**: Visible reasoning chain, configurable budget_tokens
- **Cursor**: "ultrathink" phrases, Tab toggle for thinking mode

**Current AGI Workforce state:** Has `ReflectionEngine` but not visible to users

**Recommended implementation:**

- Add `extended_thinking` parameter to LLM requests
- Create `ThinkingAccordion` component showing reasoning steps
- Allow user toggle: "Show AI reasoning"
- Budget configuration in settings

**Files to modify:**

- `src-tauri/src/core/llm/mod.rs` - Add thinking parameters
- `src/components/UnifiedAgenticChat/ThinkingAccordion.tsx` - New component
- `src/stores/settingsStore.ts` - Add thinking preferences

---

### 3.3 Computer Use - Full Desktop Control (P0)

**What competitors do:**

- **Anthropic Computer Use**: Pixel-counting from screenshots, cross-app automation
- **OpenAI Operator/CUA**: Browser-based agent (deprecated Aug 2025)
- **Google Mariner**: Observe-Plan-Act loop, 83.5% WebVoyager
- **Amazon Nova Act**: 90% reliability on UI workflows

**Current AGI Workforce state:**

- Has: Screen capture, OCR, click/type simulation
- Missing: Full cross-app orchestration, visual reasoning loop

**Recommended implementation:**

```rust
// src-tauri/src/automation/computer_use/mod.rs
pub struct ComputerUseAgent {
    screenshot_provider: ScreenshotProvider,
    action_executor: ActionExecutor,
    visual_reasoner: VisualReasoner,  // NEW
}

impl ComputerUseAgent {
    pub async fn execute_task(&self, task: &str) -> Result<TaskResult> {
        loop {
            let screenshot = self.screenshot_provider.capture()?;
            let analysis = self.visual_reasoner.analyze(&screenshot, task).await?;

            match analysis.next_action {
                Action::Click(coords) => self.action_executor.click(coords)?,
                Action::Type(text) => self.action_executor.type_text(&text)?,
                Action::Scroll(direction) => self.action_executor.scroll(direction)?,
                Action::Complete => break,
            }
        }
        Ok(TaskResult::Success)
    }
}
```

---

### 3.4 Agent Swarm (P1) - Inspired by Kimi K2.5

**What Kimi K2.5 does:**

- 100 concurrent sub-agents
- 1,500 coordinated tool calls
- PARL (Parallel-Agent Reinforcement Learning)
- 4.5x speedup on complex tasks
- Dynamic agent instantiation (no predefined roles)

**Current AGI Workforce state:**

- Has: `submit_goal_parallel()`, `create_parallel_plans()`
- Missing: Dynamic sub-agent orchestration, 100-agent scale

**Recommended implementation:**

```rust
// src-tauri/src/core/swarm/mod.rs
pub struct AgentSwarm {
    orchestrator: Orchestrator,
    sub_agents: Vec<SubAgent>,
    max_agents: usize,  // Default: 100
    max_tool_calls: usize,  // Default: 1500
}

pub struct Orchestrator {
    task_decomposer: TaskDecomposer,
    agent_spawner: AgentSpawner,
    result_aggregator: ResultAggregator,
}

impl AgentSwarm {
    pub async fn execute(&mut self, task: &str) -> Result<SwarmResult> {
        // 1. Decompose task into parallelizable subtasks
        let subtasks = self.orchestrator.task_decomposer.decompose(task).await?;

        // 2. Spawn specialized sub-agents
        for subtask in subtasks {
            let agent = self.orchestrator.agent_spawner.spawn(&subtask)?;
            self.sub_agents.push(agent);
        }

        // 3. Execute in parallel
        let results = futures::future::join_all(
            self.sub_agents.iter().map(|a| a.execute())
        ).await;

        // 4. Aggregate results
        self.orchestrator.result_aggregator.aggregate(results)
    }
}
```

---

### 3.5 Memory Persistence (P0)

**What competitors do:**

- **Claude Desktop**: Auto-summarizes conversations, 24h updates, project-scoped memory
- **Moltbot**: Session store with transcript.jsonl, session keys

**Current AGI Workforce state:**

- Has: `KnowledgeBase`, `LearningSystem`, `OutcomeTracker`
- Missing: Cross-session memory, memory export/import

**Recommended implementation:**

- Add `memory` table to SQLite with vector embeddings
- Implement nightly memory consolidation job
- Add memory search to AGI context
- Export/import via JSON

---

### 3.6 MCP Desktop Extensions (P1)

**What Claude Desktop does:**

- `.mcpb` files (ZIP with manifest.json + server + deps)
- One-click installation via Settings > Extensions
- Built-in Node.js runtime
- Credentials in OS keychain

**Current AGI Workforce state:**

- Has: MCP protocol support, keyring credentials
- Missing: Extension package format, one-click install UI

**Recommended implementation:**

- Define `.agiext` package format (similar to .mcpb)
- Create Extensions settings panel
- Add extension registry/marketplace integration

---

## 4. Architecture Recommendations

### 4.1 Sub-Agent Architecture (for Swarm)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SWARM ORCHESTRATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                           [Main Orchestrator]                                │
│                                   │                                          │
│            ┌──────────────────────┼──────────────────────┐                  │
│            │                      │                      │                  │
│     [Research Agent]      [Code Agent]          [Data Agent]                │
│            │                      │                      │                  │
│    ┌───────┴───────┐      ┌──────┴──────┐       ┌──────┴──────┐           │
│    │               │      │             │       │             │           │
│ [Web Search]  [Doc Reader] [Editor] [Tester] [Analyzer] [Visualizer]      │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Communication: Hub-and-spoke (no peer-to-peer)                             │
│  Execution: Parallel with dependency tracking                               │
│  Scaling: Up to 100 concurrent sub-agents                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Voice Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VOICE PIPELINE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Microphone] ──20ms──> [VAD] ──speech──> [STT] ──text──> [AGI Loop]        │
│                          │                                     │             │
│                      [silence]                             [response]        │
│                          │                                     │             │
│                      [ignore]                                  v             │
│                                                            [TTS]            │
│                                                               │             │
│  [Speaker] <──stream──────────────────────────────────────────┘             │
│                                                                              │
│  Barge-in: Monitor mic during TTS, stop within 200ms                        │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Providers:                                                                  │
│    STT: Deepgram Nova-3 (150ms) or Whisper.cpp (local fallback)            │
│    TTS: ElevenLabs Flash (75ms) or Piper (local fallback)                  │
│    VAD: Silero (ONNX, runs in Rust)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Memory System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MEMORY SYSTEM                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Conversation] ──> [Summarizer] ──> [Memory Store]                         │
│                                           │                                  │
│                                    ┌──────┴──────┐                          │
│                                    │             │                          │
│                              [SQLite FTS]  [Vector DB]                      │
│                                    │             │                          │
│                                    └──────┬──────┘                          │
│                                           │                                  │
│  [New Conversation] <── [Hybrid Search] <─┘                                 │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Operations:                                                                 │
│    - Auto-summarize: Every 24 hours                                         │
│    - Memory search: Hybrid (70% vector, 30% FTS)                           │
│    - Project scoping: Separate memory per project                           │
│    - Export/Import: JSON format                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Security Considerations

### 5.1 Computer Use Security

| Risk                                | Mitigation                                  |
| ----------------------------------- | ------------------------------------------- |
| Prompt injection via screen content | Classifier to detect malicious instructions |
| Unintended actions                  | Sandbox in VM/container                     |
| Credential exposure                 | Never type passwords, use keyring           |
| Data exfiltration                   | Network allowlist                           |

### 5.2 Agent Swarm Security

| Risk                        | Mitigation                  |
| --------------------------- | --------------------------- |
| Resource exhaustion         | Per-agent resource limits   |
| Cascading failures          | Circuit breaker pattern     |
| Data leakage between agents | Isolated execution contexts |
| Infinite loops              | Max iterations per agent    |

### 5.3 Voice Security

| Risk                      | Mitigation                                     |
| ------------------------- | ---------------------------------------------- |
| Ambient voice attacks     | Wake word + confirmation for sensitive actions |
| Recording without consent | Visual indicator when mic active               |
| Unauthorized commands     | Voice print verification (optional)            |

---

## 6. Implementation Phases

### Phase 1: Foundation (Weeks 1-4)

- [ ] Extended Thinking visibility
- [ ] Memory persistence system
- [ ] Model fallback chain
- [ ] Context compaction
- [ ] Error translation layer

### Phase 2: Computer Control (Weeks 5-8)

- [ ] Full computer use agent
- [ ] Visual reasoning integration
- [ ] Cross-app automation
- [ ] Safety mechanisms

### Phase 3: Voice Interface (Weeks 9-12)

- [ ] VAD integration (Silero)
- [ ] STT integration (Deepgram)
- [ ] TTS integration (ElevenLabs)
- [ ] Barge-in handling
- [ ] Local fallback (Whisper.cpp/Piper)

### Phase 4: Agent Swarm (Weeks 13-16)

- [ ] Orchestrator architecture
- [ ] Sub-agent spawning
- [ ] Parallel execution
- [ ] Result aggregation
- [ ] Scaling to 100 agents

### Phase 5: Ecosystem (Weeks 17-20)

- [ ] MCP extension packages
- [ ] Skills system
- [ ] Hooks system
- [ ] Research mode
- [ ] Interactive tools

---

## 7. Success Metrics

| Metric                | Current | Target     | Competitor Benchmark |
| --------------------- | ------- | ---------- | -------------------- |
| Voice latency         | N/A     | < 500ms    | OpenAI: 200ms        |
| Computer use accuracy | ~60%    | > 80%      | Amazon Nova: 90%     |
| Parallel agent count  | 2-3     | 100        | Kimi K2.5: 100       |
| Task speedup (swarm)  | 1x      | 4x         | Kimi K2.5: 4.5x      |
| Memory retention      | Session | Persistent | Claude: 24h updates  |
| Context window        | 200K    | 256K       | Kimi K2.5: 256K      |

---

## 8. Dependencies and Risks

### External Dependencies

- Deepgram API (STT)
- ElevenLabs API (TTS)
- Anthropic Computer Use beta
- ONNX runtime for Silero

### Technical Risks

| Risk                        | Probability | Impact | Mitigation                 |
| --------------------------- | ----------- | ------ | -------------------------- |
| Voice latency > 500ms       | Medium      | High   | Local fallback providers   |
| Computer use accuracy < 70% | Medium      | High   | Hybrid DOM+vision approach |
| Swarm coordination failures | Low         | Medium | Circuit breakers, retries  |
| Memory storage limits       | Low         | Low    | Pruning strategy           |

---

_Document maintained by AGI Workforce development team_
_Next review: 2026-02-04_

---

## 9. Dynamic Benchmark-Driven Model Routing System

**Added:** 2026-01-29
**Status:** Planning Phase
**Priority:** P1 (High-Priority Gap - Competitive Parity)

### Executive Summary

Redesign the model routing system to dynamically select models based on live benchmark data rather than hardcoded preferences. The system will automatically update as new models and benchmarks are added, always routing to the highest-performing model for each task type within the user's subscription tier.

### Current State Analysis

**Problems with Current System:**

1. **Hardcoded Model Pools**: `MODEL_POOLS` arrays in `modelRouter.ts` are manually ordered and don't update when benchmarks change
2. **Static Benchmark Data**: `MODEL_METADATA` in `llm.ts` contains 80+ models with hardcoded benchmark scores
3. **No Dynamic Updates**: Adding new models requires code changes, deployment, and app updates
4. **Manual Maintenance**: When model benchmarks improve (e.g., GPT-5 releases), we must manually update rankings
5. **Stale Rankings**: Users may route to suboptimal models because our data is outdated

**What Works Well:**

- Task-type classification (coding, reasoning, general, agentic, multimodal)
- Benchmark scoring algorithm with weighted task types
- Tier-based access control
- Cost-aware secondary sorting
- Fallback chain with retry logic

### Architectural Insights from Agent Lightning

After reviewing Microsoft's [Agent Lightning framework](https://github.com/microsoft/agent-lightning), key patterns to adopt:

**1. LiteLLM as Routing Infrastructure**

- Agent Lightning uses [LiteLLM](https://github.com/BerriAI/litellm) as its LLM proxy layer
- LiteLLM is the industry standard for multi-provider routing (supports 100+ providers)
- Provides built-in fallback chains, load balancing, and cost tracking
- **Recommendation**: Use LiteLLM as our underlying routing engine rather than building from scratch

**2. Decoupled Architecture Pattern**

- **Router** (decision-maker): Selects model based on benchmarks
- **Executor** (LiteLLM proxy): Routes request to selected provider
- **Store** (Supabase): Persists models, benchmarks, routing decisions
- This separation enables independent scaling and testing

**3. OpenTelemetry Observability**

- Agent Lightning uses OpenTelemetry for comprehensive tracing
- Every routing decision becomes a traceable span with metadata
- Enables debugging, analytics, and performance monitoring
- **Recommendation**: Add OpenTelemetry instrumentation to all routing decisions

**4. Dynamic Resource Management**

- LiteLLM's model list can be updated at runtime via API
- No server restart required when adding/removing models
- **Recommendation**: Expose admin API to update LiteLLM config dynamically

### Proposed Architecture

#### Database Schema (Supabase PostgreSQL)

```sql
-- Core model registry (single source of truth)
CREATE TABLE models (
  id TEXT PRIMARY KEY,                    -- e.g., "anthropic/claude-sonnet-4"
  provider TEXT NOT NULL,                  -- "anthropic", "openai", "deepseek"
  name TEXT NOT NULL,                      -- "Claude Sonnet 4"
  context_window INTEGER,
  max_output_tokens INTEGER,
  input_cost_per_1m DECIMAL(10,6),        -- USD per 1M tokens
  output_cost_per_1m DECIMAL(10,6),
  supports_vision BOOLEAN DEFAULT false,
  supports_tools BOOLEAN DEFAULT false,
  supports_streaming BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,         -- Admin can disable models
  min_tier TEXT NOT NULL,                  -- "free", "hobby", "pro", "max", "enterprise"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Benchmark scores (separate table for flexibility)
CREATE TABLE model_benchmarks (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT REFERENCES models(id) ON DELETE CASCADE,
  benchmark_name TEXT NOT NULL,            -- "swe_bench", "mmlu", "aime_2024", "gpqa_diamond", "humaneval"
  score DECIMAL(5,2) NOT NULL,             -- 0.00 to 100.00
  source_url TEXT,                         -- Link to benchmark report
  measured_at DATE NOT NULL,               -- When benchmark was run
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, benchmark_name, measured_at)
);

-- Audit log for routing decisions (analytics + debugging)
CREATE TABLE routing_decisions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  requested_model TEXT,                    -- What user asked for (e.g., "auto-premium")
  selected_model_id TEXT REFERENCES models(id),
  task_type TEXT,                          -- "coding", "reasoning", etc.
  tier TEXT,                               -- User's tier at time of request
  benchmark_score DECIMAL(5,2),            -- Score of selected model for this task
  reason TEXT,                             -- "Highest SWE-bench score (85.2) in pro tier"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Model capability tags (for future filtering)
CREATE TABLE model_capabilities (
  model_id TEXT REFERENCES models(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,                -- "agentic", "multimodal", "long_context"
  PRIMARY KEY (model_id, capability)
);

-- Indexes
CREATE INDEX idx_models_active ON models(is_active, min_tier);
CREATE INDEX idx_benchmarks_lookup ON model_benchmarks(model_id, benchmark_name);
CREATE INDEX idx_routing_analytics ON routing_decisions(created_at, task_type);
```

#### Backend Service Layer

**New Rust Module: `src-tauri/src/core/llm/dynamic_router.rs`**

Key components:

- `DynamicModelRouter` struct with LiteLLM integration
- OpenTelemetry tracing for all routing decisions
- Task-aware benchmark score calculation
- Hot-reload capability for LiteLLM configuration
- 1-hour TTL cache with graceful degradation

**Routing Algorithm:**

1. Parse requested model (explicit vs auto-economy/balanced/premium)
2. If explicit selection, return that model (user override)
3. If auto mode:
   - Fetch all active models for user's tier from cache/DB
   - Filter by capabilities (vision, tools, context window)
   - Calculate task-specific benchmark scores for each model
   - Sort by: (1) benchmark score DESC, (2) cost ASC
   - For auto-economy: pick cheapest in top 50th percentile
   - For auto-balanced: pick middle-cost in top 25th percentile
   - For auto-premium: pick highest score regardless of cost
4. Log routing decision to `routing_decisions` table
5. Return `RoutingDecision` with model + rationale

#### Task-Specific Benchmark Weights

```rust
pub enum TaskType {
    Coding,      // Weight: SWE-bench (70%), HumanEval (30%)
    Reasoning,   // Weight: GPQA (50%), AIME (30%), MMLU (20%)
    General,     // Weight: MMLU (100%)
    Agentic,     // Weight: SWE-bench (40%), GPQA (30%), MMLU (30%)
    Multimodal,  // Weight: MMLU (60%), reasoning benchmarks (40%)
}
```

### LiteLLM Deployment Architecture

**Desktop App (Embedded Mode):**

- LiteLLM runs as subprocess
- Latency: ~5ms
- Recommended for single-user scenarios

**Web App (Standalone Service):**

- LiteLLM deployed as Docker container
- Latency: ~20ms (local), ~100ms (remote)
- Scales to multi-user

**Production:**

- Deploy as separate service (Fly.io, Railway, AWS ECS)
- API gateway for rate limiting (Cloudflare)

### Admin Interface

**New Web Route: `apps/web/app/admin/models/`**

Features:

- Model CRUD (add, edit, activate/deactivate)
- Benchmark upload (CSV/JSON import)
- Benchmark history visualization (line charts)
- Routing analytics dashboard
- "Sync to LiteLLM" button for config hot-reload
- LiteLLM health status monitoring

**Access Control:**

- Only users with `role = 'admin'` in `profiles` table
- Protected by middleware checking `user.role`

### Migration Strategy

**Phase 1: LiteLLM + Database Setup (Week 1)**

1. Set up LiteLLM proxy (Docker Compose for local dev)
2. Create Supabase tables with RLS policies
3. Write migration script to import current `MODEL_METADATA`
4. Generate initial LiteLLM config YAML from Supabase data
5. Test LiteLLM routing with 5-10 models
6. Deploy schema changes to staging
7. Add admin role to specific users

**Phase 1.5: OpenTelemetry Setup (Week 1)**

1. Set up Jaeger or Grafana Cloud for trace collection
2. Initialize OpenTelemetry in Rust backend
3. Add tracing to existing LLM calls (baseline metrics)
4. Create Grafana dashboard for monitoring

**Phase 2: Backend Implementation (Week 2)**

1. Implement `DynamicModelRouter` in Rust with LiteLLM integration
2. Add config generation and hot-reload methods
3. Add Tauri commands: `route_model_request`, `refresh_model_cache`, etc.
4. Create Supabase RPC function `route_model_request`
5. Write tests for routing algorithm and LiteLLM config generation

**Phase 3: Admin Interface (Week 2-3)**

1. Build admin dashboard at `/admin/models`
2. Implement CRUD operations for models and benchmarks
3. Add CSV import for bulk benchmark updates
4. Add "Sync to LiteLLM" button
5. Show LiteLLM health status
6. Deploy to web app with role-based access control

**Phase 4: Frontend Integration (Week 3)**

1. Update `modelRouter.ts` to call Rust backend (which calls LiteLLM)
2. Update web routing service to call LiteLLM proxy
3. Remove hardcoded `MODEL_POOLS` and `MODEL_METADATA`
4. Add loading states and error handling
5. Add trace ID display in UI (optional, for debugging)

**Phase 5: Testing & Rollout (Week 3-4)**

1. A/B test new routing vs old routing (log both decisions)
2. Monitor routing decision quality via analytics dashboard
3. Gradually roll out to 10% → 50% → 100% of users
4. Keep old routing as fallback for 2 weeks

**Backward Compatibility:**

- If cache is empty/stale, fall back to hardcoded `MODEL_METADATA`
- Log warnings when fallback is used
- After 30 days of stable operation, remove fallback code

### Benchmark Update Workflow

**Manual Updates (Initial):**

1. Admin logs into web app
2. Navigates to `/admin/models/benchmarks`
3. Uploads CSV with benchmark data
4. System validates and inserts into `model_benchmarks`
5. Cache invalidated, all clients refresh on next request

**Automated Updates (Future Enhancement):**

1. Cron job runs daily at 3 AM UTC
2. Fetches latest benchmarks from:
   - OpenRouter API
   - Artificial Analysis leaderboard
   - LMSys Arena leaderboard
3. Parses responses and updates `model_benchmarks`
4. Sends Slack notification with changes
5. Admin reviews and approves before making live

### Success Metrics

**Quality Metrics:**

1. **Routing Accuracy**: 95%+ of auto-routed requests use the highest-benchmark model for the task type within the user's tier
2. **Cache Hit Rate**: 99%+ of routing requests served from cache (< 50ms latency)
3. **Data Freshness**: Benchmark data updated within 24 hours of official release

**User Experience:**

1. **Response Quality**: User satisfaction score increases by 15%+ (measured via feedback)
2. **Cost Efficiency**: Auto-economy mode reduces costs by 30%+ vs auto-premium while maintaining 90%+ quality
3. **Transparency**: Users can see routing rationale in UI

**Operational Metrics:**

1. **Admin Efficiency**: New model added in < 5 minutes (previously required code deployment)
2. **Benchmark Updates**: Benchmarks updated within 1 business day of release (previously weeks)
3. **Error Rate**: < 0.1% routing failures (fallback to hardcoded metadata)

### Risk Mitigation

| Risk                     | Mitigation                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Outage          | Fallback to cached data (even if stale) + hardcoded metadata; Alert if cache age > 6 hours                                                           |
| Incorrect Benchmark Data | Admin approval workflow before benchmarks go live; Validation: scores 0-100, require source URL; Keep benchmark history, allow admin revert          |
| Routing Regression       | A/B test new vs old routing; Alert if new routing selects model with < 90% of old routing's benchmark score; Feature flag to disable dynamic routing |
| Cache Stampede           | Use cache locking (fetch once, share result); Staggered refresh at different times; Rate limiting: Max 1 cache refresh per 5 min                     |
| Performance Degradation  | Pre-compute routing pools in background; Benchmark: Routing decision < 100ms p99; Load testing: Validate 1000 req/s throughput                       |

### Implementation Checklist

**LiteLLM Setup:**

- [ ] Add LiteLLM to dependencies
- [ ] Create config builder reading from Supabase
- [ ] Set up LiteLLM proxy (systemd/embedded)
- [ ] Configure environment for provider API keys
- [ ] Test multi-provider routing

**OpenTelemetry Setup:**

- [ ] Add opentelemetry crates
- [ ] Initialize tracer in app startup
- [ ] Add spans to all routing decisions
- [ ] Configure OTLP exporter
- [ ] Create Grafana dashboard

**Backend (Rust):**

- [ ] Create `src-tauri/src/core/llm/dynamic_router.rs`
- [ ] Implement DynamicModelRouter with LiteLLM client
- [ ] Add calculate_task_score() method
- [ ] Add regenerate_litellm_config() method
- [ ] Add Tauri commands for routing
- [ ] Write tests

**Database (Supabase):**

- [ ] Write migration for routing tables
- [ ] Add RLS policies
- [ ] Create Postgres functions
- [ ] Write data migration script
- [ ] Seed database with current model data

**Web Admin Interface:**

- [ ] Create admin layout with auth middleware
- [ ] Create model management pages
- [ ] Create benchmark upload interface
- [ ] Create analytics dashboard
- [ ] Add CSV parser
- [ ] Add analytics charts

**Frontend Integration:**

- [ ] Update modelRouter.ts to call Tauri command
- [ ] Remove MODEL_POOLS and MODEL_METADATA constants
- [ ] Create model-routing-service.ts for web
- [ ] Add error handling and loading states

**Testing:**

- [ ] Unit tests for routing algorithm
- [ ] Integration tests for Supabase functions
- [ ] E2E tests for admin interface
- [ ] Load tests for cache performance
- [ ] A/B test comparing old vs new routing

**Documentation:**

- [ ] Update CLAUDE.md with new architecture
- [ ] Write admin guide: "How to Add a New Model"
- [ ] Write admin guide: "How to Update Benchmarks"
- [ ] Add architecture diagram
- [ ] Update API documentation

**Deployment:**

- [ ] Deploy database migrations to staging
- [ ] Deploy backend changes (beta channel)
- [ ] Deploy web admin to staging
- [ ] Test end-to-end in staging
- [ ] Deploy to production with 10% rollout
- [ ] Monitor error rates
- [ ] Scale to 100% over 1 week

### Estimated Effort

- **Backend Implementation**: 3-4 days (Rust + Supabase functions)
- **Database Setup**: 1 day (schema + migration + seeding)
- **Admin Interface**: 3-4 days (CRUD UI + analytics dashboard)
- **Frontend Integration**: 2-3 days (desktop + web updates)
- **Testing**: 2-3 days (unit + integration + E2E)
- **Documentation**: 1 day
- **Deployment + Monitoring**: 1-2 days

**Total**: 13-18 development days (~3-4 weeks with testing and iteration)

### Research Sources

- [Agent Lightning GitHub Repository](https://github.com/microsoft/agent-lightning) - Open-source training framework for AI agents
- [Agent Lightning Research Project](https://www.microsoft.com/en-us/research/project/agent-lightning/) - Microsoft Research overview
- [ArXiv Paper: Agent Lightning](https://arxiv.org/html/2508.03680) - Academic publication
- [Orchestrating Intelligence: Confidence-Aware Routing](https://arxiv.org/html/2601.04861v1) - Multi-agent collaboration paper
- [OpenRouter Review 2025](https://skywork.ai/blog/openrouter-review-2025/) - Production multi-model LLM gateway analysis
- [LiteLLM GitHub](https://github.com/BerriAI/litellm) - Multi-provider LLM proxy (industry standard)
- [OpenTelemetry](https://opentelemetry.io/) - Observability framework

### Conclusion

This dynamic benchmark-driven routing system will:
✅ Automatically route to highest-quality models based on live benchmarks
✅ Respect user tier restrictions
✅ Update seamlessly as new models/benchmarks are released
✅ Provide admin interface for easy maintenance
✅ Maintain backward compatibility during migration
✅ Enable data-driven optimization over time
✅ Leverage industry-standard LiteLLM for battle-tested routing infrastructure
✅ Include comprehensive observability via OpenTelemetry
✅ Support hot-reload of model configurations without downtime

**Key Architectural Decisions Informed by Agent Lightning:**

1. **LiteLLM Integration**: Using proven routing infrastructure rather than custom implementation
2. **Decoupled Design**: Router (decision) → LiteLLM (execution) → Supabase (state)
3. **Observability-First**: OpenTelemetry tracing for every routing decision
4. **Dynamic Updates**: Hot-reload model configs without service restarts

The system aligns with AGI Workforce's core principles: simplicity for users (they just say what they want), full autonomy (routing happens automatically), and safety (fallback mechanisms prevent failures). By adopting proven patterns from Agent Lightning and LiteLLM, we reduce implementation risk and maintenance burden while gaining enterprise-grade features.

---

_Last Updated: 2026-01-29_
