# Competitive Research: Windsurf, Devin, GitHub Copilot, Aider (February 2026)

> Factual research based on official sources and verified 2026 information.

---

## 1. Windsurf (by Codeium)

### Overview
Windsurf is Codeium's standalone AI-native IDE built on VS Code, featuring Cascade — an agentic AI system for autonomous multi-file coding. Also available as a plugin for JetBrains IDEs (IntelliJ, PyCharm, WebStorm).

### 1. Autonomous Agent Mode?
**Yes — Cascade.** Cascade is Windsurf's core agentic system that:
- Performs autonomous multi-file edits across entire codebases
- Runs terminal commands independently
- Plans ahead (described as "thinks 10 steps ahead")
- Iterates on errors — detects issues, fixes, retries
- Maintains full codebase context via semantic indexing
- Supports Plan Mode (proposes) and Code Mode (implements)
- Processes code at ~950 tokens/sec with SWE-1.5 model

**Key differentiator**: Cascade operates in real-time within the IDE (synchronous), not as background tasks.

### 2. Multi-Model?
**Yes — extensive model support.** All available on all tiers (including free):

**Windsurf Native Models:**
- SWE-1.5 (flagship — near Claude 4.5-level performance at 13x speed)
- SWE-1.5 Fast (optimized variant)
- SWE-1 (original, Claude 3.5-level performance)
- SWE-1-mini (real-time suggestions)
- swe-grep (context retrieval)

**Anthropic:** Claude Opus 4.6, 4.6 Thinking, 4.6 1M, Sonnet 4.6, 4.6 Thinking, 4.6 1M, Opus 4.5, 4.5 Thinking, Sonnet 4.5, 4.5 Thinking, 4.5 1M, Haiku 4.5, older 4.1/4/3.7/3.5 variants

**OpenAI:** GPT-5.3, 5.2, 5.1 with reasoning variants (No/Low/Medium/High/Extra High), GPT-5.3-Codex, GPT-5.2-Codex, GPT-5.1-Codex variants, o3, o3 high reasoning, GPT-4o, GPT-4.1, gpt-oss 120B

**Google:** Gemini 3.1 Pro, Gemini 3 Pro/Flash variants, Gemini 2.5 Pro

**xAI:** Grok Code Fast (free tier)

**Open Source:** Minimax M2.1/M2.5, Kimi K2/K2.5, GLM-5/4.7, DeepSeek, Qwen, Zhipu variants

**BYOK Support (limited):** Claude 4 Sonnet, Claude 4 Sonnet Thinking, Claude 4 Opus, Claude 4 Opus Thinking

### 3. GUI or CLI?
**GUI — Full IDE.** VS Code-based standalone editor. Also available as JetBrains plugin. No CLI-only mode.

### 4. Local Desktop Control?
**No.** Windsurf operates within the IDE only. It can run terminal commands and edit files, but has no screen capture, mouse/keyboard control, or system-level automation capabilities. Strictly a code editor, not a desktop agent.

### 5. Mobile Companion?
**No.** Desktop and IDE only. No mobile app or companion.

### 6. Pricing

| Plan | Price | Credits/month | Key Features |
|------|-------|---------------|--------------|
| Free | $0 | 25 prompt credits | Cascade, Tab, Previews, Deploys, All Premium Models |
| Pro | $15/mo | 500 prompt credits | + Fast Context, SWE-1.5, Priority Support |
| Teams | $30/user/mo | 500/user | + SSO, RBAC, Admin Dashboard, Volume Discounts |
| Enterprise (<200) | Custom | 1,000/user | + Hybrid Deployment, Custom |
| Enterprise (200+) | Custom | Custom | Full custom |

Add-on credits: $10 for 250 credits (Pro tier)

### 7. What It Uniquely Does Best
- **Speed**: SWE-1.5 processes at 950 tokens/sec — 13x faster than Claude Sonnet
- **Breadth of models**: More model options than any other IDE, including open-source models
- **Price-to-value**: $15/mo vs Cursor's $20/mo with comparable features
- **Tab autocomplete**: Highly rated inline completions alongside Cascade agent
- **Web Previews + Deploys**: Built-in preview and deployment features

