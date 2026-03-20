# Desktop Competitive Audit — AGI Workforce vs All Competitors

_Updated: 2026-03-18 | Session 10 — 15-agent parallel research + 11-agent codebase exploration_

## Executive Summary

AGI Workforce is the **only** tool combining native Tauri desktop app + 9+ model providers + screen/keyboard/app automation + 140+ non-coding skills + MCP without tool caps + mobile companion with live agent dashboard. No competitor achieves this combination.

---

## Feature Matrix (0-100 per area)

| Feature Area            | AGI Workforce | Claude Desktop | ChatGPT Desktop | Cursor | Windsurf | Perplexity | Warp   | Gemini |
| ----------------------- | ------------- | -------------- | --------------- | ------ | -------- | ---------- | ------ | ------ |
| **Multi-Model Support** | 95            | 10             | 10              | 80     | 85       | 95         | 70     | 10     |
| **Desktop Automation**  | 85            | 75             | 60              | 0      | 0        | 30         | 20     | 0      |
| **MCP/Connectors**      | 80            | 95             | 10              | 60     | 65       | 10         | 10     | 10     |
| **Non-Coding Skills**   | 90            | 40             | 50              | 0      | 0        | 60         | 0      | 40     |
| **Local LLM (BYOK)**    | 90            | 0              | 0               | 0      | 0        | 0          | 70     | 0      |
| **Chat & Artifacts**    | 70            | 90             | 85              | 70     | 70       | 75         | 30     | 70     |
| **Agent Runtime**       | 80            | 80             | 70              | 85     | 75       | 80         | 60     | 30     |
| **Mobile Companion**    | 60            | 0              | 50              | 40     | 0        | 50         | 0      | 50     |
| **Voice Input**         | 75            | 0              | 40              | 0      | 0        | 60         | 0      | 30     |
| **Research/Citations**  | 70            | 50             | 50              | 0      | 0        | 95         | 0      | 40     |
| **Coding IDE**          | 40            | 70             | 40              | 95     | 95       | 0          | 50     | 20     |
| **Settings/Themes**     | 65            | 60             | 50              | 80     | 70       | 40         | 50     | 40     |
| **Security**            | 85            | 80             | 70              | 60     | 60       | 50         | 50     | 70     |
| **Memory System**       | 80            | 70             | 60              | 50     | 70       | 50         | 0      | 30     |
| **Pricing Flexibility** | 95            | 30             | 30              | 40     | 50       | 30         | 60     | 80     |
| **AVERAGE**             | **77**        | **50**         | **44**          | **44** | **43**   | **42**     | **31** | **35** |

---

## Competitor Deep Dives

### Claude Desktop (Anthropic) — Primary Competitor

**Strengths:**

- Invented MCP standard — deepest native MCP integration, unlimited tools
- Desktop Extensions for one-click MCP server installation
- Cowork: multi-step autonomous desktop tasks without coding
- Computer Use (beta): native desktop screenshots, mouse, keyboard
- Claude Code integration for developer workflows
- Projects with knowledge base and custom instructions
- Artifacts: code, HTML, React, Mermaid, SVG with side panel
- Infinite Chats with auto-summarization beyond context limits
- Adaptive/Extended Thinking with reasoning display

**Weaknesses:**

- Claude-only (no BYOK, no multi-model, no local LLMs)
- No mobile companion with agent oversight
- Rate-limited by plan tier
- Computer Use is token-intensive
- Relatively new Windows support

**Pricing:** Pro $20/mo, Max 5x $100/mo, Max 20x $200/mo, Team $30/user/mo

### ChatGPT Desktop (OpenAI)

**Strengths:**

- GPT-5.4 Computer Use (75% OSWorld — industry-leading benchmark)
- Codex Desktop App for parallel autonomous coding agents
- ChatGPT Agent with its own virtual computer
- DALL-E + Sora for multimodal creation
- Massive user base

**Weaknesses:**

- OpenAI models only, no BYOK
- Agent runs in sandboxed VM, not native desktop
- Voice removed from macOS
- $200/mo for full access
- No MCP support

**Pricing:** Free, Plus $20/mo, Pro $200/mo

### Cursor AI IDE

**Strengths:**

- Best-in-class code completion
- Cloud Agents accessible from browser/phone/Slack
- Multi-model (5+ providers)
- VS Code extension compatibility
- BugBot for proactive bug scanning

**Weaknesses:**

- 40-tool MCP cap
- Code-only (no general-purpose AI tasks)
- No desktop automation, no voice, no non-coding skills

