# AGI Workforce — Product Requirements Document

**Version 1.0 | February 26, 2026**

---

## What Is AGI Workforce?

AGI Workforce is an AI desktop application that lets you use any AI model — Claude, GPT, Gemini, Llama, Mistral, DeepSeek, or any other — from a single app. Think of it as a universal remote for AI. Instead of opening Claude Desktop for Anthropic, ChatGPT for OpenAI, and Gemini for Google, you open one app and talk to whichever model you want.

But it goes far beyond chat. AGI Workforce gives AI agents full access to your computer. They can read and write files, run terminal commands, control your browser, send emails, manage your calendar, capture your screen, and even move your mouse and type on your keyboard. It is, in effect, an AI employee that sits on your desktop and can do anything you can do — using whatever AI brain you choose to give it.

The product is proprietary commercial software, and it runs natively on macOS (both Apple Silicon and Intel), Windows, and Linux.

---

## Why Does This Product Exist?

AGI Workforce is a direct competitor to Claude, ChatGPT, Gemini, Perplexity, and Cursor Agent. Each of these products is excellent at one thing but fundamentally limited by the same constraint: they lock you into a single AI provider's ecosystem.

**Claude** (Anthropic) is the best at reasoning and coding, but you can only use Anthropic's models. If GPT is better for a specific task, or you want to use a cheap model for routine work, you're out of luck. Claude Desktop has MCP tool support but no background agents, no computer use beyond a limited beta, and no voice.

**ChatGPT** (OpenAI) has the largest user base and a strong voice mode, but it's OpenAI-only. ChatGPT Desktop has minimal tool integration. The Operator product for web automation requires constant human supervision — it's not a true autonomous agent. There's no MCP ecosystem, no local model support, and no multi-agent capability.

**Gemini** (Google) has deep integration with Google's own services (Gmail, Calendar, Drive) but offers no desktop application with meaningful local autonomy. It's cloud-only with no offline capability, no computer use, and no third-party tool ecosystem.

**Perplexity** is excellent at research and web search with citations, but it's a search product — not a general-purpose AI agent. It can't control your computer, run terminal commands, manage files, automate browsers, or execute multi-step workflows. It has no desktop autonomy, no tool execution, and no agent runtime.

**Cursor Agent** is the most capable coding agent on the market, but it's specifically a code agent embedded in an IDE. It can't send an email, schedule a meeting, fill out a job application, generate images, query a database, or automate your browser. It's also limited in model choice and has no multi-agent swarm capability.

AGI Workforce competes with all five by being the one product that combines the best of each: the reasoning depth of Claude, the breadth of ChatGPT, the Google service integration of Gemini, the research capability of Perplexity, and the agentic coding power of Cursor — all without locking you into any single model provider. Plus, it adds capabilities none of them have: background agents that run for hours unattended, a swarm of up to 100 parallel agents, full desktop computer use (mouse, keyboard, screen reading), voice I/O, and the ability to run models locally on your own machine for complete privacy.

---

## The Product Suite

AGI Workforce is not just one app. It's a coordinated system of five applications that work together.

**The Desktop App** is the main product. It's built with Tauri, which means the backend is written in Rust (for speed and security) and the frontend is React with TypeScript (for a modern UI). This is where the AI agents live, where your conversations happen, and where all the automation runs. It stores data locally in an encrypted SQLite database so your conversations and credentials never leave your machine unless you want them to.

**The Web App** handles account management, billing, and a browser-based chat interface. It's built with Next.js and hosted on Vercel. When you sign up, manage your subscription, or buy credits, you're using the web app. It also serves as the backend for LLM API calls — the desktop app sends requests through the web app's API, which routes them to the right AI provider and tracks your credit usage.

**The Browser Extension** is a Chrome extension that bridges the desktop app and your web browser. It can read page content, fill out forms, click buttons, and even auto-fill job applications on sites like Greenhouse and Workday. It communicates with the desktop app through Chrome's native messaging protocol.

**The API Gateway** is a Node.js service that handles device management and cross-device sync. If you have the desktop app on your laptop and your phone, the API gateway keeps them connected. It also provides a credits API for checking and deducting usage credits.

