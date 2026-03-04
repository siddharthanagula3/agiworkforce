# Composer/Input Area Redesign

## Context

The current composer toolbar has 6 always-visible icons (Folder, Attach, Screenshot, Research, Agent, Voice) plus a model selector, character counter, and send button. This is more cluttered than any competitor (Claude, ChatGPT, Gemini, Perplexity all consolidated into + menu or Tools pill).

## User Choices

- **+ menu style**: Claude style (3 sections: files, connectors, skills)
- **Toolbar**: Minimal — [+] on left, [Model ▾] [🎤] [↑] on right
- **Model selector**: In toolbar row (right side)
- **Features in composer**: Essentials (files, connectors, skills, web search toggle)
- **Mode indicators**: Colored tag pills when active
- **Focus modes**: Keep above input (Web, Academic, Code, Writing, Research, All)
- **Placeholder**: "Ask anything..."
- **Drag-drop**: Full support for images, screenshots, files

## Competitor Analysis Summary

| Element         | ChatGPT               | Claude                     | Gemini         | Perplexity               | AGI (current)   | AGI (new)         |
| --------------- | --------------------- | -------------------------- | -------------- | ------------------------ | --------------- | ----------------- |
| + button        | Files + apps          | Files, connectors, plugins | Files + camera | Files, cloud, connectors | 📎 icon only    | Claude-style menu |
| Tools/modes     | Separate "Tools" pill | In + menu                  | "Tools" pill   | In + menu                | 6 inline icons  | Active mode tags  |
| Model selector  | Chat header           | Next to send               | Top-right      | In toolbar               | In toolbar      | In toolbar (keep) |
| Voice           | Mic icon              | Mic icon                   | Mic icon       | Mic + visualizer         | Mic icon        | Mic icon (keep)   |
| Toolbar clutter | Low (2 items)         | Very low (3 items)         | Low (3 items)  | Low (4 items)            | High (8+ items) | Low (4 items)     |

