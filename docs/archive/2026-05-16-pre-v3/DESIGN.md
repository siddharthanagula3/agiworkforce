# Design — AGI Workforce

> UI design source of truth. All design decisions defer to the Claude Desktop reference at `~/Desktop/reference/ui/claude ui/`.

## Design north star

**Anthropic Claude apps.** The user explicitly said: _"I personally love Anthropic Applications (Claude Applications)."_

Reference materials (outside repo, on user's Desktop):

```
~/Desktop/reference/ui/
├── claude ui/                              ← PRIMARY NORTH STAR
│   ├── claude Desktop ui/                  (30 numbered screenshots, descriptive names)
│   ├── claude browser extension ui/        (7 numbered screenshots)
│   ├── claude vs code extension ui/        (9 numbered screenshots)
│   ├── claude connectors/                  (19 screenshots)
│   └── claude chat inline tools, icons, artifact ui/  (20 numbered screenshots)
├── claude code ui/                         (5 screenshots — CLI patterns)
├── chatgpt desktop ui/                     (18 screenshots — secondary reference)
├── codex  desktop ui/                      (21+ screenshots — Anthropic competitor)
├── codex cli ui/                           (15 screenshots — CLI competitor)
├── gemini chat ui/                         (13 screenshots)
├── gemini cli ui/                          (16 screenshots)
└── perplexity ui/                          (~30 screenshots inc. Comet browser)
```

## Core layout (per VISION.md)

```
┌─────┬──────────────────────────────────────────┬─────────────┐
│ 5-7 │                                          │  Optional   │
│icons│         Centered chat surface             │  artifact   │
│  +  │  - Empty state (greeting + suggestions)  │  panel      │
│recen│  - Message stream (inline tools)         │  (only when │
│ ts  │  - Composer (text + attach + model + 🎙) │   triggered)│
│     │                                          │             │
│ 👤  │                                          │             │
└─────┴──────────────────────────────────────────┴─────────────┘
```

## Sidebar (max 7 icons + recents)

Per Claude Desktop screenshot 02 (`02_sidebar-expanded_chat-history.png`):

| Icon  | Item                                                           |
| ----- | -------------------------------------------------------------- |
| ➕    | New chat                                                       |
| 🔍    | Search                                                         |
| ⚙     | Customize (Skills + Connectors live here, post-Mar 2026 reorg) |
| 💬    | Chats (recents)                                                |
| 📁    | Projects                                                       |
| 🎨    | Artifacts                                                      |
| `</>` | Code (Claude Code)                                             |

Plus user avatar at bottom + sidebar collapse toggle at top.

## Empty state (per screenshot 01)

- Centered layout
- Large greeting: "Golden hour thinking" / "Good morning, Siddhartha" (time-of-day variant)
- Composer: rounded large input, "How can I help you today?" placeholder
- Model selector inline: "Sonnet 4.6 Extended" with dropdown
- Mic icon for voice
- 4–5 quick-start chips: Code / Write / Learn / From Drive / From Gmail
- Free plan banner top: "Free plan · Upgrade"

## Three-pane layout (project view, screenshot 05)

When user is inside a Project:

- Left: standard sidebar
- Center: chat with project name in title, input + recent chat list
- Right: project panel — Memory section (with capacity bar), Instructions, Files (with capacity bar)

## Settings page (per screenshots 07–19)

Categorized vertical tabs on the left:

- **General** — appearance, language, model defaults
- **Account** — email, profile, active sessions
- **Privacy** — data controls, opt-outs (Sentry, GTM, etc.)
- **Billing** — current plan, payment method
- **Capabilities** — memory, tool access, technical toggles
- **Connectors** — web integrations (Drive, Gmail, GitHub, Vercel, n8n, Apify, Google Calendar) + desktop tools
- **Claude Code** — auth tokens for Claude Code surface
- **Desktop app** — General / Extensions / Developer (MCP servers)

## Connector detail page (screenshots 23–30)

Per-connector permission UI. Examples:

- Airtable: Browse connectors button, list, permissions dropdown (view/edit per resource)
- Gmail: tool permissions matrix
- GitHub: integration info card
- Vercel: tool permissions
- Control Your Mac: device-level permissions
- Desktop Commander: action permissions
- Excel: blocked permissions explainer
- Filesystem: settings (paths, read/write toggles)

## Inline tool / artifact patterns (per "claude chat inline tools, icons, artifact ui" 20 screenshots)

This is the realization of the "everything inline" vision. Patterns:

- `01` — Chat response with comparison options A/B
- `02` — Inline tool use: filesystem results summary card (collapsible)
- `03` — Inline tool expanded detail: JSON request/response viewer
- `04` — Chat layout with floating "scroll to bottom" button
- `05` — Chat response with thumbnail artifact preview
- `06` — Inline web search results with favicons + citations
- `07` — Inline tool steps: file creation sequence card
- `08` — Stacked tool status messages: compact list
- `09` — Chat context: relevant chats list
- `10` — Inline tool steps: file operations HTML rendering
- `11` — Inline reasoning steps: thinking blocks with clock icons
- `12` — Artifact sidebar: HTML resume preview
- `13` — Artifact viewer toolbar: copy / refresh / close
- `14` — Chat user message: pasted-tag with reasoning steps
- `15` — Inline reasoning flow: multiple thought blocks
- `16` — Artifact editor: HTML code source view
- `17` — Chat response: multiple artifact cards with "download all"
- `18` — Artifact sidebar: markdown preview split view
- `19` — Artifact sidebar: markdown source code view
- `20` — Artifact sidebar: rich text document preview

These patterns map directly to AGI Workforce's existing components in `packages/chat/`:

- ThinkingBlock.tsx → patterns 11, 15
- WebSearchCard.tsx → pattern 06
- CitationPill.tsx → pattern 06
- ArtifactPanel.tsx → patterns 12, 13, 17, 18, 19, 20

## Browser extension (per screenshots 01–07 of `claude browser extension ui/`)

- Sidebar layout with empty state + paid plan banner
- Action permission dropdown: "Ask vs Act" mode
- Attachment menu: screenshot, image options
- Quick mode modal: model options
- Quick mode active banner: "Haiku · Act without asking"
- Model selector in dropdown: Opus / Sonnet / Haiku
- More options menu: task settings, language

## VS Code extension (per screenshots 01–09 of `claude vs code extension ui/`)

- Sidebar webview chat with "new chat" empty state
- Settings editor view (key-value config)
- Settings with usage limit sidebar
- Modes dropdown + effort slider in chat
- Actions and settings menu
- Input "add context" menu
- Main editor full-screen chat empty state
- Chat sessions history dropdown

## Color palette + typography

(To be extracted from screenshots in Wave 2 design phase.)

Currently AGI Workforce uses Tailwind defaults + Radix UI primitives. Wave 2 should extract Claude's:

- Dark theme background colors (charcoal grays, not pure black)
- Accent color (looks orange/amber for Claude — "✨ Golden hour thinking" star icon is orange)
- Typography (serif for headings? sans for body?)
- Border radius (medium, ~8px feel)
- Spacing scale

## Implementation principles

1. **Pixel-close, not exact clone.** Mimic Anthropic's design system but maintain own brand.
2. **Mode-agnostic components.** `packages/chat` components shouldn't know whether they're in Local or Cloud mode — that's the store layer's job.
3. **Inline tool results are first-class.** Every Tauri command result, every API response, must have a chat-inline rendering. Side panels are last resort.
4. **Composer is sacred.** Match Claude's composer layout exactly: large rounded input, model selector inline, mic icon, attach menu.
5. **5–7 sidebar items max.** If you're tempted to add an 8th, that's a feature inside an existing item.

## What we will NOT build (per VISION.md drift triage)

- Separate Images page (use chat artifact pattern)
- Separate Terminal page (use inline terminal tool result)
- Separate Database page (use inline database tool result)
- Separate Canvas page (use artifact panel)
- Separate Git panel (use slash commands + inline tool results)
- Separate Calendar page (use inline calendar tool result via connector)
- Separate Outcomes/Analytics dashboard (use Settings → Analytics tab)
- "More" popover with 20+ items
