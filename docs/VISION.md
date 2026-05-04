# Vision — AGI Workforce

> Lifted from `~/.claude/projects/.../memory/product-vision.md` (originally written 2026-03-21). Preserved here in repo so it's the durable source.

## Core realization

**ONE layout. Chat. Everything inside it.**

The user does not want multiple layouts, pages, or views. They want a single chat interface that can do everything — exactly like Claude.ai, ChatGPT, and Gemini.

> "I don't need multiple layouts. I only need one — the chat interface — which should be able to do everything inside."

## How to apply

- DELETE all 28+ separate views/pages (Terminal, Canvas, Database, Git, Images, Skills, Schedules, etc.)
- The chat IS the app. Every feature is a tool call that renders its result inline in the chat stream.
- The ONLY secondary panel is the artifact preview (right side) for documents/HTML/code — and only when explicitly triggered.
- Sidebar exists ONLY for conversation management (new chat, search, recents, projects).

## What "everything inline" means

| User request        | What happens                                                          |
| ------------------- | --------------------------------------------------------------------- |
| "Generate an image" | Image renders inline in chat stream                                   |
| "Generate a video"  | Progress card inline → video player inline                            |
| "Search the web"    | Search results + citations appear inline                              |
| "Create a document" | Tool calls inline → download card inline → artifact panel for preview |
| "Run this code"     | Code output renders inline                                            |
| "Analyze this data" | Results/charts render inline                                          |
| "Schedule a task"   | Confirmation appears inline                                           |
| "Check git status"  | Status output appears inline                                          |
| "Open terminal"     | Terminal output appears inline                                        |

## What does NOT happen

- No separate Images gallery page
- No separate Terminal page
- No separate Database workspace page
- No separate Canvas/whiteboard page
- No separate Git panel page
- No separate Scheduler page
- No separate Analytics dashboard page
- No "More" popover with 20+ items
- No 28-item sidebar

## The only UI elements

1. **Sidebar** (left): New Chat, Search, Customize, Chats, Projects, Artifacts, Code — 5–7 items max (matching Claude Desktop)
2. **Chat stream** (center): Messages, tool calls, inline results, images, videos, code blocks, tables
3. **Artifact panel** (right, optional): Only opens for document/HTML/code preview when explicitly created
4. **Input bar** (bottom): Text input + attachments + model selector + voice + microphone

## Reference

- Claude Desktop: 5–7 sidebar icons, one chat layout, optional artifact/project panel
- ChatGPT: 7 sidebar items, one chat layout, model selection in composer
- Gemini: 3 sidebar icons, one chat layout
- None of them have separate pages for images, terminal, database, code, etc. Everything is a chat interaction.

UI screenshots from competitors are at `~/Desktop/reference/ui/` (8 sets — `claude ui/`, `chatgpt desktop ui/`, `codex desktop ui/`, `gemini chat ui/`, `perplexity ui/`, etc.). The 30 numbered "claude Desktop ui" screenshots are the design north star for AGI Workforce Desktop.

## Why users should switch

**Tagline:** _Beyond one model. Beyond one surface. AGI in your hands._

**Core pitch:** One app replaces Claude Desktop, ChatGPT, Gemini — with the same features but multi-model, BYOK, local LLM, and cross-device.

**What makes AGI Workforce different (the only 3 that hold up against May 2026 reality):**

1. **Multi-provider in one UI** — 10+ Providers, switch mid-conversation. Anthropic locks to Claude only.
2. **BYOK + Local LLM (Ollama, LMStudio)** — Anthropic doesn't allow user keys.
3. **Cross-provider session continuity** — Claude → GPT → Llama in same thread, no context loss.

**The gap this fills:**
Users today are locked into one provider's app (Claude Desktop = Anthropic only, ChatGPT = OpenAI only). AGI Workforce is provider-agnostic — use the best model for each task, with your own keys, including local models for sensitive work.

## Implementation status (vision drift, 2026-05-03)

The vision says "ONE chat layout" but reality has:

- Desktop: 84 component subdirectories (many are intentional overlays — Settings, Search, Voice, etc. — but many are vestigial views)
- Web: 141-file `UnifiedAgenticChat` monolith
- Mobile: 41 screens (some legitimate per-route, some legacy)

**Wave 2 (Desktop v1.0) target**: shrink to the 5–7 sidebar items + 1 chat + 1 artifact panel pattern. Migrate web's `UnifiedAgenticChat` to `packages/chat`. Triage the 84 desktop dirs (fold real overlays into chat shell, delete vestigial views).
