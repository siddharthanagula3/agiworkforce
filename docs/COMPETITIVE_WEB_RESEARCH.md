# Competitive Web Research: AGI Workforce vs Claude.ai vs ChatGPT

_Generated: 2026-03-18 | 20 parallel research agents_

## Feature Matrix

| Feature                       | Claude.ai                                                                                | ChatGPT                                 | AGI Workforce Web                                | Priority  |
| ----------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------ | --------- |
| **Landing Page**              | Interactive prompt box, "Meet your thinking partner", Write/Learn/Code tabs, product-led | Feature showcase, testimonials, pricing | Hero + features + stats + security section + CTA | DONE      |
| **Auth: Email/Password**      | Yes (via Google/email/SSO)                                                               | Yes                                     | Yes (Supabase)                                   | DONE      |
| **Auth: OAuth**               | Google, SSO                                                                              | Google, Apple, Microsoft                | GitHub, Google                                   | DONE      |
| **Auth: SSO/SAML**            | Enterprise                                                                               | Enterprise                              | SSO detection on login                           | DONE      |
| **Auth: Magic Link**          | No                                                                                       | No                                      | Yes                                              | ADVANTAGE |
| **Pricing Page**              | Free/$20/$100/$200 tiers                                                                 | Free/$8/$20/$200 tiers                  | Free/$5/$25/$250 tiers                           | DONE      |
| **Billing: Stripe Checkout**  | Yes                                                                                      | Yes                                     | Yes (CSRF + rate limited)                        | DONE      |
| **Billing: Portal**           | Yes                                                                                      | Yes                                     | Yes (self-healing)                               | DONE      |
| **Billing: Usage Display**    | Progress bars, 5hr + 7d windows                                                          | Usage meters                            | Basic usage page                                 | IMPROVE   |
| **Chat: Message Rendering**   | Clean markdown, syntax highlighting, copy                                                | Similar                                 | EnhancedMarkdownRenderer                         | DONE      |
| **Chat: Code Blocks**         | Syntax highlighting + copy + language label                                              | Similar                                 | CodeBlock component                              | DONE      |
| **Chat: Thinking Blocks**     | Collapsible accordion with timer                                                         | Collapsible                             | ThinkingBlock + ReasoningAccordion               | DONE      |
| **Chat: Artifacts**           | Side panel, 6 types, versioning, publish/remix                                           | Code interpreter, canvas                | ArtifactsPanel exists                            | DONE      |
| **Chat: File Upload**         | Drag-drop, paste, 30MB, PDF/images/docs                                                  | Similar                                 | Composer with attachments                        | DONE      |
| **Chat: Image Preview**       | Thumbnails, vision analysis                                                              | Thumbnails + generation                 | ImageLightbox                                    | DONE      |
| **Chat: Streaming**           | SSE streaming                                                                            | SSE streaming                           | SSE via streaming-response-handler               | DONE      |
| **Chat: Tool Calls**          | Visible tool calls (search, MCP)                                                         | Plugin/tool calls                       | InlineToolResults + ToolTimeline                 | ADVANTAGE |
| **Conversation: Sidebar**     | Star, rename, delete, search                                                             | Folders, pin, search, archive           | ChatSidebarNew                                   | DONE      |
| **Conversation: Search**      | Basic filter + AI-powered search (paid)                                                  | Full-text search                        | GlobalSearchDialog                               | DONE      |
| **Conversation: Bulk Delete** | Yes                                                                                      | Yes                                     | Not implemented                                  | LOW       |
| **Projects**                  | Knowledge base + instructions + scoped chats                                             | Projects with collaboration             | Not on web (desktop only)                        | DEFER     |
| **MCP Connectors**            | 50+ integrations, OAuth, custom remote MCP                                               | Plugins/GPT Store                       | MCP in desktop app                               | DEFER     |
| **Memory**                    | Auto-summary, view/edit/reset, import from rivals                                        | Always-on memory, manage                | Not on web                                       | DEFER     |
| **Keyboard Shortcuts**        | Cmd+K, Enter, Shift+Enter, Esc, /                                                        | Similar                                 | KeyboardShortcutsDialog                          | DONE      |
| **Dark Mode**                 | Light/Dark/System                                                                        | Light/Dark/System                       | next-themes (Light/Dark/System)                  | DONE      |
| **Font Options**              | Default/System/Dyslexic Friendly                                                         | Default only                            | Not implemented                                  | LOW       |
| **Sharing**                   | Public links, read-only snapshots                                                        | Share links                             | ShareDialog exists                               | DONE      |
| **Settings: Account**         | Profile, display name                                                                    | Profile, data controls                  | Dashboard settings page                          | DONE      |
| **Settings: Privacy**         | Training opt-out, incognito mode                                                         | Data controls                           | Not needed (local processing)                    | ADVANTAGE |
| **Settings: Connectors**      | OAuth connection management                                                              | Plugin management                       | Not on web (desktop MCP)                         | DEFER     |
| **SEO: Metadata**             | Full per-page metadata                                                                   | Full per-page metadata                  | 24/31 pages covered                              | DONE      |
| **SEO: Sitemap**              | Yes                                                                                      | Yes                                     | Yes (20 routes)                                  | DONE      |
| **SEO: robots.txt**           | Yes                                                                                      | Yes                                     | Yes (8 bot rules + AI crawlers)                  | DONE      |
| **SEO: JSON-LD**              | Yes                                                                                      | Yes                                     | 3 schemas (Org + App + WebSite)                  | DONE      |
| **Security Headers**          | Full set                                                                                 | Full set                                | HSTS + CSP + COOP + CORP + COEP                  | DONE      |
| **Error Pages**               | Custom 404, error boundaries                                                             | Custom 404/500                          | 404 + error.tsx + dashboard/error                | DONE      |
| **Onboarding**                | Sample prompts, feature discovery                                                        | Tutorial, guided setup                  | SuggestedPrompts + HelpTour                      | DONE      |
| **Image Generation**          | None                                                                                     | DALL-E, GPT-4o native                   | Via API (Stability, DALL-E, Imagen)              | ADVANTAGE |
| **Video Generation**          | None                                                                                     | Sora                                    | Via API (Runway, Veo3)                           | ADVANTAGE |
| **Multi-Model**               | Opus/Sonnet/Haiku only                                                                   | GPT-4o/GPT-5 only                       | 9+ providers, any model                          | ADVANTAGE |
| **Desktop Control**           | Cowork (research preview)                                                                | None                                    | Full computer use, browser automation            | ADVANTAGE |
| **Agent Marketplace**         | None                                                                                     | GPT Store                               | AI Skills marketplace                            | ADVANTAGE |
| **Mobile Companion**          | iOS/Android app                                                                          | iOS/Android app                         | React Native + QR pairing                        | ADVANTAGE |

