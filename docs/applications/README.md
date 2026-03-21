# Applications Specification Set

This folder contains the product and technical specification for the six AGI Workforce application surfaces:

1. `apps/cli`
2. `apps/desktop`
3. `apps/extension`
4. `apps/extension-vscode`
5. `apps/mobile`
6. `apps/web`

These are not lightweight summaries. Each document is intended to define how that surface should work across product, UX, frontend, backend, LM orchestration, APIs, tools, state, and operational quality.

## Claude benchmark references

The specs in this folder should be informed by how Anthropic structures Claude across web, mobile, desktop, browser, and terminal surfaces.

Primary official references:

- Claude Code quickstart: `https://code.claude.com/docs/en/quickstart`
- Claude apps release notes: `https://support.claude.com/en/articles/12138966-release-notes`
- Installing Claude Desktop: `https://support.claude.com/en/articles/10065433-installing-claude-desktop`
- Claude Android app: `https://claude.com/blog/android-app`
- Claude file creation: `https://claude.com/blog/create-files`
- Anthropic agent capabilities API: `https://claude.com/blog/agent-capabilities-api`
- Computer use tool: `https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool`
- Desktop vs web connectors: `https://support.anthropic.com/it/articles/11725091`

Additional official OpenAI references:

- ChatGPT on desktop: `https://chatgpt.com/features/desktop`
- Download ChatGPT: `https://chatgpt.com/download`
- Apps in ChatGPT: `https://help.openai.com/en/articles/11487775-connectors-in-chatgpt`
- ChatGPT apps with sync: `https://help.openai.com/en/articles/10847137-chatgpt-synced-connectors`
- Tasks in ChatGPT: `https://help.openai.com/en/articles/10291617`
- Projects in ChatGPT: `https://help.openai.com/ru-ru/articles/10169521-projects-in-chatgpt`
- Introducing the Codex app: `https://openai.com/index/introducing-the-codex-app/`
- Codex is now generally available: `https://openai.com/index/codex-now-generally-available/`

## What each document must cover

Every application document should answer all of the following:

- What the application is for
- Who it serves
- Which features it owns
- How the feature set should work end to end
- How the UI should look
- How the layout should be structured
- Which UI components should exist
- How the frontend should be organized
- How the backend/runtime should be organized
- How language models should be selected, routed, and streamed
- How APIs should be shaped and secured
- How tools should be exposed, approved, and executed
- How state, persistence, sync, security, reliability, and release quality should work

## Shared product model

AGI Workforce is one product expressed through six surfaces with different responsibilities.

| Surface           | Primary role                    | What it must optimize for                                 |
| ----------------- | ------------------------------- | --------------------------------------------------------- |
| CLI               | Terminal-native agent runtime   | Speed, scriptability, safety, coding workflows            |
| Desktop           | Flagship local runtime          | Full capability, local execution, approvals, connectors   |
| Browser Extension | Browser bridge                  | Page context, browser-side execution, desktop integration |
| VS Code Extension | IDE-native coding assistant     | Editor UX, diff workflows, code context, developer speed  |
| Mobile            | Companion surface               | Chat, voice, approvals, monitoring, notifications         |
| Web               | Public and hosted control plane | Acquisition, account, billing, dashboard, APIs            |

## Cross-surface rules

### 1. Desktop is the local execution authority

Any workflow that requires local trust, local files, local terminal, local models, native automation, or privileged connectors should anchor in desktop.

### 2. Web is the public and hosted authority

Acquisition, authentication, billing, downloads, dashboards, hosted APIs, share flows, docs, and public discovery should anchor in web.

### 3. Mobile is the companion

Mobile should optimize for responsiveness, approvals, notifications, voice, and lightweight control. It should not try to replicate the full desktop runtime.

### 4. The browser extension extends desktop into the browser

The browser extension should not become an isolated product line. It should capture browser context and execute browser-local actions on behalf of the broader AGI Workforce runtime.

### 5. CLI and VS Code are first-class developer surfaces

They should share core product concepts with desktop, but they must remain native to their own environments rather than imitating desktop UI.

## Common specification template

Each application spec is organized around these sections:

1. Mission
2. Users and jobs-to-be-done
3. Scope and feature ownership
4. Feature set
5. End-to-end flows
6. UI, look, and layout
7. UI components
8. Frontend architecture
9. Backend/runtime architecture
10. LM architecture
11. API architecture
12. Tool architecture
13. Data, state, and sync
14. Security and privacy
15. Performance and reliability
16. Observability, testing, and release gates
17. Definition of done
18. Canonical implementation anchors
19. Inventory sections for screens/components/APIs/tools
20. Phased roadmap
21. Gap analysis
22. Acceptance criteria
23. Implementation checklist

## Intended use

These documents should be used for:

- product planning
- UX alignment
- frontend and backend implementation planning
- cross-surface boundary decisions
- release reviews
- refactor prioritization

They should not be treated as generic marketing copy. They are operating documents for building and evaluating the six AGI Workforce applications.

## Documents

- `docs/applications/cli.md`
- `docs/applications/desktop.md`
- `docs/applications/browser-extension.md`
- `docs/applications/vscode-extension.md`
- `docs/applications/mobile.md`
- `docs/applications/web.md`
- `docs/applications/cross-surface-appendix.md`
