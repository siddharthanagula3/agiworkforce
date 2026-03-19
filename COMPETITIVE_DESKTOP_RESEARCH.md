# Competitive Desktop Research — Claude Desktop vs AGI Workforce

_Generated: 2026-03-18_

## Feature Matrix

| Feature                       | Claude Desktop                             | AGI Workforce                       | Status      | Priority |
| ----------------------------- | ------------------------------------------ | ----------------------------------- | ----------- | -------- |
| **Core Chat**                 | Multi-model (Claude only)                  | Multi-model (9+ providers)          | ADVANTAGE   | —        |
| **Cowork (Autonomous Agent)** | VM-isolated, file access, scheduling       | Agent runtime, planner, executor    | Partial     | CRITICAL |
| **Claude Code Desktop**       | GUI wrapper, parallel sessions, Git        | N/A (separate CLI)                  | Missing     | HIGH     |
| **File Creation**             | Excel, Word, PowerPoint, PDF               | Document creation commands exist    | Partial     | HIGH     |
| **Inline Visualizations**     | Charts, diagrams inline                    | Artifacts panel (side)              | Partial     | MEDIUM   |
| **MCP Connectors**            | 50+ directory connectors                   | MCP client, custom servers          | Partial     | HIGH     |
| **OAuth Connectors**          | Google Drive, Slack, GitHub, Gmail         | Calendar OAuth, Gmail OAuth         | Partial     | HIGH     |
| **Artifacts**                 | Live React/HTML/SVG/Mermaid preview        | Artifact system exists              | Partial     | HIGH     |
| **Projects**                  | Knowledge base per project, RAG            | Project memory, custom instructions | Partial     | MEDIUM   |
| **Computer Use**              | Screenshots, mouse, keyboard, Zoom Action  | Screen capture, input sim, OPA loop | Implemented | —        |
| **Extended Thinking**         | Toggle in UI, adaptive thinking            | Wired to API (just fixed)           | Implemented | —        |
| **Memory**                    | 3-layer (chat/project/API), auto-summarize | Memory system, decay, categories    | Implemented | —        |
| **Skills/Plugins**            | Marketplace, 1000+ skills                  | 140 skills in .agi/employees/       | Partial     | MEDIUM   |
| **Keyboard Shortcuts**        | Double-tap Option, Caps Lock voice         | Global shortcuts registered         | Partial     | MEDIUM   |
| **Quick Entry**               | System-wide quick text box                 | N/A                                 | Missing     | HIGH     |
| **File Upload**               | 30MB, PDF/DOCX/CSV/HTML                    | File read/write commands            | Partial     | MEDIUM   |
| **Chat Search**               | Built-in search + memory                   | Search commands exist               | Partial     | MEDIUM   |
| **Free Plan Features**        | File creation, connectors, memory          | N/A (local app)                     | N/A         | —        |
| **VM Isolation**              | Apple AVF / Hyper-V sandbox                | None                                | Missing     | LOW      |
| **Office Add-ins**            | Excel + PowerPoint add-ins                 | N/A                                 | Missing     | LOW      |

## AGI Workforce Unique Advantages

| Feature                  | AGI Workforce                                                   | Claude Desktop        |
| ------------------------ | --------------------------------------------------------------- | --------------------- |
| **Multi-LLM**            | 9+ providers (Anthropic, OpenAI, Google, Mistral, Ollama, etc.) | Claude only           |
| **BYOK**                 | Bring your own API keys                                         | Subscription only     |
| **Local Models**         | Ollama integration, local Whisper                               | No local models       |
| **Unlimited MCP**        | Any MCP server, custom configs                                  | 50 directory + custom |
| **Mobile Companion**     | QR pair, live dashboard, approve from phone                     | No mobile app         |
| **Desktop Automation**   | Full screen capture, OCR, input sim, browser                    | Beta computer use     |
| **Terminal Integration** | Built-in terminal with AI suggestions                           | N/A                   |
| **Code Editing**         | Monaco editor, diff viewer, checkpoints                         | Via Claude Code       |
| **Encrypted DB**         | SQLCipher with machine-specific keys                            | Unknown               |
| **Open Architecture**    | Self-hosted, extensible                                         | Closed                |

## Priority Implementation Gaps

### CRITICAL

1. **Cowork-like autonomous execution** — VM isolation or sandboxed execution environment
2. **Quick Entry** — System-wide quick text input (double-tap modifier key)

### HIGH

3. **File creation UI** — Expose document*create*\* commands with drag-and-drop export
4. **Connector directory** — Browse/install MCP connectors from a curated list
5. **Artifact live preview** — Render React/HTML/Mermaid inline (not just code blocks)
6. **OAuth connector flows** — Google Drive, Slack, GitHub one-click setup
7. **Claude Code Desktop parity** — Git-aware code sessions with diff review

### MEDIUM

8. **Plugin marketplace UI** — Browse, install, manage skills from marketplace
9. **Project knowledge base** — RAG over uploaded documents per project
10. **Chat search** — Full-text + semantic search across conversation history
11. **Keyboard shortcut customization** — Settings panel for rebinding
12. **Inline visualizations** — Render charts/diagrams directly in message bubbles