**The Signaling Server** enables WebRTC connections between your desktop and mobile devices. When you scan a QR code on your phone to pair it with your desktop, the signaling server brokers that initial handshake.

All five applications share common TypeScript types and utility functions through two shared packages in the monorepo.

---

## Who Is This For?

**Developers and power users** who want a single AI app that works with every model. They want to compare Claude vs GPT vs Gemini side by side, run terminal commands through AI, and connect custom tools via the Model Context Protocol (MCP). They also want the option to route sensitive queries to a locally running model for privacy.

**AI enthusiasts** who experiment with the latest models the day they're released. They want voice input and output, computer vision features, and the ability to test local models from Ollama or LM Studio without paying for cloud API calls.

**Enterprises** that need AI automation at scale but don't want to be locked into a single vendor. They need security controls like sandboxed tool execution, encrypted credential storage, team management, and audit logging. They're also interested in the planned SSO and SCIM integration for IT provisioning.

---

## How the AI Works

### Talking to Models

At the heart of AGI Workforce is the LLM Router — a Rust module that knows how to talk to over nine different AI providers. When you send a message, the router picks the best model based on your preferences, your subscription tier, and the task at hand. It supports seven different routing strategies: you can optimize for cost, latency, quality, or let the system choose automatically.

The router maintains two separate HTTP connections per provider — one for streaming responses (with a 5-minute timeout) and one for quick non-streaming calls (with a 2-minute timeout). This prevents the long timeout needed for streaming from delaying simple requests. A circuit breaker tracks failures per provider, and if one provider goes down, the router automatically falls back to the next best option. There's also a hard cost cap of $50 per session to prevent runaway spending.

Responses are streamed back using Server-Sent Events (SSE). The system sends keepalive signals during long pauses to prevent timeout errors — a problem that even Claude Desktop hasn't fully solved. Frequently used responses are cached in an LRU cache (512 entries, 24-hour expiry) to save money on repeated queries.

### Custom Models

Users can add their own model endpoints. This means any model running on Ollama, LM Studio, vLLM, llama.cpp, OpenRouter, Groq, Together AI, Fireworks, Mistral, DeepSeek, or any other service with an OpenAI-compatible API. These custom models appear in every model dropdown alongside the built-in cloud models — they're treated as first-class citizens, not second-class add-ons.

### The Agent Runtime

Beyond simple chat, AGI Workforce has a full agent runtime. This is the system that turns a simple instruction like "research the top 10 competitors and put the results in a spreadsheet" into a multi-step plan that the AI executes autonomously.

The agent runtime has several layers. The Task Planner breaks a goal into steps. The Task Executor runs each step one at a time. The Autonomous Agent is a loop that plans, executes, observes the result, and decides what to do next — without any human intervention. The Background Agent runs these loops in the background, so you can close the chat window and the agent keeps working. There's even a Continuous Executor for recurring tasks that run on a schedule.

Every action the agent takes can go through the Approval Controller, which enforces per-tool permission rules. In strict mode, the agent asks you before running any dangerous command. In auto-approve mode, trusted tools run without interruption.

### Multi-Agent Swarm

For very complex tasks, AGI Workforce can spin up a swarm of up to 100 AI agents working in parallel. The Swarm Orchestrator coordinates them in a hub-and-spoke pattern: it decomposes the task into subtasks, spawns a specialist agent for each one, and then aggregates the results. A dependency graph ensures that tasks run in the right order — if task B depends on task A's output, B waits for A to finish first.

The task decomposer uses SHA-256 content hashing with a one-hour cache to avoid redecomposing the same task twice. This is the same pattern used by frontier AI research labs for agentic workflows.

### The AGI System

Below the agent runtime sits the AGI system — a more ambitious module that handles hierarchical goal decomposition, reflection, learning, and memory. It has 17 specialized executors for different domains: API calls, browser automation, calendar operations, cloud storage, code execution, database queries, email, file operations, git, sub-LLM calls, MCP tools, media generation, OCR, productivity tools, web search, terminal commands, and UI automation.

