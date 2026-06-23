# Chrome Web Store listing — AGI Workforce browser automation

## Item name (45 chars)

`AGI Workforce — multi-model browser AI`

## Short description (132 chars)

`Browser automation + chat across Claude, GPT, Gemini, and 10+ LLMs. Pair with the AGI Workforce desktop app or hit the cloud.`

## Detailed description (16,384 chars max)

```
AGI Workforce browser extension — multi-model AI in your browser.

WHAT IT DOES

• Browser-side chat with Claude, GPT, Gemini, and 10+ LLM providers
• Bidirectional bridge to the AGI Workforce desktop app (when running) — talk to the same agent from your browser as your menu bar
• Falls back to the cloud gateway when the desktop bridge isn't running
• LinkedIn / Lever job autofill (existing v1.2.0 feature)
• Side panel chat — never lose your place in the page

KEY FEATURES

• 10+ providers reachable from a single popup: Anthropic Claude, OpenAI GPT, Google Gemini, xAI Grok, DeepSeek, Mistral, Qwen, Moonshot Kimi, Perplexity, Ollama (via desktop bridge)
• Bring your own keys — paste them into the extension, stored only in chrome.storage.local
• Provider switching mid-conversation — same chat, any model
• Tool use — let the agent click, type, and summarize on the active tab (with explicit permission)

PRIVACY

• Host permissions limited to localhost (for the desktop bridge) and explicit allowlists you grant per-site
• BYOK keys live in chrome.storage.local, never leave your browser unless you call the provider directly
• No analytics. No tracking pixels. No selling data.
• Open contribution guidelines + visible source on the publisher dashboard

WHO IT'S FOR

• Developers who want one chat surface across Claude / GPT / Gemini in any tab
• People paired with the AGI Workforce desktop app who want a browser-side companion
• Job seekers using the LinkedIn / Lever autofill (existing feature)

PRICING

The extension itself is free. Optional Hobby tier ($5/mo) for managed cloud routing if you don't want to bring your own keys.

LINKS

• Website: https://agiworkforce.com
• Desktop app: https://agiworkforce.com/download
• Docs: https://agiworkforce.com/docs
• Privacy: https://agiworkforce.com/privacy
• Support: support@agiworkforce.com
```

## Category

Primary: **Productivity**
Tags: AI, Chat, Assistant, Browser Automation, Developer Tools

## Language

English (default; add localizations later).

## Promotional images (Chrome Web Store specific)

| Image              | Dimensions | Required?                      |
| ------------------ | ---------- | ------------------------------ |
| Small promo tile   | 440 × 280  | Yes for featured               |
| Large promo tile   | 920 × 680  | Optional                       |
| Marquee promo tile | 1400 × 560 | Optional but boosts visibility |

Recommend the small + large at minimum.

## Screenshots (1280 × 800, up to 5)

1. **Hero**: side-panel chat with the provider picker visible. Caption: "One panel. Every model."
2. **Provider switch**: same chat thread alternating Claude / GPT / Gemini badges. Caption: "Mid-conversation switching."
3. **BYOK**: settings page showing API key entry. Caption: "Bring your own keys."
4. **Desktop bridge**: connection status indicator. Caption: "Pairs with the desktop app."
5. **Tool use**: agent clicking + summarizing a page. Caption: "More than chat."

## Privacy policy URL

`https://agiworkforce.com/privacy`

## Single purpose justification (Chrome Web Store asks for this for MV3)

```
This extension provides a single coherent feature: a multi-provider AI chat
panel in the browser, with optional bridge to the AGI Workforce desktop
app. All host permissions, storage, and tab access are in service of that
single feature.
```

## Permissions justification (per-permission)

| Permission                      | Justification                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `activeTab`                     | To run summarize / fill / extract on the user's current tab when they invoke an agent action |
| `tabs`                          | To switch back to the chat tab from the popup; needed for cross-tab conversation continuity  |
| `storage`                       | To persist user's BYOK keys (encrypted), conversation history, and settings                  |
| `nativeMessaging`               | To pair with the AGI Workforce desktop app via native message host                           |
| `alarms`                        | Heartbeat to keep the desktop bridge connection alive                                        |
| `contextMenus`                  | "Ask AGI Workforce" right-click action on selected text                                      |
| `sidePanel`                     | Render the chat surface in Chrome 114+ side panel                                            |
| `scripting`                     | Inject autofill scripts (LinkedIn / Lever) when user explicitly opts in                      |
| `cookies`                       | Required by the LinkedIn autofill flow to identify session                                   |
| `notifications`                 | Notify when a long-running agent action completes                                            |
| `tabGroups`                     | Group tabs the agent opens during a multi-step task                                          |
| `host_permissions: localhost/*` | Talk to the AGI Workforce desktop bridge (default port 8787, user-configurable)              |