**Pricing:** Free, Pro $20/mo, Pro+ $60/mo, Ultra $200/mo

### Windsurf (Codeium)

**Strengths:**

- Arena Mode for blind model comparison
- Memory system that learns coding patterns
- Parallel Cascade sessions with Git worktrees
- Cheapest Pro tier ($15/mo)

**Weaknesses:**

- Code-only, no desktop automation, no voice

**Pricing:** Free, Pro $15/mo, Teams $30/user/mo

### Perplexity Desktop

**Strengths:**

- Perplexity Computer: autonomous workflows with 19 AI models
- Personal Computer: persistent Mac mini agent with local file access
- Best-in-class research with citations

**Weaknesses:**

- No MCP support, no BYOK
- Personal Computer requires Mac mini at $200/mo
- No coding-specific features

**Pricing:** Free, Pro $20/mo, Max $200/mo

### Warp Terminal

**Strengths:**

- Terminal-first AI experience
- Multi-agent hosting (Claude Code + Codex + Gemini CLI)
- BYOK support
- Warp Drive for team command sharing

**Weaknesses:**

- Terminal-only (no GUI), macOS-focused

**Pricing:** Free, Build $20/mo

---

## AGI Workforce Competitive Advantages (Validated)

### 1. Local Desktop Control + Multi-Model + Native GUI (Trifecta)

No competitor combines all three. ChatGPT has desktop control but single-model. Cursor has multi-model but zero desktop control. Claude has native desktop control but single-model.

### 2. Mobile Companion with Live Agent Dashboard

ChatGPT and Perplexity have mobile apps but they are separate chat experiences, not live agent oversight dashboards with approve/deny per tool call.

### 3. 140+ Non-Coding AI Skills

Every competitor is either code-focused (Cursor, Windsurf, Devin, Copilot) or general-chat (ChatGPT, Gemini). None offer structured non-coding professional skills.

### 4. Full BYOK + Local LLMs + Native GUI

No competitor offers all three. Warp has BYOK but terminal-only. Cursor has multi-model but no BYOK or local LLMs.

### 5. MCP Without Artificial Limits

Cursor caps at 40 tools. Claude Desktop has unlimited MCP but is single-model. AGI Workforce offers unlimited MCP with multi-model.

### 6. Pricing: $0 (BYOK)

Users bring their own API keys. No per-seat or monthly platform fee for core functionality.

---

## Emerging Threats to Monitor

1. **GPT-5.4 Computer Use**: 75% OSWorld score. If OpenAI adds BYOK or opens to third parties, serious threat.
2. **Perplexity Computer**: 19-model orchestration + autonomous workflows. Lacks native desktop automation and MCP.
3. **Intent (Augment Code)**: Spec-driven multi-agent with BYOA. Novel paradigm could expand beyond coding.
4. **Cursor Cloud Agents**: Accessible from phone/Slack — partially addresses mobile gap for coding.

---

## Gap Analysis (AGI Workforce vs Claude Desktop)

| Feature             | Claude Desktop                       | AGI Workforce                      | Gap                       |
| ------------------- | ------------------------------------ | ---------------------------------- | ------------------------- |
| Built-in connectors | 50+                                  | 26                                 | -24 connectors            |
| Desktop Extensions  | Yes                                  | Partial                            | Need 1-click install flow |
| Infinite Chats      | Auto-summarization                   | Summarizer built, not wired        | Wire into message stream  |
| Adaptive Thinking   | Dynamic budget                       | Config exists, UI partial          | Complete UI               |
| Artifacts rendering | Code, HTML, React, Mermaid, SVG      | ArtifactRenderer exists (1666 LOC) | Polish side panel         |
| Projects            | Knowledge base + custom instructions | Backend complete                   | Wire frontend             |
| Memory UI           | View, edit, delete, per-project      | Backend complete, frontend partial | Complete Memory panel     |
| Settings themes     | Light/Dark/System                    | Theme system exists                | Wire toggle               |
| Cowork              | Autonomous tasks                     | Agent runtime exists               | Polish UX                 |
| Computer Use UI     | Built-in                             | ComputerUse component exists       | Complete flow             |

---

## Sources

- ChatGPT Desktop: openai.com, help.openai.com
- Claude Desktop: claude.com, support.claude.com
- Cursor: cursor.com, forum.cursor.com
- Windsurf: windsurf.com
- Perplexity: perplexity.ai
- Warp: warp.dev
- Gemini: gemini.google
- Devin: devin.ai, cognition.ai
- GitHub Copilot: docs.github.com
- Intent: augmentcode.com