### 8. Key Limitations
- **Credit-based system**: 25 free credits run out fast; power users hit limits
- **BYOK is very limited**: Only 4 Claude models supported for own-key
- **No desktop automation**: IDE-only, no system-level agent capabilities
- **No mobile**: No companion app
- **VS Code lock-in**: Core product is a fork of VS Code; JetBrains plugin is secondary
- **SWE-1.5 is proprietary**: Cannot be used outside Windsurf
- **No background/async agent**: All work is synchronous — must keep IDE open

---

## 2. Devin (by Cognition)

### Overview
Devin is a fully autonomous AI software engineer that operates in its own sandboxed cloud environment. It runs independently — not as an IDE plugin but as a standalone cloud agent with its own shell, editor, and browser.

### 1. Autonomous Agent Mode?
**Yes — fully autonomous by design.** Devin is the most autonomous coding tool available:
- Operates in a sandboxed cloud VM with its own shell, code editor, and web browser
- Handles end-to-end software engineering: plan, code, debug, test, deploy
- Works asynchronously — you assign a task and check back later
- Creates PRs autonomously on GitHub
- Can browse the web, read documentation, install dependencies
- Learns from feedback and improves over time (Devin Wiki/playbooks)
- Supports batch session proposals for running many tasks in parallel
- "Advanced Mode" for inspecting sessions and automatic playbook creation

**Key differentiator**: Devin is the only tool that runs in its own cloud environment without requiring your local IDE.

### 2. Multi-Model?
**No — opaque model stack.** Devin uses proprietary/internal model combinations. Users cannot choose or swap models. Cognition does not publicly disclose which LLMs power Devin (likely a mix of frontier models fine-tuned for coding). This is a closed, vertically-integrated system.

### 3. GUI or CLI?
**Web GUI + Slack + API.** Three interfaces:
- **Devin IDE** (web-based): Full environment with shell, editor, browser, planner
- **Slack integration**: "@devin" in Slack channels to assign tasks conversationally
- **Devin API**: Programmatic task assignment
- **"Ask Devin"**: Conversational Q&A interface

No local CLI tool. Everything runs in Cognition's cloud.

### 4. Local Desktop Control?
**No.** Devin runs entirely in Cognition's cloud. It has no access to your local machine, desktop, or system. It operates in its own sandboxed VM. Code is pulled from and pushed to your Git repos.

### 5. Mobile Companion?
**No dedicated mobile app.** However, Slack integration means you can interact with Devin from Slack's mobile app, which provides a partial mobile workflow (assign tasks, get updates).

### 6. Pricing

| Plan | Price | ACUs Included | Per-ACU Rate | Sessions |
|------|-------|---------------|--------------|----------|
| Core | Pay-as-you-go (from $20) | Pay per use | $2.25/ACU | Up to 10 concurrent |
| Team | $500/mo | 250 ACUs | $2.00/ACU | Unlimited concurrent |
| Enterprise | Custom | Unlimited | Custom | Unlimited |

**ACU (Agent Compute Unit)**: Normalized unit covering VM time, model inference, and bandwidth. Varies by task complexity, codebase size, prompt specificity, and session duration.

All plans include: Devin IDE, Ask Devin, Devin Wiki, Devin API, unlimited users with sharing.
Team adds: Advanced Mode, auto-reload ACUs, early feature access.
Enterprise adds: VPC deployment, SAML/OIDC SSO, dedicated account team.

### 7. What It Uniquely Does Best
- **True autonomy**: The most autonomous coding agent — assign and walk away
- **Cloud sandboxing**: Own VM eliminates local environment issues
- **Slack-native workflow**: Assign coding tasks conversationally in Slack
- **Parallel sessions**: Run many Devin instances on different tasks simultaneously
- **Large migrations**: Demonstrated 8-12x efficiency on large-scale refactoring (Nubank case study)
- **Full environment**: Has its own browser — can read docs, test web apps, navigate APIs
- **Integrations**: Native GitHub, Slack, Jira, Linear, Teams, custom git providers