The AGI system includes a Reflection Engine that analyzes failures, categorizes them, and generates corrections. There's a Learning System that tracks outcomes over time and improves future performance. And there's a Process Ontology that classifies tasks into templates, so the system recognizes that "send an email" and "draft a newsletter" are variations of the same process.

---

## What the Desktop App Can Do

### Chat and Conversations

The core experience is a chat interface where you type messages and the AI responds. Conversations are stored locally in the encrypted SQLite database. You can have multiple conversations, search through them with full-text search, and pick up where you left off. The system tracks token usage and cost per message so you always know what you're spending.

The chat supports multimodal input — you can send text, images, videos, audio, and documents. The AI can respond with text, code, and tool calls. An intent detection system automatically classifies your message (is this a coding task? a search query? an automation request?) and routes it to the right handler.

### Tools and Integrations

The desktop app connects to a wide range of external tools and services.

**MCP (Model Context Protocol)** is the primary extension mechanism. MCP servers are external processes that provide tools to the AI. The desktop app currently connects to Gmail, Google Calendar, Vercel, and n8n, with code ready for Google Drive, Notion, Trello, and Asana. MCP supports three transport types: stdio (for local processes), SSE (for HTTP streaming), and streamable HTTP. A health monitor pings each server every 30 seconds to detect failures.

**Email** is implemented natively in Rust with IMAP for reading and SMTP for sending. Gmail gets special treatment with OAuth 2.0 authentication and push notifications. The system supports connecting multiple email accounts simultaneously. Credentials are stored in the OS keyring (macOS Keychain, Windows Credential Manager, or Linux Secret Service) with an AES-256-GCM fallback.

**Calendar** supports Google Calendar and Outlook/Exchange via OAuth 2.0 with PKCE. You can list events, create events, update them, and delete them — all through AI commands. Token storage uses HKDF-SHA256 key derivation with automatic refresh.

**Cloud Storage** supports Google Drive, Dropbox, and OneDrive. Files are encrypted with AES-256-GCM using a machine-derived key before upload, so even if someone accesses your cloud storage, they can't read the files without your desktop app.

**Document Processing** can read and write PDFs, Word documents (DOCX), and Excel spreadsheets (XLSX). It's all done in Rust using native libraries — no external dependencies or cloud services needed.

**Database Connections** let the AI query external databases directly. It supports SQLite, PostgreSQL, MySQL, MongoDB, and Redis. A SQL security validator prevents injection attacks on external queries, and a safe query builder ensures all queries are parameterized.

**Messaging** has integrations for Discord, Telegram, Slack, Microsoft Teams, Signal, and WhatsApp, unified behind a common channel abstraction.

**Terminal** provides a full pseudo-terminal (PTY) with session management. The AI can run commands, read output, and even get AI-powered suggestions for terminal errors.

### Computer Use and Automation

This is one of AGI Workforce's most distinctive features. The AI can literally see your screen and control your computer.

**Screen Capture** takes screenshots of your full screen, a specific region, or a specific window. On macOS it uses the native screen capture APIs; on Windows it uses DXGI for hardware-accelerated capture.

**OCR** (Optical Character Recognition) reads text from screenshots using Tesseract. This is how the AI "sees" what's on your screen — it captures a screenshot, runs OCR, and reads the text content.

**Computer Use** implements an Observe-Plan-Act loop: the AI captures the screen (observe), decides what to do (plan), then executes mouse clicks, keyboard input, or other actions (act). Safety guardrails prevent dangerous operations, and a session manager tracks state across multiple cycles.

**Keyboard and Mouse** simulation lets the AI type text, press key combinations, click at specific coordinates, drag and drop, and scroll. On macOS this uses the Accessibility API; on Windows it uses the Windows UI Automation (UIA) framework.

**Browser Automation** uses the Chrome DevTools Protocol (CDP) to control Chrome directly, with the browser extension as a bridge. The AI can navigate to URLs, click elements, fill forms, read page content, and capture screenshots of specific elements. There's also a Playwright bridge for more complex browser automation scenarios.