## AGI Workforce Unique Advantages (vs Claude.ai + ChatGPT)

1. **Multi-LLM**: 9+ providers (OpenAI, Anthropic, Google, xAI, DeepSeek, Ollama, etc.) — neither Claude nor ChatGPT offers this
2. **Local Desktop Control**: Full computer use, browser automation, terminal, file system — Cowork is limited preview
3. **Privacy-First**: All processing local, BYOK, AES-256 encrypted keys — Claude/ChatGPT process on their servers
4. **Image + Video Generation**: Integrated via API routes — Claude has neither
5. **Agent Marketplace**: 140+ AI skills across 9 industries — GPT Store is closest competitor
6. **Mobile Companion**: QR pairing with desktop, live agent dashboard, approve/deny from phone
7. **MCP Tool Orchestration**: 50+ built-in tools + unlimited MCP plugins in desktop
8. **Magic Link Auth**: Neither Claude nor ChatGPT offers passwordless email auth

## Claude.ai Design System (extracted from reverse-engineering)

- **Layout**: Two-column — sidebar + main chat. Minimalist, content-first.
- **Colors**: Purple (#EEEDFE→#26215C), Teal (#E1F5EE→#085041), Coral (#FAECE7→#4A1B0C). 9 ramps x 7 stops.
- **Typography**: Anthropic Sans, only 400/500 weights, h1=22px, body=16px, line-height 1.7
- **Cards**: White bg, 0.5px border, 12px radius, 1rem 1.25rem padding
- **No gradients, shadows, blur, or glow** (flash during streaming DOM diffs)
- **Artifacts**: Sandboxed iframe at claudeusercontent.com, React Runner for dynamic code, CSP limits CDN to cdnjs.cloudflare.com
- **Inline Visuals**: show_widget tool call, HTML injected into DOM (not iframe), streams token-by-token

## Claude.ai Pricing (March 2026)

| Plan       | Price               | Key Feature                               |
| ---------- | ------------------- | ----------------------------------------- |
| Free       | $0                  | Sonnet 4.5, Projects, Artifacts, Memory   |
| Pro        | $20/mo ($17 annual) | 5x usage, all models, Claude Code, Cowork |
| Max 5x     | $100/mo             | 25x free usage                            |
| Max 20x    | $200/mo             | 100x free usage                           |
| Team       | $25-150/user/mo     | Shared workspaces, admin                  |
| Enterprise | Custom              | SSO, SCIM, HIPAA, compliance API          |

## ChatGPT Pricing (March 2026)

| Plan       | Price          | Key Feature                  |
| ---------- | -------------- | ---------------------------- |
| Free       | $0             | GPT-5.2 Instant, limited     |
| Go         | $8/mo          | Expanded access (NEW)        |
| Plus       | $20/mo         | GPT-5.4, DALL-E, Sora, Codex |
| Pro        | $200/mo        | Unlimited, max compute       |
| Team       | $25-30/user/mo | Shared workspaces            |
| Enterprise | ~$60/user/mo   | SOC 2, SSO, 150-seat min     |

## Landing Page Best Practices (from SaaS research)

1. **Hero**: <8 words, outcome-first. Show real product UI, not stock photos
2. **Single CTA** converts 13.5% vs 10.5% for multiple. "Get Started Free" + "No credit card required"
3. **Social proof**: Logo bar + metric testimonials = 84% conversion increase
4. **3 pricing tiers** optimal. Default annual with visible discount
5. **Repeat CTA** at natural scroll breaks (after hero, features, social proof, footer)
6. **Security badges** prominent for enterprise buyers

## Implementation Priorities

### Already Implemented (No Action Needed)

- Landing page with compelling copy, features, stats, security, CTA
- Auth flow: login, signup, forgot-password, SSO, OAuth, magic link
- Billing: pricing page, Stripe checkout, portal, webhook, usage
- Chat: markdown, code blocks, thinking blocks, artifacts, file upload, streaming, tool calls
- SEO: metadata, sitemap, robots.txt, JSON-LD, security headers
- Dark mode, keyboard shortcuts, conversation sidebar, search, sharing

### Gaps to Address (Prioritized)

1. **Usage display polish** — Show progress bars with 5hr + weekly windows like Claude
2. **Conversation bulk actions** — Bulk delete, select-all
3. **Font options** — Add dyslexic-friendly font toggle
4. **Onboarding flow** — Enhance HelpTour with interactive walkthrough
5. **Error boundaries** — Add to ChatStream, DeepResearchPanel, ArtifactsView

### Deferred (Desktop-Only Features)

- Projects/workspaces (desktop has this)
- MCP connector management (desktop)
- Memory management UI (desktop)
- These don't belong on the marketing/billing web app