### 8. Key Limitations
- **Expensive**: $500/mo for Teams; even Core at $2.25/ACU adds up fast for complex tasks
- **No model choice**: Opaque AI stack — cannot choose Claude vs GPT vs Gemini
- **Cloud-only**: Cannot work offline; no local execution
- **Latency**: Asynchronous workflow means you wait for results, not real-time collaboration
- **Quality concerns**: Community reports mixed results — works well for routine tasks but struggles with complex architectural decisions
- **No local files**: Must commit code to git; cannot work on uncommitted local changes
- **Lock-in**: Proprietary platform with no data portability standards
- **ACU unpredictability**: Hard to predict costs since ACU consumption varies by task

---

## 3. GitHub Copilot

### Overview
GitHub Copilot is Microsoft/GitHub's AI coding assistant, available as a plugin for VS Code, Visual Studio, JetBrains, and other IDEs. In 2026, it has evolved from autocomplete to a multi-modal agent system with three distinct AI capabilities: inline completions, chat/agent mode (synchronous), and coding agent (asynchronous).

### 1. Autonomous Agent Mode?
**Yes — two levels of autonomy:**

**Agent Mode (synchronous, in-IDE):**
- Operates in VS Code/IDE as a real-time autonomous collaborator
- Multi-step planning, multi-file editing, terminal command execution
- Tools: `read_file`, `edit_file`, `run_in_terminal`
- Iterative error detection and self-correction
- MCP (Model Context Protocol) support for external tool integration
- User maintains control and can intervene at any step

**Coding Agent (asynchronous, GitHub Actions):**
- Fully autonomous background agent running in GitHub Actions
- Assign via GitHub Issues or Copilot Chat
- Creates branches (`copilot/` prefix), commits, and opens PRs automatically
- Runs tests, linters, and security scans (CodeQL, secret scanning)
- Works on: bug fixes, incremental features, test coverage, documentation, tech debt
- Requires human review before merge

### 2. Multi-Model?
**Yes — the broadest model selection of any IDE tool:**

**OpenAI:** GPT-5.2, GPT-5.1, GPT-4.1, GPT-5 mini, GPT-5.1-Codex, GPT-5.1 Codex Max, GPT-5.1-Codex-Mini, GPT-5.2-Codex, GPT-5.3-Codex (preview)

**Anthropic:** Claude Opus 4.6, 4.6 fast mode (preview), Claude Sonnet 4.5, 4.0, Claude Haiku 4.5, Claude Opus 4.5

**Google:** Gemini 2.5 Pro, Gemini 3 Flash, Gemini 3 Pro, Gemini 3.1 Pro

**Other:** Grok Code Fast 1, Qwen2.5, Raptor mini, Goldeneye

Auto model selection available on Pro/Pro+ tiers — Copilot picks the best model per task automatically.

### 3. GUI or CLI?
**Both:**
- **GUI**: VS Code, Visual Studio, JetBrains, Neovim, Xcode plugins
- **CLI**: GitHub Copilot CLI for terminal assistance
- **Web**: GitHub.com integrated chat
- **Mobile**: GitHub Mobile app integration

### 4. Local Desktop Control?
**No.** Copilot operates within the IDE and GitHub platform only. Agent mode can run terminal commands, but has no screen capture, mouse control, or system-level automation. The coding agent runs in GitHub Actions (cloud), not locally.

### 5. Mobile Companion?
**Partial — GitHub Mobile.** You can interact with Copilot Chat through the GitHub Mobile app. You can also assign issues to the coding agent from mobile. However, this is not a dedicated companion app — it's part of the GitHub app.

### 6. Pricing

| Plan | Price | Premium Requests | Key Features |
|------|-------|-----------------|--------------|
| Free | $0 | None | 2,000 completions + 50 chat/mo, limited models |
| Pro | $10/mo | 300/mo | Coding agent, code review, multi-provider models |
| Pro+ | $39/mo | 1,500/mo | Unlimited agent mode, GitHub Spark, all models |
| Business | $19/user/mo | 300/user/mo | Coding agent, IP indemnity, user management |
| Enterprise | $39/user/mo | 1,000/user/mo | All models incl. Claude Opus 4.6, GitHub Spark |

Premium requests have multipliers based on model used (e.g., Opus 4.6 costs more premium requests than Haiku 4.5).

