# r/LocalLLaMA draft

> Submit at: <https://www.reddit.com/r/LocalLLaMA/submit>
> Tag: "Resources" or "Discussion"

---

## Title

```
[Tool] AGI Workforce CLI — terminal AI agent with first-class Ollama / LM Studio support, 10+ Providers, BYOK
```

## Body

````
Hey r/LocalLLaMA — just shipped v1.0 of a CLI I've been building specifically because I wanted local models (Ollama, LM Studio) to be a first-class option in an agentic CLI, not an afterthought.

**Why this exists**

Every other terminal AI tool I tried (Claude Code, OpenAI Codex CLI, Gemini CLI) locks you to one provider. The "open" alternatives (LiteLLM, etc.) are libraries, not desktop-class CLIs with TUIs and sandboxes. None treat local models as equal to cloud.

**What you get**

```bash
# Local-only, no cloud at all
agiworkforce -m llama3.1:8b exec "summarize this README"

# Cloud-first with local fallback (rotates on rate-limit)
agiworkforce -m "claude-opus-4-6,gpt-5.4,llama3.1:8b" exec "..."

# LM Studio works the same
agiworkforce -m lmstudio:llama-3.3-70b exec "..."

# Interactive Ratatui TUI
agiworkforce
````

**Local-first features**

- Ollama + LM Studio + OllamaCloud as native providers (not OpenAI-shim)
- Streaming SSE works correctly with Ollama (idle timeout tuned for slow local generations)
- Model auto-discovery (`agiworkforce --list-models` enumerates everything available locally + cloud)
- Sandbox runs your tool calls under Bubblewrap/Landlock on Linux, Seatbelt on macOS, Restricted Token on Windows — so tool outputs from sketchy local models can't `rm -rf ~`
- Cost tracking shows `$0.00` for local models — you can see exactly what your local setup saves you

**The other cloud providers** if you want them (10+ in total): Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Groq, Together, Fireworks, Perplexity, Azure, Bedrock, Cohere, AI21, SambaNova, OpenRouter, plus subscription paths for GitHub Copilot and ChatGPT Plus.

**Install**

```bash
# Pick one:
npm install -g @agiworkforce/cli
brew install siddharthanagula3/tap/agiworkforce
curl -fsSL https://agiworkforce.com/install.sh | bash
cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli
```

**Open source?**

Source is in the public repo (Rust, 195 files, 155,029 LOC, 914 tests). The license is proprietary — local + BYOK use is unrestricted via the binary releases. The repo is published for transparency.

**Repo:** https://github.com/siddharthanagula3/agiworkforce
**Architecture:** https://github.com/siddharthanagula3/agiworkforce/blob/main/apps/cli/ARCHITECTURE.md

Happy to answer questions or take feedback on what local-LLM features you'd want next. Currently planning: vLLM/TGI/TabbyAPI as native providers, MLX support for Apple Silicon, and tool-use shimming for models that don't natively support function calling.

```

## Why this works on r/LocalLLaMA

1. **Lead with local-first**, not "AI for the terminal"
2. **Concrete commands** with Ollama / LM Studio first
3. **Acknowledge the 22 cloud providers** but don't lead with them
4. **Sandbox detail** matters to LocalLLaMA users (model trust)
5. **Cost-tracking $0.00** highlights the privacy win
6. **Honest about license** — community sniffs out fakes
7. **Concrete future-features** invites discussion

## Avoid

- "Beats ChatGPT/Claude" framing (community is allergic to hype)
- "10x faster" benchmarks without methodology
- Asking for stars/upvotes (downvoted instantly)

## Followups

If asked **"why not just use OpenWebUI?"**:
> OpenWebUI is a self-hosted web UI — different category. AGI Workforce is a CLI/TUI for terminal-first workflows: agentic tool use, sandbox, slash commands, can be embedded in CI as a binary. Both can coexist (some folks use OpenWebUI for casual chat + AGI Workforce for coding tasks).

If asked **"vLLM / TGI / TabbyAPI support?"**:
> These are on the v1.1 roadmap. The provider abstraction in `apps/cli/src/models.rs` is straightforward — adding a new provider is ~200 lines. Happy to take PRs (with the license caveat noted above).

If asked **"MLX?"**:
> Apple Silicon MLX support via local server is on roadmap. Currently you can use it through LM Studio (which speaks OpenAI-compatible) — `agiworkforce -m lmstudio:<model>` works today.

If asked **"context size with local models?"**:
> Whatever the local model supports. The CLI streams the full context to the local server; we don't truncate unless the model itself returns a context-overflow error (in which case the compaction layer kicks in — see apps/cli/src/compaction.rs for the 6-phase truncation pipeline).
```