**Automation Recording** lets you record a sequence of actions (clicks, keystrokes, scrolls) and play them back later. Recordings can be saved as scripts and shared.

### Voice

AGI Workforce has a complete voice pipeline.

**Speech-to-Text** supports three options: Whisper (cloud API), local Whisper (offline, using whisper.cpp with models from tiny to large), and Deepgram (cloud streaming). Voice Activity Detection (VAD) using WebRTC automatically detects when you start and stop speaking.

**Text-to-Speech** supports Piper (local, offline), cloud TTS via the managed API, and macOS native TTS.

**Advanced voice features** include wake word detection (say a trigger word to activate the AI), push-to-talk mode, and barge-in detection (interrupt the AI mid-speech and it stops talking).

### Memory and Intelligence

The AI has a persistent memory system. It remembers facts, preferences, decisions, and context across conversations. Memory entries are categorized (Preference, Fact, Decision, Context) and can be searched using both semantic similarity and full-text search.

**Embeddings** let the AI understand the meaning of your codebase. An incremental indexer processes your workspace files, splits them into chunks using a code-aware chunker, generates vector embeddings, and stores them in a separate SQLite database. When you ask a question about your code, the system finds the most relevant chunks using cosine similarity search.

**RAG (Retrieval-Augmented Generation)** combines the embedding search with the LLM to answer questions grounded in your actual code and documents, rather than the model's training data.

**Research Mode** is a multi-source research system with four depth levels: Quick, Standard, Deep, and Exhaustive. It spawns parallel research sub-agents that search multiple sources, track citations, and produce structured research reports.

### Settings and Configuration

The desktop app has a comprehensive settings panel with nine tabs covering general preferences, model configuration, agent behavior, MCP extensions, plugins, instruction file discovery, feature toggles, privacy controls, and system diagnostics.

One particularly notable feature is instruction file discovery — the app automatically finds and loads AI instruction files from your project directory, including CLAUDE.md, GEMINI.md, .cursorrules, and .github/copilot-instructions.md. This means a project configured for any AI tool works in AGI Workforce without modification.

### Other Desktop Features

**Artifacts** are versioned code and document outputs that can be created, updated, rolled back, diffed, pinned, archived, and exported.

**Canvas** is a visual whiteboard where the AI can place text, code blocks, images, and other elements.

**Workflows** let you define multi-step automation sequences that can be saved, shared, rated, and cloned through a marketplace.

**Analytics and ROI** track how much time and money the AI is saving you, with weekly and monthly reports.

**Teams** support multiple users collaborating with shared resources, role-based permissions, and team billing.

---

## The Web Application

The web application serves three purposes: public-facing marketing pages, user account management, and the backend API that the desktop app calls.

### Pages

Public visitors see a landing page, pricing page, download page, and standard pages like About, FAQ, Privacy Policy, and Terms of Service. Authenticated users get the chat interface, dashboard, billing management, media generation, and usage analytics.

### API Endpoints

The web app exposes over 100 API endpoints. The most important groups are:

**Authentication** uses Supabase Auth with session cookies and JWT tokens. Enterprise SSO is supported via SAML/OIDC. Every request goes through middleware that refreshes expired sessions and generates a fresh Content Security Policy nonce.

**Billing** integrates with Stripe for subscriptions, billing portal access, and one-time credit top-ups ($10 to $1,000). A webhook handles all Stripe lifecycle events, and a cron job resets credits monthly.

**LLM Completions** is the main API the desktop app calls. It verifies subscription tier, checks credits, routes to the right provider, streams the response, and deducts actual cost.

**Media Generation** creates images (Google Imagen 4, DALL-E 3, or Stability AI) and videos (Runway Gen4 Turbo or Google Veo 3.1). Image generation is synchronous; video generation is asynchronous with polling.

### Security

All API inputs are validated with Zod schemas. Every state-changing endpoint requires a CSRF token. HTTP headers include HSTS, X-Frame-Options DENY, and restrictive CORS. Rate limiting uses Upstash Redis.

---

## The API Gateway