### 7. What It Uniquely Does Best
- **GitHub ecosystem integration**: Unmatched — Issues, PRs, Actions, code review all native
- **Coding agent (async)**: Assign an issue, Copilot creates a full PR autonomously in the background
- **Broadest IDE support**: VS Code, Visual Studio, JetBrains, Neovim, Xcode, GitHub.com, Mobile
- **Free tier**: Generous free plan with 2,000 completions — best free offering
- **Enterprise-ready**: IP indemnity, SOC 2, SAML SSO, audit logs
- **Auto model selection**: AI picks the optimal model per task
- **MCP support**: Agent mode supports Model Context Protocol for extensibility

### 8. Key Limitations
- **Premium request limits**: Heavy users burn through 300 requests fast on Pro; 1,500 on Pro+ is better
- **Coding agent limitations**: Single repo only, one PR per task, cannot handle cross-repo work
- **No BYOK**: Cannot bring your own API keys — must use GitHub's model pool
- **GitHub lock-in**: Coding agent requires GitHub repos, GitHub Actions, GitHub Issues
- **No desktop control**: Strictly IDE and GitHub platform
- **Agent mode quality**: Variable — community reports inconsistent results for complex tasks
- **Cost at scale**: Enterprise at $39/user/mo adds up for large teams

---

## 4. Aider

### Overview
Aider is a free, open-source AI pair programming tool that runs in the terminal. It connects to any LLM (cloud or local) and makes direct edits to your codebase with automatic Git integration. Created by Paul Gauthier, it has 41K+ GitHub stars and processes 15 billion tokens weekly.

### 1. Autonomous Agent Mode?
**Partial — Architect Mode.** Aider has multiple chat modes:
- **Code Mode** (default): Makes changes to code based on requests
- **Ask Mode**: Discusses code without making changes
- **Architect Mode**: Two-model autonomous approach:
  1. Architect model proposes solutions (planning)
  2. Editor model translates proposals into file edits (implementation)
  - Particularly powerful with reasoning models (o1/o3 as architect, GPT-4o as editor)
- **Help Mode**: Questions about Aider itself

Architect mode is the closest to autonomous agent behavior, but Aider is fundamentally interactive — it does not run tasks in the background or create PRs autonomously. It's a co-pilot, not an autonomous agent.

**No true background agent mode.** You must actively interact in the terminal.

### 2. Multi-Model?
**Yes — the most model-agnostic tool available:**
- Works best with: Claude 3.7 Sonnet, DeepSeek R1/Chat V3, OpenAI o1/o3-mini/GPT-4o
- Supports virtually any LLM via API: OpenAI, Anthropic, Google, Azure, local models (Ollama, LM Studio)
- Architect mode: Separate model selection for architect and editor roles
- Easy model switching via CLI flags: `--model sonnet`, `--model deepseek`, `--model o3-mini`
- Full BYOK: You always bring your own API keys

### 3. GUI or CLI?
**CLI only.** Terminal-based interface. No GUI, no IDE plugin (though it has IDE integration via comment-based code requests — you write comments in your IDE, Aider processes them in terminal).

Also supports voice-to-code and web chat via copy/paste workflows.

### 4. Local Desktop Control?
**No.** Aider only edits code files and runs in the terminal. No screen capture, no mouse control, no system automation.

### 5. Mobile Companion?
**No.** Terminal-only. No mobile app.

### 6. Pricing
**Free and open source.** Apache 2.0 license. Zero cost for the tool itself.

You pay only for LLM API costs:
- Claude Sonnet 4.5: ~$3/$15 per 1M input/output tokens
- GPT-4o: ~$2.50/$10 per 1M tokens
- DeepSeek: ~$0.27/$1.10 per 1M tokens
- Local models (Ollama): $0

### 7. What It Uniquely Does Best
- **Completely free**: No subscription, no credits, no limits — you only pay API costs
- **Model agnostic**: Works with literally any LLM — the most flexible tool
- **Git integration**: Automatic commits with intelligent messages, easy undo via git
- **Architect mode**: Unique dual-model approach (planner + editor) gets excellent results
- **100+ languages**: Broadest language support
- **Transparent**: Open source, inspectable, customizable
- **Low overhead**: No IDE required, works in any terminal, minimal dependencies
- **Self-bootstrapping**: 88% of Aider's own code was written by Aider
- **Active development**: 41K stars, very active community, frequent releases

