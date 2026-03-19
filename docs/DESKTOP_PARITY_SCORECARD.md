# Desktop Parity Scorecard — AGI Workforce vs Claude Desktop

_Generated: 2026-03-18 | Competitive research via live web search_

## Summary

| Dimension             | AGI Workforce | Claude Desktop | Winner  |
| --------------------- | :-----------: | :------------: | :-----: |
| Chat & Streaming      |      85       |       95       | Claude  |
| Model Selection       |      98       |       40       | **AGI** |
| Artifacts & Rendering |      75       |       95       | Claude  |
| Projects & Memory     |      70       |       90       | Claude  |
| MCP & Connectors      |      80       |       90       | Claude  |
| Agent Autonomy        |      90       |       85       | **AGI** |
| Computer Use          |      70       |       80       | Claude  |
| Voice & Dictation     |      75       |       80       | Claude  |
| Settings & Theming    |      85       |       85       |   Tie   |
| Security              |      95       |       85       | **AGI** |
| Desktop Integration   |      80       |       85       | Claude  |
| Multi-Model Support   |      100      |       0        | **AGI** |
| Local LLM Support     |      95       |       0        | **AGI** |
| Mobile Companion      |      90       |       0        | **AGI** |
| Skills & Automation   |      95       |       75       | **AGI** |
| **Overall**           |   **85.5**    |    **65.7**    | **AGI** |

**AGI Workforce wins 7 dimensions, Claude wins 6, 1 tie, Claude scores 0 in 3 dimensions.**

## Detailed Scoring

### 1. Chat & Streaming — AGI: 85 | Claude: 95

| Feature                     | AGI | Claude | Notes                                                                                |
| --------------------------- | :-: | :----: | ------------------------------------------------------------------------------------ |
| Basic chat                  | ✅  |   ✅   | Both fully functional                                                                |
| SSE streaming               | ✅  |   ✅   | Both use SSE                                                                         |
| Thinking indicators         | ✅  |   ✅   | Both show thinking with timers                                                       |
| Thinking block display      | ✅  |   ✅   | Expandable thinking sections                                                         |
| File drag-and-drop          | ✅  |   ✅   | Both support multi-file                                                              |
| Screenshot capture          | ✅  |   ✅   | Both have screen capture                                                             |
| Infinite chats (compaction) | ⚠️  |   ✅   | Claude has 3-layer compaction; AGI has summarizer but needs wiring                   |
| Conversation search         | ⚠️  |   ✅   | Claude has cross-conversation search + citations; AGI FTS backend exists, UI partial |
| Web search                  | ✅  |   ✅   | Both have web search with citations                                                  |
| Inline chart generation     | ⚠️  |   ✅   | Claude launched March 12, 2026; AGI has chart widgets but not inline                 |
| Chat branching              | ✅  |   ❌   | **AGI advantage** — fork conversations                                               |
| Multi-model per chat        | ✅  |   ❌   | **AGI advantage** — switch models mid-chat                                           |

### 2. Model Selection — AGI: 98 | Claude: 40

| Feature                                 |  AGI   | Claude | Notes                                                                                     |
| --------------------------------------- | :----: | :----: | ----------------------------------------------------------------------------------------- |
| Model selector UI                       |   ✅   |   ✅   |                                                                                           |
| Multiple providers                      | ✅ 18+ |  ❌ 1  | **AGI massive advantage** (Anthropic, OpenAI, Google, xAI, DeepSeek, Qwen, Mistral, etc.) |
| BYOK (bring your own keys)              |   ✅   |   ❌   | **AGI advantage** — no subscription required                                              |
| Local models (Ollama)                   |   ✅   |   ❌   | **AGI advantage** — full privacy                                                          |
| 60+ model IDs                           |   ✅   |  ❌ 3  | Claude only has Opus/Sonnet/Haiku                                                         |
| Capability detection                    |   ✅   |  N/A   | Ollama capability probing                                                                 |
| Cost tracking per request               |   ✅   |   ❌   | **AGI advantage**                                                                         |
| Fallback chains                         |   ✅   |   ❌   | Multi-provider automatic fallback                                                         |
| Auto-routing (economy/balanced/premium) |   ✅   |   ⚠️   | Claude has smart model switching; AGI has 4 auto modes                                    |

### 3. Artifacts & Rendering — AGI: 75 | Claude: 95

