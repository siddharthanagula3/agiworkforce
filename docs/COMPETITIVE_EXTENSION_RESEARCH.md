# Competitive Extension Research: AGI Workforce vs Claude in Chrome

_Generated: 2026-03-18_

## Feature Matrix

| Feature                   | Claude in Chrome                         | AGI Workforce                                | Gap                             |
| ------------------------- | ---------------------------------------- | -------------------------------------------- | ------------------------------- |
| **Side panel chat**       | Streaming chat with model selection      | Streaming chat with DOMPurify                | PARITY                          |
| **Page summarization**    | "summarize this page" command            | Page context capture (manual)                | **GAP: One-click summarize**    |
| **Text selection → AI**   | Right-click selected text → ask          | Context menu exists, doesn't pipe to chat    | **GAP: Selection → side panel** |
| **Form filling**          | Natural language form fill (all types)   | Job-specific autofill (LinkedIn, Lever)      | PARITY (different scope)        |
| **Screenshot + analyze**  | Screenshot → visual analysis             | Screenshot capture → desktop                 | PARITY                          |
| **Page reading**          | Accessibility tree (22 tools)            | DOM snapshot + a11y tree + metadata          | **ADVANTAGE**                   |
| **WebMCP discovery**      | Not supported                            | Imperative + declarative tool discovery      | **ADVANTAGE**                   |
| **NLWeb detection**       | Not supported                            | Full detection (well-known, probes, JSON-LD) | **ADVANTAGE**                   |
| **llms.txt parsing**      | Not supported                            | Full parse + section extraction              | **ADVANTAGE**                   |
| **Native desktop bridge** | Claude Desktop/Code via native messaging | AGI Workforce desktop via native messaging   | PARITY                          |
| **Tab management**        | Tab groups with context                  | Create/close/switch tabs                     | PARITY                          |
| **Cookie management**     | Not exposed                              | Full CRUD (get/set/clear)                    | **ADVANTAGE**                   |
| **Recording mode**        | Workflow recording + playback            | Recording mode (capture actions)             | PARITY                          |
| **Slash commands**        | / shortcuts for reusable prompts         | Not implemented                              | **GAP: Slash commands**         |
| **Model selection**       | Haiku/Sonnet/Opus in panel               | Not in UI                                    | **GAP: Model picker**           |
| **Keyboard shortcuts**    | No built-in (community extensions)       | Cmd+Shift+A (popup), Cmd+Shift+C (capture)   | **ADVANTAGE**                   |
| **Scheduled tasks**       | Daily/weekly/monthly automation          | Not implemented                              | GAP (low priority)              |
| **GIF recording**         | Record actions as animated GIF           | Not implemented                              | GAP (low priority)              |
| **Console/network**       | Read console logs + network requests     | Not implemented                              | GAP (low priority)              |
| **Multi-model support**   | Anthropic models only                    | Any LLM via desktop bridge                   | **ADVANTAGE**                   |
| **Permissions system**    | Ask before acting / autonomous           | Not implemented                              | GAP (medium priority)           |
| **Context menu options**  | Not detailed                             | 4 menu items (capture, info, ask, WebMCP)    | **GAP: More options**           |
| **Page metadata**         | Basic page reading                       | Rich metadata (JSON-LD, OG, Twitter, Schema) | **ADVANTAGE**                   |
| **Auth flow**             | OAuth PKCE                               | API key in session storage                   | Different approach              |
| **Pricing**               | $20/mo minimum (Pro plan)                | Free with own API key                        | **ADVANTAGE**                   |

## Critical Gaps (Implement Now)

1. **Selection → Side Panel Chat**: When user right-clicks "Ask AGI Workforce" on selected text, open side panel and pre-fill the chat with the selected text as context
2. **One-Click Page Summarize**: Button in side panel header to summarize current page
3. **Slash Commands**: /summarize, /explain, /translate, /extract in side panel chat
4. **Model Selector**: Dropdown in side panel settings for model choice
5. **Expanded Context Menu**: Add "Summarize Page", "Explain Selection", "Translate Selection"

## AGI Workforce Competitive Advantages

1. **Multi-LLM**: Works with ANY provider (OpenAI, Anthropic, Google, Mistral, Ollama) via desktop bridge
2. **WebMCP**: First extension with W3C Model Context Protocol support
3. **NLWeb + llms.txt**: Discovers AI-ready endpoints on websites automatically
4. **Desktop Integration**: Full native app bridge for agent capabilities beyond browser
5. **Free Tier**: Works with your own API key — no $20/mo subscription required
6. **Rich Metadata**: JSON-LD, Open Graph, Schema.org extraction for superior page understanding
7. **Job Autofill**: Platform-specific autofill for LinkedIn and Lever (specialized, not generic)
8. **Cookie Management**: Programmatic cookie CRUD that Claude doesn't expose
9. **Keyboard Shortcuts**: Built-in shortcuts (Claude relies on community extensions)