### 8. Key Limitations
- **No GUI**: Terminal-only interface is a barrier for less technical users
- **No true autonomy**: Cannot run background tasks, create PRs, or work asynchronously
- **No IDE integration**: Must switch between IDE and terminal (comment-based integration is limited)
- **Single-turn focus**: Each interaction is relatively atomic — no long-running multi-step agent loops
- **No project management integration**: No Jira, Slack, Linear, GitHub Issues integration
- **60-65% accuracy on complex refactoring**: Good but not best-in-class for multi-file edits
- **API key management**: Users must manage their own keys across providers
- **No web browsing**: Cannot research documentation or browse the web

---

## Comparative Summary Matrix

| Dimension | Windsurf | Devin | GitHub Copilot | Aider |
|-----------|----------|-------|----------------|-------|
| **Type** | AI IDE | Cloud Agent | IDE Plugin + Cloud Agent | CLI Tool |
| **Autonomous Agent** | Yes (Cascade) | Yes (fully autonomous) | Yes (Agent Mode + Coding Agent) | Partial (Architect Mode) |
| **Async Background Agent** | No | Yes | Yes (Coding Agent) | No |
| **Multi-Model** | Yes (30+ models) | No (proprietary) | Yes (20+ models) | Yes (any LLM) |
| **BYOK** | Limited (4 Claude models) | No | No | Yes (always) |
| **GUI** | Full IDE | Web IDE | IDE Plugin | CLI only |
| **CLI** | No | No (API only) | Yes (limited) | Yes (primary) |
| **Local Desktop Control** | No | No | No | No |
| **Mobile Companion** | No | No (Slack workaround) | Partial (GitHub Mobile) | No |
| **Free Tier** | 25 credits/mo | No ($20 min) | 2,000 completions + 50 chat | Fully free (OSS) |
| **Pro Price** | $15/mo | $20 (pay-as-you-go) | $10/mo | Free |
| **Team Price** | $30/user/mo | $500/mo | $19/user/mo | Free |
| **Own Model (SWE)** | SWE-1.5 | Proprietary stack | No | No |
| **GitHub Integration** | Basic | Native (PRs) | Deep (Issues, PRs, Actions) | Basic (commits) |
| **Slack Integration** | No | Yes (native) | No | No |
| **Jira/Linear** | No | Yes | No | No |
| **MCP Support** | No | No | Yes | No |
| **IDE Support** | VS Code fork + JetBrains | Web IDE | VS Code, Visual Studio, JetBrains, Neovim, Xcode | Terminal only |
| **Open Source** | No | No | No | Yes (Apache 2.0) |
| **Web Preview/Deploy** | Yes (built-in) | Yes (sandboxed browser) | No | No |

---

## Key Takeaways for AGI Workforce Competitive Positioning

### What None of These Tools Have (AGI Workforce Differentiators):
1. **True local desktop control**: None have screen capture, mouse/keyboard automation, or system-level agent capabilities
2. **Mobile companion with live agent dashboard**: None have dedicated mobile apps for monitoring/approving agent actions
3. **Multi-LLM with full BYOK across all models**: Windsurf's BYOK is limited to 4 models; Copilot/Devin have no BYOK; only Aider is fully BYOK but has no GUI
4. **MCP + desktop automation combined**: Copilot has MCP but no desktop control; nobody combines both
5. **Unrestricted agent mode**: All tools have guardrails and limits; AGI Workforce can offer configurable autonomy levels
6. **Cross-app orchestration**: None can control multiple applications simultaneously

### Biggest Threats:
1. **GitHub Copilot** — massive distribution (GitHub ecosystem), free tier, broadest IDE support, and now has async coding agent. Microsoft's resources make them the #1 threat.
2. **Windsurf** — aggressive pricing ($15/mo), fast SWE-1.5 model, great model selection. Direct competitor on the "AI IDE" positioning.
3. **Devin** — strongest autonomy story, but expensive and opaque. More of a threat for enterprise than individual developers.

### Weakest Competitor:
**Aider** — excellent tool but CLI-only, no GUI, no true agent mode. Serves a different niche (power users, open-source advocates). Not a direct competitor to AGI Workforce's desktop platform vision.