| Feature                               | AGI | Claude | Notes                                              |
| ------------------------------------- | :-: | :----: | -------------------------------------------------- |
| Code with syntax highlighting         | ✅  |   ✅   | Both support                                       |
| Live HTML/CSS preview                 | ✅  |   ✅   |                                                    |
| React component rendering             | ✅  |   ✅   | Both render React live                             |
| Mermaid diagrams                      | ⚠️  |   ✅   | AGI has partial support                            |
| SVG rendering                         | ✅  |   ✅   | Both sanitize + render                             |
| Markdown rendering                    | ✅  |   ✅   |                                                    |
| Interactive data viz                  | ⚠️  |   ✅   | Claude has inline charts; AGI has Recharts widgets |
| Edit/Fork artifacts                   | ⚠️  |   ✅   | Claude has full edit+fork; AGI partial             |
| Publish/Share artifacts               | ⚠️  |   ✅   | Claude has public links; AGI has share dialog      |
| AI-powered artifacts (embedded API)   | ❌  |   ✅   | Claude artifacts can call Claude API               |
| Persistent artifact storage (20MB)    | ❌  |   ✅   | Claude has per-artifact persistence                |
| File creation (XLSX, PPTX, DOCX, PDF) | ✅  |   ✅   | Both generate documents                            |

### 4. Projects & Memory — AGI: 70 | Claude: 90

| Feature                          | AGI | Claude | Notes                                                      |
| -------------------------------- | :-: | :----: | ---------------------------------------------------------- |
| Project workspaces               | ✅  |   ✅   | Both have projects                                         |
| Knowledge base upload            | ✅  |   ✅   | Both support file upload                                   |
| Custom instructions per project  | ✅  |   ✅   |                                                            |
| Per-project memory               | ✅  |   ✅   | Both have project-scoped memory                            |
| 24-hour memory synthesis         | ⚠️  |   ✅   | Claude auto-synthesizes; AGI has summarizer                |
| Cross-conversation search        | ⚠️  |   ✅   | Claude has citations back to chats                         |
| RAG mode (10x context expansion) | ⚠️  |   ✅   | Claude expands 200K→2M via RAG; AGI has RAG but not scaled |
| Project sharing (team)           | ⚠️  |   ✅   | Claude has viewer/editor roles                             |

### 5. MCP & Connectors — AGI: 80 | Claude: 90

| Feature                           |  AGI  | Claude | Notes                                                         |
| --------------------------------- | :---: | :----: | ------------------------------------------------------------- |
| Local MCP servers (STDIO)         |  ✅   |   ✅   | Both fully support                                            |
| HTTP/SSE transport                |  ✅   |   ✅   |                                                               |
| Built-in connectors               | ✅ 36 | ✅ 50+ | Claude has more pre-built (gap closing: +10 added session 10) |
| OAuth 2.1 + PKCE                  |  ✅   |   ✅   | Both implement                                                |
| Connector gallery UI              |  ✅   |   ✅   |                                                               |
| MCP Apps (interactive UI in chat) |  ❌   |   ✅   | Claude launched Jan 26, 2026                                  |
| Custom connector URLs             |  ✅   |   ✅   |                                                               |
| Connector health monitoring       |  ✅   |   ⚠️   | **AGI advantage**                                             |
| MCP bundle marketplace            |  ✅   |   ❌   | **AGI advantage**                                             |

### 6. Agent Autonomy — AGI: 90 | Claude: 85

| Feature              | AGI | Claude | Notes                                           |
| -------------------- | :-: | :----: | ----------------------------------------------- |
| Autonomous execution | ✅  |   ✅   | Claude has "Cowork"                             |
| Multi-step tool use  | ✅  |   ✅   |                                                 |
| Background agents    | ✅  |   ✅   | Both support                                    |
| Swarm orchestration  | ✅  |   ❌   | **AGI advantage** — parallel multi-agent        |
| Task decomposition   | ✅  |   ❌   | **AGI advantage** — automatic subtask splitting |
| Approval workflow    | ✅  |   ✅   |                                                 |
| 140+ AI skills       | ✅  |   ⚠️   | Claude has skills but fewer, **AGI advantage**  |
| Scheduled tasks      | ✅  |   ✅   | Both have scheduling                            |
| Plugin marketplace   | ⚠️  |   ✅   | Claude launched plugin marketplace Feb 2026     |

### 7. Computer Use — AGI: 70 | Claude: 80

| Feature                            | AGI | Claude | Notes                                    |
| ---------------------------------- | :-: | :----: | ---------------------------------------- |
| Screenshot + click + type + scroll | ✅  |   ✅   | Both support core actions                |
| Observe-Plan-Act loop              | ✅  |   ✅   | Both implement OPA cycle                 |
| Zoom action (high-res inspect)     | ❌  |   ✅   | Claude has Zoom Action since 2025        |
| OCR text extraction                | ✅  |   ✅   |                                          |
| Window management                  | ✅  |   ⚠️   | **AGI advantage** — full window tracking |
| Safety validation                  | ✅  |   ✅   | Both have safety checks                  |
| Action recording/replay            | ✅  |   ❌   | **AGI advantage**                        |