## Design

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  [Web] [Academic] [Code] [Writing] [Research] [All] │  Focus mode pills
├─────────────────────────────────────────────────────┤
│  [attached-file.png ×] [screenshot.jpg ×]           │  Attachment pills (when present)
│                                                     │
│  Ask anything...                                    │  Textarea (expandable, drag-drop zone)
│                                                     │
│  [🌐 Web Search] [⚡ Agent]                          │  Active mode tags (when toggled on)
│                                                     │
│  [+]                    [Sonnet 4.6 ▾] [🎤] [↑]    │  Toolbar row
└─────────────────────────────────────────────────────┘
```

### + Menu (Claude-style, 3 sections)

```
┌──────────────────────────┐
│ 📎 Add files or photos   │  Native file picker (images, PDFs, code, docs)
│ 📷 Paste screenshot      │  Grabs from clipboard / opens screen capture
│ ─────────────────────── │
│ 🔗 Connectors         >  │  Submenu: Gmail, Drive, Notion, Slack, GitHub...
│ 🧠 Skills             >  │  Submenu: 140 AI employees grouped by category
│ ─────────────────────── │
│ 🌐 Web search       ✓   │  Toggle on/off (checkmark when active)
└──────────────────────────┘
```

### Toolbar Row (4 items only)

| Position | Element      | Behavior                                                                                            |
| -------- | ------------ | --------------------------------------------------------------------------------------------------- |
| Left     | `[+]` button | Opens + menu popover above                                                                          |
| Right    | `[Model ▾]`  | Opens QuickModelSelector popover. Shows "Sonnet 4.6" or "Sonnet 4.6 Extended" when thinking enabled |
| Right    | `[🎤]` mic   | Voice input button (existing behavior — red pulse recording, amber transcribing)                    |
| Right    | `[↑]` send   | Send button (existing behavior — arrow, stop, queue states)                                         |

### Active Mode Tags

Colored dismissible pills between textarea and toolbar:

- **🌐 Web Search** (teal bg) — toggled via + menu or focus mode
- **⚡ Agent** (amber bg) — toggled via sidebar agent button
- **🔬 Deep Research** (blue bg) — toggled via sidebar or focus mode

Each tag has an `×` button. Clicking the tag itself toggles it off.

Tags only appear when the mode is active. When no modes are active, this row is hidden (no empty space).

### Drag & Drop

- Drag any file onto textarea → blue drop overlay appears: "Drop to attach"
- Paste from clipboard (Cmd+V with image data) → auto-attaches as screenshot
- Screenshots from OS (Cmd+Shift+4 on macOS) paste directly
- Attached items appear as removable pills above the textarea
- Supported types: images (png, jpg, gif, webp), PDFs, code files, text, CSV, JSON

### What Gets Removed from Toolbar

| Current Icon         | Disposition                                              |
| -------------------- | -------------------------------------------------------- |
| Folder selector (📁) | Remove — project context set via sidebar or settings     |
| Attachments (📎)     | Replaced by + menu "Add files or photos"                 |
| Screenshot (🖥️)      | Replaced by + menu "Paste screenshot" + native drag-drop |
| Research (🌐)        | Moved to sidebar button + focus mode + active tag        |
| Agent mode (⚡)      | Moved to sidebar button + active tag                     |
| Character counter    | Remove from toolbar — show only when >80% of limit       |

### What Stays

- Voice input (🎤) — stays in toolbar
- Model selector — stays in toolbar (right side)
- Send/Stop button — stays in toolbar (rightmost)
- Focus mode pills — stay above input
- Slash commands (/) — stay as inline autocomplete
- @mention skills — stays as inline autocomplete + available in + menu
- Inline suggestions — stay as ghost text

### Keyboard Shortcuts (unchanged)

- Enter → Send
- Shift+Enter → New line
- / → Slash command menu
- @ → Skill picker
- Tab → Accept inline suggestion
- Escape → Dismiss menus
- Cmd+V → Paste text or image

## Files to Modify

1. **`ChatInputArea.tsx`** — Main restructure: remove 6-icon toolbar, add + menu, add active tags, drag-drop overlay
2. **`InputToolbar.tsx`** — Gut and simplify to just [+] button
3. **`ChatInputToolbar.tsx`** — Remove or merge (model selector moves to main toolbar)
4. **`FocusModeButtons.tsx`** — Keep as-is (no changes)
5. **New: `PlusMenu.tsx`** — + button popover with 3 sections
6. **New: `ActiveModeTags.tsx`** — Dismissible colored mode indicators

## Files NOT Touched

- `ModelSelectorButton.tsx` — Keep as-is
- `QuickModelSelector.tsx` — Keep as-is
- `SendButton.tsx` — Keep as-is
- `VoiceInputButton.tsx` — Keep as-is
- `FocusModeButtons.tsx` — Keep as-is
- `SlashCommandMenu.tsx` — Keep as-is

---

## Part 2: Intelligent Auto-Tool Detection

### Context

The model should automatically detect user intent and pick the right tools without manual toggling. Example: "generate a sunset image" → auto-selects image generation tool. "What's the latest news on AI?" → auto-enables web search. "Create a Python script that..." → auto-routes to code tools.

### Existing Infrastructure (already built)

We have **3 intent detection systems** already:

1. **Rust `core/intent/`** — `IntentDetector` with 17 categories, pattern matching + LLM fallback, `ToolRouter` that maps intent → tool list + MCP servers
2. **Rust `chat/mod.rs`** — `detect_user_intent()` / `detect_agentic_intent()` — simple action-vs-conversation classifier for agent mode auto-detection
3. **TypeScript `intentClassifier.ts`** — 12-type classifier (chat, coding, reasoning, agentic, multimodal, image-gen, video-gen, search, deep-research, tts, stt, music) with keyword scoring + LLM fallback for Pro+

### What's Missing

The gap is **not detection** (that works) — it's **surfacing the detection results in the UI** and **auto-activating modes visually**:

1. The TS intent classifier runs but its result is only passed as `task_metadata` to Rust — never shown to the user
2. The Rust system prompt (Section 3: Tool Selection) already tells the model which tools to use for which intents — the model **already auto-selects tools** when `tool_choice: Auto`
3. But the user doesn't see that web search, agent mode, or image gen was activated — no visual feedback

### Design: Auto-Intent Tags

When the user types in the composer (debounced, 500ms after last keystroke), run `classifyIntentLocally()` on the current text. If confidence > 0.7 for a non-chat intent, auto-show the corresponding Active Mode Tag with an "auto" indicator:

```
┌─────────────────────────────────────────────┐
│  Generate a beautiful sunset over the ocean │
│                                             │
│  [🎨 Image Gen ✨] [auto-detected]          │  ← auto-shown tag
│                                             │
│  [+]              [Sonnet 4.6 ▾] [🎤] [↑]  │
└─────────────────────────────────────────────┘
```

### Intent → Tag Mapping

| Intent Type     | Tag           | Color  | Icon | Behavior                                             |
| --------------- | ------------- | ------ | ---- | ---------------------------------------------------- |
| `search`        | Web Search    | teal   | 🌐   | Auto-enables when query looks like a search          |
| `deep-research` | Deep Research | blue   | 🔬   | Auto-enables for complex research questions          |
| `image-gen`     | Image Gen     | purple | 🎨   | Auto-tags when "generate/create/draw image" detected |
| `video-gen`     | Video Gen     | pink   | 🎬   | Auto-tags for video generation requests              |
| `coding`        | Code          | green  | 💻   | Auto-tags for code/programming requests              |
| `agentic`       | Agent         | amber  | ⚡   | Auto-enables for multi-step action requests          |
| `reasoning`     | Thinking      | indigo | 🧠   | Auto-suggests thinking mode if not already on        |
| `music`         | Music Gen     | rose   | 🎵   | Auto-tags for music generation                       |

### Behavior Rules

1. **Auto-detected tags show with a sparkle (✨)** to distinguish from manually toggled tags
2. **User can dismiss** auto-tags by clicking × — respects user override
3. **Manual toggle always wins** — if user explicitly turned off web search, don't auto-re-enable it
4. **Only show when confidence > 0.7** — avoid false positives
5. **Debounced** — runs 500ms after last keystroke, not on every character
6. **No extra API call** — uses local keyword classifier only (fast, no cost)
7. **Tags persist until send** — once auto-detected, tag stays unless dismissed
8. **Tags affect the request** — auto-detected `search` tag enables web search tools; `image-gen` tag ensures image generation tool is included

### Implementation

The TS `intentClassifier.ts` already has `classifyIntentLocally()` which does keyword scoring. We just need to:

1. Call it from `ChatInputArea.tsx` on debounced content changes
2. Map the result to Active Mode Tags
3. Pass the auto-detected intents as part of `SendOptions` so the backend knows what was auto-activated
4. The backend already handles tool selection via `tool_choice: Auto` and the system prompt

### Files to Modify (Part 2)

1. **`ChatInputArea.tsx`** — Add debounced intent detection on content change, wire to ActiveModeTags
2. **New: `ActiveModeTags.tsx`** — Already in Part 1; extend to support auto-detected tags with sparkle indicator
3. **`intentClassifier.ts`** — May need minor additions to expose intent-to-tag mapping
4. **`SendOptions` type** — Add `autoDetectedIntents?: IntentType[]` field

### Files NOT Touched (Part 2)

- Rust backend — already handles tool selection automatically via system prompt + tool_choice: Auto
- `core/intent/` — already works, not needed for the UI-side auto-tagging
- Model routing — already works based on intent metadata passed from TS