The API gateway handles user authentication (JWT with constant-time password comparison and a kill switch that fails closed on database errors), device management (register, heartbeat, command routing with offline queuing), cross-device sync (batch sync with last-write-wins conflict resolution), and real-time WebSocket connections for instant device-to-device communication.

---

## The Signaling Server

The signaling server helps desktop and mobile devices find each other via 8-character pairing codes displayed as QR codes. Once paired, the devices establish a direct WebRTC connection and the signaling server is no longer needed. Sessions expire after 5 minutes, with DDoS protection, rate limiting, and Prometheus metrics for monitoring.

---

## The Browser Extension

The Chrome extension bridges the desktop app and your browser. It can read page content, fill forms, click buttons, and auto-fill job applications on Greenhouse, Workday, and generic job sites. It uses a closed Shadow DOM for its UI overlay (invisible to page JavaScript), blocks all dangerous attribute setting and dynamic code execution, and rate-limits all messages.

---

## Security Architecture

### ToolGuard

A 1,778-line Rust module that gates every tool execution. Tools are classified into four safety tiers from "runs silently" to "requires explicit typed confirmation." It also performs rate limiting, path traversal detection, and domain blocking.

### Encryption

All secrets are encrypted with AES-256-GCM. With a master password, keys are derived via Argon2id (19 MiB memory, 2 iterations). Without one, keys are derived from machine identifiers via PBKDF2 (600,000 iterations). The SQLite database itself uses SQLCipher for full-database encryption. Update packages are verified with Ed25519 signatures.

### What's Missing

No SAML/enterprise OIDC, no SCIM endpoints, no unified RBAC across web and desktop, no MDM profiles, no in-app proxy config, and three fragmented audit logging systems.

---

## Subscription and Credits

Six tiers: Free (no LLM access), Hobby (economy models), Pro (balanced models, waitlisted), Max (all models + media gen, waitlisted), Team ($29/seat), Enterprise ($99/seat). Credits are deducted based on actual token usage with a reserve-and-reconcile pattern and idempotency keys to prevent double-charging.

---

## Data Architecture

**Locally**, over 80 SQLite tables store everything from conversations to analytics, all encrypted with SQLCipher. Full-text search uses FTS5 with Porter stemming.

**In the cloud**, Supabase PostgreSQL stores user profiles, subscriptions, credit accounts, organizations, and audit logs. Row-Level Security ensures per-user data isolation.

**For code understanding**, a separate embeddings database stores vector representations of your workspace files for semantic search.

---

## How It's Built

A pnpm monorepo with Tauri v2 (Rust + React), Next.js 16, Express.js services, and Chrome MV3 extension. 12 Rust feature flags for optional capabilities. Strict compiler settings deny unsafe code and unused variables. CI runs on every push: lint, typecheck, test, build, security audit, clippy, and Playwright e2e. Desktop releases build for 5 platforms, code-sign macOS, and publish to GitHub Releases.

---

## Known Issues

The most critical open issue is a potential CI secret exposure (signing key in workflow logs). The chat message handler is 3,124 lines in a single function and needs decomposition. There are 6 model name mismatches between TypeScript and Rust. The `.env` file isn't in the filesystem deny list. The browser extension isn't wired into the full autonomous planner. Rate limiting on the API gateway is in-memory only.

Of 109 issues found by code review, about 60% have been fixed. Of 114 features audited, 66 pass, 21 are partial, 3 fail, 9 are blocked by missing dependencies, and 10 can't be tested outside the desktop environment.

---

## What's Next

The immediate roadmap is: fix the 3 failing features, promote the 21 partial features, refresh the model catalog, sync model names between TypeScript and Rust, expand the filesystem deny list, wire the extension into the AGI planner, decompose the monolithic chat function, add Redis-backed rate limiting, and begin enterprise SSO and SCIM integration.

The goal for v1.2.0 is an 80%+ feature audit pass rate with zero user-visible raw error messages.

---

*This document covers the entire AGI Workforce platform: 579 Rust source files, 1,069 Tauri commands, 296 React components, 100+ web API routes, 80+ database tables. The detailed technical PRD with requirement IDs and type definitions is at `docs/PRD.md`. Section source files are in `docs/prd-sections/`.*