### 8. Voice & Dictation — AGI: 75 | Claude: 80

| Feature               | AGI | Claude | Notes                                         |
| --------------------- | :-: | :----: | --------------------------------------------- |
| Voice dictation       | ✅  |   ✅   | Claude uses Caps Lock; AGI uses hotkey hold   |
| Push-to-talk          | ✅  |   ✅   |                                               |
| TTS output            | ✅  |   ✅   | Claude has 14 voices; AGI has Piper local TTS |
| Local Whisper STT     | ✅  |   ❌   | **AGI advantage** — offline transcription     |
| Deepgram cloud STT    | ✅  |   ❌   | **AGI advantage** — additional STT provider   |
| Wake word detection   | ✅  |   ❌   | **AGI advantage**                             |
| Barge-in interruption | ✅  |   ❌   | **AGI advantage**                             |
| 38 language support   | ⚠️  |   ✅   | Claude auto-detects 38 languages              |

### 9. Settings & Theming — AGI: 85 | Claude: 85

| Feature                      | AGI | Claude | Notes                                               |
| ---------------------------- | :-: | :----: | --------------------------------------------------- |
| Light/Dark/System theme      | ✅  |   ✅   |                                                     |
| Dyslexic-friendly font       | ✅  |   ✅   | Both have OpenDyslexic                              |
| 14 theme presets             | ✅  |   ❌   | **AGI advantage** (Catppuccin, Dracula, Nord, etc.) |
| Custom theme editor          | ✅  |   ❌   | **AGI advantage**                                   |
| Capability toggles           | ✅  |   ✅   |                                                     |
| Keyboard shortcuts config    | ✅  |   ✅   |                                                     |
| Response style customization | ❌  |   ✅   | Claude has response styles                          |

### 10-15. Remaining Dimensions

| Dimension                                          | AGI | Claude | Notes                                                                             |
| -------------------------------------------------- | :-: | :----: | --------------------------------------------------------------------------------- |
| Security (encryption, ToolGuard)                   | 95  |   85   | **AGI**: Argon2id + AES-GCM + ToolGuard + RBAC. Claude: standard but less visible |
| Desktop Integration (tray, shortcuts, auto-update) | 80  |   85   | Claude has Quick Entry (dbl-tap Option); AGI has tray + floating chat             |
| Multi-Model Support                                | 100 |   0    | **AGI exclusive** — 18 providers, 60+ models                                      |
| Local LLM Support                                  | 95  |   0    | **AGI exclusive** — Ollama with capability detection                              |
| Mobile Companion                                   | 90  |   0    | **AGI exclusive** — QR pair, WebRTC, agent dashboard                              |
| Skills & Automation                                | 95  |   75   | **AGI**: 140+ non-coding skills; Claude has skills but fewer categories           |

## AGI Workforce Unique Advantages (Claude Desktop Cannot Match)

1. **18+ LLM providers, 60+ models** — Users choose any model from any provider
2. **BYOK** — Bring your own API keys, no $20/mo subscription required
3. **Local LLM via Ollama** — Full privacy, zero cloud dependency, capability detection
4. **Swarm orchestration** — Parallel multi-agent execution with task decomposition
5. **140+ non-coding AI skills** — Writing, research, analysis, not just code
6. **Mobile companion app** — QR pair with desktop, approve/deny agent actions from phone
7. **Unlimited MCP tools** — No artificial caps on tool count
8. **Multi-model per conversation** — Switch models mid-chat, compare responses
9. **Cost tracking** — Per-request cost visibility across all providers
10. **14 theme presets + custom editor** — Catppuccin, Dracula, Nord, Tokyo Night, etc.
11. **Action recording/replay** — Record desktop automation scripts for reuse
12. **Wake word + barge-in** — Hands-free voice activation with interruption
13. **Chat branching** — Fork conversations into alternative exploration paths
14. **MCP bundle marketplace** — One-click install of curated MCP server bundles
15. **Local Whisper STT** — Offline speech-to-text without cloud dependency

## Claude Desktop Advantages (AGI Workforce Should Close)

1. **Inline chart generation** — Interactive charts directly in chat (March 2026)
2. **MCP Apps** — Third-party interactive UI rendered inside chat (Jan 2026)
3. **AI-powered artifacts** — Artifacts that call Claude API without deployment
4. **Persistent artifact storage** — 20MB per artifact, state across sessions
5. **24-hour memory synthesis** — Automatic conversation analysis every 24 hours
6. **RAG mode expansion** — 200K→2M token context via RAG
7. **50+ pre-built connectors** — More than AGI's 25
8. **Plugin marketplace** — Official plugin ecosystem (Feb 2026)
9. **Zoom Action** — High-resolution element inspection for computer use
10. **Response styles** — Configurable response tone/format
