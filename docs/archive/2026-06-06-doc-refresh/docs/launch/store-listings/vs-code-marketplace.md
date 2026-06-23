# VS Code Marketplace listing — AGI Workforce

## Display name

`AGI Workforce`

## Short description (200 chars)

`Multi-model AI coding assistant — GPT, Claude, Gemini, and 10+ LLM providers in VS Code. Switch providers mid-conversation. BYOK or local Ollama.`

## Categories

- AI
- Chat
- Machine Learning
- Programming Languages
- Other

## Tags

ai, llm, chat, copilot, assistant, coding, agent, gpt, claude, gemini, ollama, byok, multi-provider

## README outline (the marketplace listing IS the README)

The marketplace renders `apps/extension-vscode/README.md` as the listing page. It should follow this outline:

```markdown
# AGI Workforce — Multi-model AI in VS Code

Switch between **Claude, GPT, Gemini**, and 10+ LLM providers mid-conversation,
in the same chat thread, without leaving your editor.

![Hero screenshot](images/hero.png)

## Why this exists

Most AI coding assistants lock you to one provider's models. Copilot is GPT.
Claude Code is Claude. We've built the cross-vendor plumbing — payload
normalization, schema cleanup, reasoning-effort routing — so **any model is
one keystroke away**.

- Claude for nuanced code review
- GPT for tool calls + agent loops
- Gemini for vision + huge contexts
- Llama (Ollama) for fully-offline, fully-private

## Features

- **`@agi` chat participant** — invoke the multi-provider chat from the VS Code chat panel (`@agi explain this function`)
- **Provider switcher** — `cmd+shift+p` → "AGI Workforce: Pick model"
- **BYOK** — settings → "AGI Workforce: API Keys"
- **Inline completions** — opt-in via setting `agi.inlineCompletions: true`
- **Codebase awareness** — workspace context attached automatically
- **Tool use** — file search, code execution, git operations (with permission prompts)

## Setup

1. Install the extension
2. Open the AGI Workforce settings (`cmd+,`, search "AGI Workforce")
3. Either:
   - Paste your API keys (Anthropic / OpenAI / Google) — stored in VS Code's
     SecretStorage, never logged
   - OR sign in to AGI Workforce ($5/mo Hobby tier — managed cloud)
   - OR point at a local Ollama daemon (free, fully-offline)

That's it. `@agi` works immediately.

## Models supported

GPT-5.4 family · Claude 4.6 family · Gemini 3.1 family · Grok 4 · DeepSeek
v3 · Mistral · Qwen 3 · Kimi K2 · Llama 3.3 · plus 10+ via OpenRouter
and a managed cloud option.

## Privacy

- **No telemetry by default.** Opt in via setting `agi.telemetry: true` if
  you want to send anonymized usage data to help improve provider routing.
- BYOK keys live in VS Code SecretStorage. They never leave your machine
  except when sent directly to the provider you picked.
- No training on your code. Ever.

## Commands

| Command                          | Default keybinding                          |
| -------------------------------- | ------------------------------------------- |
| AGI Workforce: New Chat          | `cmd+l`                                     |
| AGI Workforce: Pick Model        | `cmd+shift+p` → "AGI Workforce: Pick Model" |
| AGI Workforce: Explain Selection | (no default; bind it yourself)              |
| AGI Workforce: Edit with AGI     | (no default; bind it yourself)              |

## Pricing

- Local-only (Ollama) — Free forever
- BYOK — Free forever
- Hobby — $5/mo (managed cloud, limited credits)
- Pro / Max — Coming after security audit
- Enterprise — Contact sales

## Links

- Website: https://agiworkforce.com
- Desktop app: https://agiworkforce.com/download
- Docs: https://agiworkforce.com/docs
- Source / issues: https://github.com/siddharthanagula3/agiworkforce
- Privacy: https://agiworkforce.com/privacy
- Support: support@agiworkforce.com

## Changelog

See `CHANGELOG.md`.
```

## Icon (128 × 128 PNG)

Use `apps/extension-vscode/icon.png` (verify it exists). The icon is shown in the marketplace search results AND on the listing page header.

## Gallery banner (already set in `package.json`)

```json
"galleryBanner": {
  "color": "#0f0f0f",
  "theme": "dark"
}
```

The dark theme works well with VS Code's marketplace UI; no change needed.

## Q&A (`qna: "marketplace"`)

VS Code Marketplace will host a Q&A tab on the listing. Monitor it weekly during the first month after launch.

## Pricing field (`pricing: "Free"`)

The extension is free. Hobby/Pro tiers are subscriptions to the gateway, not the extension itself, so the marketplace pricing remains Free.

## Preview flag (`preview: true`)

Currently set. Flip to `false` once we're confident enough to drop the "Preview" badge — usually after 2-4 weeks of marketplace feedback.

## Publisher

`agiworkforce` — make sure this exists at https://marketplace.visualstudio.com/manage/publishers/agiworkforce

If it doesn't exist:

1. Sign in to https://marketplace.visualstudio.com/manage with a Microsoft account
2. Create a new publisher named `agiworkforce`
3. Generate a Personal Access Token in https://dev.azure.com/<your-org>/\_usersSettings/tokens
   - Scopes: Marketplace → Manage
4. Save PAT for `vsce login agiworkforce`

## Publish workflow

```bash
cd apps/extension-vscode
pnpm install
pnpm run vscode:prepublish
pnpm exec vsce package    # produces agi-workforce-0.3.0.vsix
pnpm exec vsce login agiworkforce   # one-time, stores PAT
pnpm exec vsce publish    # uploads + marks live
```

VS Code Marketplace doesn't review extensions; the listing goes live within ~5 minutes of upload.
