# PRD-WEB: AGI Workforce Web Application

> **Platform**: Web Application (Next.js 16 + Vercel)
> **Document version**: 1.1.0
> **Last updated**: 2026-03-15
> **Status**: Public Alpha — Living document
> **Owner**: Product Team
> **Competitor benchmark**: claude.ai, chatgpt.com, perplexity.ai

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Requirements](#2-platform-requirements)
3. [Feature Matrix](#3-feature-matrix)
4. [Screen-by-Screen UI Specification](#4-screen-by-screen-ui-specification)
5. [Component Architecture](#5-component-architecture)
6. [Data Flow & API Connections](#6-data-flow--api-connections)
7. [Platform-Specific Capabilities](#7-platform-specific-capabilities)
8. [Build, Deploy & Distribution](#8-build-deploy--distribution)
9. [Testing Strategy](#9-testing-strategy)
10. [Performance Requirements](#10-performance-requirements)
11. [Security](#11-security)
12. [Accessibility](#12-accessibility)
13. [Competitive Analysis](#13-competitive-analysis)

---

# 1. Executive Summary

## 1.1 Platform Vision

The AGI Workforce Web Application is a Next.js 16 web platform deployed on Vercel that serves three primary functions:

1. **Marketing and acquisition** -- SEO-optimized public pages (homepage, features, pricing, download, docs, security, about, legal, blog, careers, use cases) that convert visitors into desktop app users and paying subscribers.
2. **Account management and billing** -- Supabase-authenticated dashboard for user accounts, subscription management via Stripe, usage analytics, credit monitoring, API key management, and team collaboration.
3. **Browser-based chat experience** -- A full-featured web chat interface with multi-model LLM support, agentic tool execution, artifacts, voice input, deep research, media generation, conversation branching, and collaborative multi-agent workflows -- providing a zero-install entry point that complements (but does not replace) the desktop application.

The web application is explicitly **not** a replacement for the desktop app. Desktop-only features (computer use, screen capture, local LLM inference, background agents, terminal execution, file system access, MCP tool servers, clipboard monitoring) remain exclusive to the Tauri-based desktop application. The web app provides a lightweight, accessible entry point for chat, account management, and marketing.

## 1.2 Competitive Positioning

| Capability                 | AGI Workforce Web                            | claude.ai        | chatgpt.com         | perplexity.ai   |
| -------------------------- | -------------------------------------------- | ---------------- | ------------------- | --------------- |
| Multi-model (any LLM)      | Yes -- 12+ cloud providers                    | Anthropic only   | OpenAI only         | Perplexity only |
| BYOK (bring your own keys) | Yes                                          | No               | No                  | No              |
| AI skill marketplace       | Yes (169+ skills)                            | No               | GPTs store          | No              |
| Media generation           | Images + video (DALL-E, Flux, Runway, Veo 3) | No               | DALL-E              | No              |
| Deep research mode         | Yes                                          | Limited          | Yes                 | Yes             |
| Conversation branching     | Yes                                          | No               | No                  | No              |
| Conversation sharing       | Yes (token-based URLs)                       | Yes              | Yes                 | Yes             |
| Agentic tool execution     | Yes (inline tool cards)                      | Artifacts only   | Code Interpreter    | No              |
| Desktop app integration    | Deep-link pairing                            | No               | No                  | No              |
| Mobile companion pairing   | QR code device link                          | No               | No                  | No              |
| Custom instructions        | Yes                                          | System prompts   | Custom instructions | No              |
| Voice input                | Yes (transcription API)                      | No               | Voice mode          | No              |
| Artifact rendering         | Code, presentations, spreadsheets            | Code, SVG, React | Canvas              | No              |
| i18n / multilingual        | en, es (i18next)                             | Multi-language   | Multi-language      | Multi-language  |
| Command palette            | Yes (Cmd+K)                                  | No               | No                  | No              |
| Theme support              | Light/dark (system-aware)                    | Light/dark       | Light/dark          | Light/dark      |

## 1.3 Target Users

### 1.3.1 Anonymous Visitors (Pre-Registration)

Users who arrive via search, social media, or referral. They see marketing pages, pricing, features, documentation, and the download page. Goal: convert to registered user or desktop app download.

### 1.3.2 Free Tier Users

Registered users who have not purchased a subscription. They can access the web chat with limited functionality (economy models, 1 workspace, no media generation, no browser automation). Goal: convert to Hobby or higher.

### 1.3.3 Hobby Subscribers ($4.99--$10/month)

Casual users who want economy LLM access (OpenAI, Google, DeepSeek) plus local LLMs via Ollama, terminal access, vision (upload only), and basic web search. They use the web chat regularly and may also use the desktop app.

### 1.3.4 Pro Subscribers ($24.99--$29.99/month, waitlisted)

Active developers and professionals who need pro-tier models (Anthropic, OpenAI, Google), Perplexity web search, browser automation, media generation, unlimited workspaces, and RAG knowledge base. Currently on waitlist.

### 1.3.5 Max Subscribers ($249.99--$299.99/month, waitlisted)

Power users who need flagship models, full computer use (desktop only), premium video generation (Veo 3, Sora), deep research, 2M context windows, and cross-app workflows. Currently on waitlist.

### 1.3.6 Team Subscribers ($29/seat/month)

Small teams using the workforce management dashboard, collaborative chat, and shared agent configurations.

### 1.3.7 Enterprise Subscribers ($99/seat/month)

Organizations requiring SSO/SCIM, priority support, SLA guarantees, audit logging, and compliance controls.

## 1.4 Non-Negotiable Requirements (Web-Specific)

| ID     | Requirement                                     | Rationale                                                                                           |
| ------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| WNN-01 | Zero user-visible raw error messages            | All API errors must be translated to friendly toast notifications. No stack traces, no error codes. |
| WNN-02 | Supabase session refresh must be seamless       | Users must never be logged out unexpectedly. Middleware must silently refresh JWT tokens.           |
| WNN-03 | Stripe checkout flow must be resilient          | Payment failures must show a friendly error page (`/payment-failure`), not a raw Stripe error.      |
| WNN-04 | Marketing pages must achieve LCP < 2.5s         | SEO-critical. Google Core Web Vitals affect search ranking.                                         |
| WNN-05 | Chat must stream responses in real-time         | SSE streaming with progressive rendering. No "spinner then dump" pattern.                           |
| WNN-06 | CSRF protection on all state-changing endpoints | HMAC-SHA256 tokens with 1-hour TTL, session-bound.                                                  |
| WNN-07 | Rate limiting on all API routes                 | Upstash Redis with per-endpoint configs. Security-sensitive endpoints fail closed.                  |
| WNN-08 | Content Security Policy enforced                | CSP headers via middleware with nonce-based script allowlisting.                                    |

## 1.5 Success Metrics

| Metric                                         | Target (v1.2.0) | Target (v2.0.0) |
| ---------------------------------------------- | --------------- | --------------- |
| Lighthouse Performance score (marketing pages) | >= 90           | >= 95           |
| Lighthouse Accessibility score                 | >= 95           | 100             |
| LCP (homepage)                                 | < 2.5s          | < 1.8s          |
| FID / INP                                      | < 100ms         | < 50ms          |
| CLS                                            | < 0.1           | < 0.05          |
| Time to Interactive (chat page)                | < 3s            | < 2s            |
| Auth flow success rate                         | >= 99%          | >= 99.9%        |
| Checkout completion rate                       | >= 60%          | >= 75%          |
| Web chat message success rate                  | >= 99%          | >= 99.9%        |
| API route p95 latency                          | < 500ms         | < 200ms         |
| Bundle size (initial JS)                       | < 200KB gzipped | < 150KB gzipped |
| Uptime (Vercel)                                | 99.9%           | 99.99%          |

---

# 2. Platform Requirements

## 2.1 Runtime Requirements

| Requirement            | Specification                                                      |
| ---------------------- | ------------------------------------------------------------------ |
| Browser support        | Chrome 90+, Firefox 90+, Safari 15+, Edge 90+                      |
| Mobile browser support | iOS Safari 15+, Chrome for Android 90+                             |
| Minimum viewport width | 320px (responsive)                                                 |
| JavaScript required    | Yes (React 19 SPA, no SSG fallback for dynamic pages)              |
| WebSocket support      | Required for real-time features (Supabase Realtime)                |
| Cookie support         | Required (Supabase auth cookies, CSRF tokens, session persistence) |

## 2.2 Framework and Technology Stack

| Layer               | Technology                                 | Version                                          | Purpose                                         |
| ------------------- | ------------------------------------------ | ------------------------------------------------ | ----------------------------------------------- |
| Framework           | Next.js                                    | 16 (App Router)                                  | Server/client rendering, API routes, middleware |
| React               | React                                      | 19.2.4                                           | UI rendering                                    |
| Language            | TypeScript                                 | 5.9.3 (strict mode)                              | Type safety                                     |
| Build tool          | Next.js built-in (Turbopack)               | latest                                           | Bundling and compilation                        |
| CSS                 | Tailwind CSS                               | 4.2.1                                            | Utility-first styling                           |
| UI primitives       | Radix UI                                   | latest                                           | Accessible component primitives                 |
| Icons               | Lucide React                               | 0.575.0                                          | Consistent icon system                          |
| Toast notifications | Sonner                                     | 2.0.7                                            | Non-blocking user feedback                      |
| State management    | Zustand                                    | 5.0.11 (+ Immer 10.1.1 + Persist)                | Client-side state                               |
| Server state        | TanStack React Query                       | 5.90.20                                          | Server data fetching, caching, mutations        |
| Auth                | Supabase Auth                              | SSR via @supabase/ssr 0.8.0                      | JWT sessions, OAuth, magic link, SSO            |
| Database            | Supabase (PostgreSQL)                      | @supabase/supabase-js 2.97.0                     | User data, conversations, subscriptions         |
| Payments            | Stripe                                     | stripe 20.4.0 + @stripe/react-stripe-js 3.7.0    | Checkout, subscription management, webhooks     |
| Rate limiting       | Upstash Redis                              | @upstash/ratelimit 2.0.8 + @upstash/redis 1.36.2 | API abuse prevention                            |
| Validation          | Zod                                        | 4.3.6                                            | Schema validation for API inputs                |
| AI SDK              | Vercel AI SDK                              | ai 6.0.116 + provider packages                   | LLM streaming, tool calling                     |
| Markdown rendering  | react-markdown + remark-gfm + rehype-katex | 10.1.0                                           | Chat message rendering                          |
| Code highlighting   | react-syntax-highlighter                   | 15.6.1                                           | Code block syntax highlighting                  |
| Math rendering      | KaTeX                                      | 0.16.33                                          | LaTeX math in chat messages                     |
| Diagrams            | Mermaid                                    | 11.12.3                                          | Mermaid diagram rendering                       |
| Charts              | Recharts                                   | 3.7.0                                            | Data visualization                              |
| Code editor         | Monaco Editor                              | @monaco-editor/react 4.7.0                       | In-browser code editing                         |
| Code sandbox        | Sandpack                                   | @codesandbox/sandpack-react 2.20.0               | Live code preview                               |
| Forms               | React Hook Form                            | 7.71.1                                           | Form state management                           |
| Motion              | Framer Motion                              | 12.30.0                                          | Animations and transitions                      |
| Search              | Fuse.js                                    | 7.1.0                                            | Client-side fuzzy search                        |
| Date handling       | date-fns                                   | 4.1.0                                            | Date formatting and manipulation                |
| Logging             | Pino                                       | 10.3.1                                           | Structured server-side logging                  |
| i18n                | i18next + react-i18next                    | 25.8.13 / 16.5.4                                 | Internationalization (en, es)                   |
| QR codes            | qrcode                                     | 1.5.4                                            | Device pairing QR codes                         |
| Themes              | next-themes                                | 0.4.6                                            | Light/dark mode                                 |
| Analytics           | Google Analytics (GA4)                     | Custom component                                 | Page view and event tracking                    |
| Diff viewer         | react-diff-viewer-continued                | 3.4.0                                            | Code diff display                               |
| Virtualized lists   | react-window                               | 1.8.11                                           | Performance for long lists                      |
| Resizable panels    | react-resizable-panels                     | 4.6.5                                            | Split-view layouts                              |
| Carousel            | embla-carousel-react                       | 8.6.0                                            | Carousel UI component                           |
| Drawer              | vaul                                       | 1.1.2                                            | Bottom sheet / drawer component                 |
| OTP input           | input-otp                                  | 1.4.2                                            | 2FA code entry                                  |
| PDF generation      | jspdf                                      | 4.1.0                                            | Export to PDF                                   |
| DOCX generation     | docx                                       | 9.5.1                                            | Export to Word                                  |
| ZIP handling        | jszip                                      | 3.10.1                                           | Multi-file export                               |
| Sanitization        | dompurify                                  | 3.3.1                                            | XSS prevention                                  |
| Blog frontmatter    | gray-matter                                | 4.0.3                                            | Blog post metadata                              |
| CV authority        | class-variance-authority                   | 0.7.1                                            | Variant-based component styling                 |
| Command menu        | cmdk                                       | 1.1.1                                            | Command palette                                 |
| Utilities           | clsx + tailwind-merge                      | 2.1.1 / 3.5.0                                    | Class name management                           |

## 2.3 Deployment Platform

| Property               | Value                              |
| ---------------------- | ---------------------------------- |
| Hosting                | Vercel (serverless)                |
| Domain                 | agiworkforce.com                   |
| Edge runtime           | Vercel Edge Functions (middleware) |
| CDN                    | Vercel Edge Network (automatic)    |
| Regions                | Auto (optimized by Vercel)         |
| Preview deployments    | Yes (per-PR)                       |
| Production deployments | Auto on merge to `main`            |

## 2.4 External Service Dependencies

| Service                   | Purpose                                  | Required         |
| ------------------------- | ---------------------------------------- | ---------------- |
| Supabase                  | Auth + PostgreSQL + Storage + Realtime   | Yes              |
| Stripe                    | Payments, subscriptions, customer portal | Yes              |
| Upstash Redis             | Rate limiting                            | Yes (production) |
| Google Analytics (GA4)    | Usage analytics                          | Optional         |
| OpenAI API                | LLM completions (GPT models)             | Optional         |
| Anthropic API             | LLM completions (Claude models)          | Optional         |
| Google AI API             | LLM completions (Gemini models)          | Optional         |
| Deepgram / OpenAI Whisper | Voice transcription                      | Optional         |
| GitHub API                | Releases, installations, webhooks        | Optional         |

## 2.5 Shared Packages

| Package               | Import        | Contents                                                                                                  |
| --------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| `@agiworkforce/types` | `workspace:*` | Shared TypeScript type definitions (ContextMessage, SignalingMessage, AgentStatus, Auth, Voice, Database) |
| `@agiworkforce/utils` | `workspace:*` | Shared utility functions (SignalingClient, validation, formatting, retry, error mapping)                  |

---

# 3. Feature Matrix

## 3.1 Complete Feature List

### 3.1.1 Marketing & Public Pages

| ID     | Feature                                                                                                        | Priority | Status      | Web-Exclusive |
| ------ | -------------------------------------------------------------------------------------------------------------- | -------- | ----------- | ------------- |
| WF-001 | SEO-optimized homepage with hero, features, stats, security, CTA                                               | P0       | Implemented | Yes           |
| WF-002 | Feature landing pages (7 pages: agents, ai-skills, ai-chat, ai-dashboards, ai-project-manager, plugins, tools) | P0       | Implemented | Yes           |
| WF-003 | Pricing page with Hobby/Pro/Max tiers, feature comparison table                                                | P0       | Implemented | Yes           |
| WF-004 | Download page with platform-specific installers (macOS/Windows/Linux)                                          | P0       | Implemented | Yes           |
| WF-005 | Documentation page                                                                                             | P1       | Implemented | Yes           |
| WF-006 | Blog with Markdown-based posts                                                                                 | P1       | Implemented | Yes           |
| WF-007 | Security page (privacy architecture)                                                                           | P1       | Implemented | Yes           |
| WF-008 | About page (company overview)                                                                                  | P2       | Implemented | Yes           |
| WF-009 | Legal pages (Terms, Privacy, Cookies)                                                                          | P0       | Implemented | Yes           |
| WF-010 | FAQ page                                                                                                       | P2       | Implemented | Yes           |
| WF-011 | Contact page                                                                                                   | P2       | Implemented | Yes           |
| WF-012 | Contact Sales page                                                                                             | P2       | Implemented | Yes           |
| WF-013 | Careers page                                                                                                   | P3       | Implemented | Yes           |
| WF-014 | Use case pages (Consulting, IT Providers, Sales Teams, Startups)                                               | P2       | Implemented | Yes           |
| WF-015 | Resources page                                                                                                 | P3       | Implemented | Yes           |
| WF-016 | Gallery page (artifact gallery)                                                                                | P2       | Implemented | Yes           |
| WF-017 | Help center page                                                                                               | P2       | Implemented | Yes           |
| WF-018 | Support page                                                                                                   | P2       | Implemented | Yes           |
| WF-019 | API documentation page                                                                                         | P2       | Implemented | Yes           |
| WF-020 | sitemap.xml generation                                                                                         | P1       | Implemented | Yes           |
| WF-021 | robots.txt                                                                                                     | P1       | Implemented | Yes           |
| WF-022 | JSON-LD structured data (Organization, SoftwareApplication, WebSite)                                           | P1       | Implemented | Yes           |
| WF-023 | OpenGraph and Twitter Card metadata                                                                            | P1       | Implemented | Yes           |
| WF-024 | Google Analytics integration (GA4)                                                                             | P2       | Implemented | Yes           |
| WF-025 | Get Started / onboarding page                                                                                  | P1       | Implemented | Yes           |
| WF-026 | Marketplace page (public, browse skills)                                                                       | P1       | Implemented | Yes           |

### 3.1.2 Authentication & Account

| ID     | Feature                                              | Priority | Status      | Web-Exclusive |
| ------ | ---------------------------------------------------- | -------- | ----------- | ------------- |
| WF-050 | Email + password signup                              | P0       | Implemented | No            |
| WF-051 | Email + password login                               | P0       | Implemented | No            |
| WF-052 | GitHub OAuth login                                   | P0       | Implemented | No            |
| WF-053 | Google OAuth login                                   | P0       | Implemented | No            |
| WF-054 | Magic link (passwordless) login                      | P1       | Implemented | No            |
| WF-055 | SSO/SAML (enterprise) login                          | P1       | Implemented | No            |
| WF-056 | Email verification flow                              | P0       | Implemented | Yes           |
| WF-057 | Forgot password flow                                 | P0       | Implemented | Yes           |
| WF-058 | Update password flow                                 | P0       | Implemented | Yes           |
| WF-059 | Auth callback handler (`/auth/callback`)             | P0       | Implemented | Yes           |
| WF-060 | Auth error page                                      | P0       | Implemented | Yes           |
| WF-061 | Device auth page (mobile pairing)                    | P1       | Implemented | Yes           |
| WF-062 | Desktop token generation (`/api/auth/desktop-token`) | P1       | Implemented | Yes           |
| WF-063 | Password strength validation (client-side)           | P1       | Implemented | No            |
| WF-064 | Resend verification email (max 3 attempts)           | P1       | Implemented | Yes           |
| WF-065 | Redirect-to parameter with safe redirect validation  | P0       | Implemented | No            |
| WF-066 | SSO domain auto-detection (debounced, 400ms)         | P2       | Implemented | Yes           |
| WF-067 | Sign in to desktop from web                          | P1       | Implemented | Yes           |

### 3.1.3 Dashboard & Account Management

| ID     | Feature                                                            | Priority | Status      | Web-Exclusive |
| ------ | ------------------------------------------------------------------ | -------- | ----------- | ------------- |
| WF-100 | Dashboard home (usage stats, recent conversations, quick actions)  | P0       | Implemented | Yes           |
| WF-101 | Dashboard sidebar navigation (collapsible, mobile responsive)      | P0       | Implemented | Yes           |
| WF-102 | Dashboard header with menu toggle                                  | P0       | Implemented | Yes           |
| WF-103 | Billing dashboard (subscription status, invoices, usage breakdown) | P0       | Implemented | Yes           |
| WF-104 | Usage dashboard (token consumption, cost breakdown, limits)        | P0       | Implemented | Yes           |
| WF-105 | Settings page (account, appearance, chat preferences)              | P0       | Implemented | Yes           |
| WF-106 | AI configuration settings                                          | P1       | Implemented | Yes           |
| WF-107 | Custom models settings                                             | P1       | Implemented | Yes           |
| WF-108 | Appearance settings (theme toggle, chat density)                   | P2       | Implemented | Yes           |
| WF-109 | Chat settings (default model, temperature, system prompt)          | P1       | Implemented | Yes           |
| WF-110 | Agents dashboard page                                              | P1       | Implemented | Yes           |
| WF-111 | Connectors page                                                    | P1       | Implemented | Yes           |
| WF-112 | Media studio page (image/video generation gallery)                 | P1       | Implemented | Yes           |
| WF-113 | Support page (submit tickets, knowledge base)                      | P2       | Implemented | Yes           |
| WF-114 | GitHub integrations page                                           | P2       | Implemented | Yes           |
| WF-115 | Hire page (workforce marketplace)                                  | P1       | Implemented | Yes           |
| WF-116 | Vibe page (code assistant / vibe coding dashboard)                 | P1       | Implemented | Yes           |
| WF-117 | Dashboard error boundary                                           | P0       | Implemented | Yes           |
| WF-118 | Dashboard loading states (Suspense boundaries)                     | P0       | Implemented | Yes           |
| WF-119 | Credit monitor component                                           | P1       | Implemented | Yes           |

### 3.1.4 Billing & Payments

| ID     | Feature                                                                     | Priority | Status      | Web-Exclusive |
| ------ | --------------------------------------------------------------------------- | -------- | ----------- | ------------- |
| WF-150 | Stripe checkout flow (plan selection -> Stripe Checkout -> success/failure) | P0       | Implemented | Yes           |
| WF-151 | Billing interval toggle (monthly/annual)                                    | P0       | Implemented | Yes           |
| WF-152 | Subscription status display (active, past_due, canceled)                    | P0       | Implemented | Yes           |
| WF-153 | Stripe customer portal (manage subscription, update payment, cancel)        | P0       | Implemented | Yes           |
| WF-154 | Stripe webhook handler (subscription lifecycle events)                      | P0       | Implemented | Yes           |
| WF-155 | Waitlist system (Pro and Max tiers)                                         | P1       | Implemented | Yes           |
| WF-156 | Claim offer endpoint                                                        | P1       | Implemented | Yes           |
| WF-157 | Credit top-up flow                                                          | P1       | Implemented | Yes           |
| WF-158 | Credit balance API                                                          | P1       | Implemented | Yes           |
| WF-159 | Cron: reset credits (scheduled)                                             | P2       | Implemented | Yes           |
| WF-160 | Subscription sync endpoint                                                  | P1       | Implemented | Yes           |
| WF-161 | Payment failure page with retry guidance                                    | P0       | Implemented | Yes           |
| WF-162 | Plan upgrade/downgrade detection and routing                                | P1       | Implemented | Yes           |
| WF-163 | Subscription-gated feature detection                                        | P0       | Implemented | No            |
| WF-164 | Manage billing button component                                             | P1       | Implemented | Yes           |

### 3.1.5 Web Chat Experience

| ID     | Feature                                                        | Priority | Status      | Web-Exclusive |
| ------ | -------------------------------------------------------------- | -------- | ----------- | ------------- |
| WF-200 | Multi-model chat interface (sidebar + composer + message list) | P0       | Implemented | No            |
| WF-201 | Chat session sidebar (create, select, delete, rename sessions) | P0       | Implemented | No            |
| WF-202 | Session persistence via Supabase                               | P0       | Implemented | Yes           |
| WF-203 | SSE streaming with progressive rendering                       | P0       | Implemented | No            |
| WF-204 | Model selector (quick switch between models)                   | P0       | Implemented | No            |
| WF-205 | Suggested prompts (empty state, 6 categories)                  | P1       | Implemented | No            |
| WF-206 | Markdown rendering (GFM, KaTeX math, code blocks, mermaid)     | P0       | Implemented | No            |
| WF-207 | Syntax-highlighted code blocks with copy button                | P0       | Implemented | No            |
| WF-208 | Chat composer with auto-resize textarea                        | P0       | Implemented | No            |
| WF-209 | File attachment support (drag & drop + button)                 | P1       | Implemented | No            |
| WF-210 | Attachment preview (images, audio, documents)                  | P1       | Implemented | No            |
| WF-211 | Voice input button (transcription via API)                     | P1       | Implemented | No            |
| WF-212 | Voice recording status indicator                               | P1       | Implemented | No            |
| WF-213 | Inline tool execution cards (tool call + result display)       | P0       | Implemented | No            |
| WF-214 | Tool execution timeline                                        | P1       | Implemented | No            |
| WF-215 | Tool approval dialog (ask mode)                                | P1       | Implemented | No            |
| WF-216 | Reasoning accordion (thinking/reasoning trace display)         | P1       | Implemented | No            |
| WF-217 | Thinking message block                                         | P1       | Implemented | No            |
| WF-218 | Message actions (copy, edit, regenerate, bookmark, share)      | P0       | Implemented | No            |
| WF-219 | Message reactions                                              | P2       | Implemented | No            |
| WF-220 | Message context menu (right-click)                             | P2       | Implemented | No            |
| WF-221 | Editable messages (click to edit sent message)                 | P1       | Implemented | No            |
| WF-222 | Conversation branching (create branch from message)            | P1       | Implemented | No            |
| WF-223 | Branch navigator                                               | P2       | Implemented | No            |
| WF-224 | Conversation sharing (token-based public URLs)                 | P1       | Implemented | Yes           |
| WF-225 | Shared session viewer                                          | P1       | Implemented | Yes           |
| WF-226 | Expired share banner                                           | P2       | Implemented | Yes           |
| WF-227 | Keyboard shortcuts (Cmd+K, Cmd+Shift+S, Cmd+Enter, etc.)       | P1       | Implemented | No            |
| WF-228 | Keyboard shortcuts dialog                                      | P2       | Implemented | No            |
| WF-229 | Slash command menu (/ triggers command suggestions)            | P1       | Implemented | No            |
| WF-230 | Command palette (Cmd+K)                                        | P1       | Implemented | No            |
| WF-231 | Focus mode buttons (research, code, creative, etc.)            | P1       | Implemented | No            |
| WF-232 | Mode selector (standard, deep research, coding, etc.)          | P1       | Implemented | No            |
| WF-233 | Token counter (real-time token usage per message)              | P2       | Implemented | No            |
| WF-234 | Token usage display (session-level token stats)                | P1       | Implemented | No            |
| WF-235 | Token analytics dashboard (detailed breakdown)                 | P2       | Implemented | No            |
| WF-236 | Token balance display                                          | P1       | Implemented | No            |
| WF-237 | Usage warning banner (approaching limits)                      | P1       | Implemented | No            |
| WF-238 | Usage warning modal                                            | P1       | Implemented | No            |
| WF-239 | Budget tracker                                                 | P1       | Implemented | No            |
| WF-240 | Budget alerts panel                                            | P2       | Implemented | No            |
| WF-241 | Deep research panel                                            | P1       | Implemented | No            |
| WF-242 | Citation badges (source attribution)                           | P1       | Implemented | No            |
| WF-243 | Sources footer                                                 | P2       | Implemented | No            |
| WF-244 | Inline suggestions                                             | P2       | Implemented | No            |
| WF-245 | Prompt suggestions dropdown                                    | P2       | Implemented | No            |
| WF-246 | Search results display                                         | P1       | Implemented | No            |
| WF-247 | Global search dialog                                           | P1       | Implemented | No            |
| WF-248 | Bookmarks dialog                                               | P2       | Implemented | No            |
| WF-249 | Export dialog (enhanced, multi-format)                         | P1       | Implemented | No            |
| WF-250 | Custom shortcut dialog                                         | P3       | Implemented | No            |
| WF-251 | Share dialog                                                   | P1       | Implemented | No            |
| WF-252 | Token analytics dialog                                         | P2       | Implemented | No            |
| WF-253 | Project settings dialog                                        | P2       | Implemented | No            |
| WF-254 | Projects view                                                  | P2       | Implemented | No            |
| WF-255 | Custom instructions panel                                      | P1       | Implemented | No            |
| WF-256 | Simple mode toggle                                             | P2       | Implemented | No            |
| WF-257 | Risk confirmation dialog (high-risk tool execution)            | P1       | Implemented | No            |
| WF-258 | Checkpoint manager                                             | P2       | Implemented | No            |
| WF-259 | Stop generation button                                         | P0       | Implemented | No            |
| WF-260 | Pending messages indicator                                     | P1       | Implemented | No            |
| WF-261 | Typing indicator                                               | P1       | Implemented | No            |
| WF-262 | Status trail (agentic loop status)                             | P1       | Implemented | No            |
| WF-263 | Current action badge                                           | P1       | Implemented | No            |
| WF-264 | Brief status indicator                                         | P2       | Implemented | No            |
| WF-265 | Browser activity badge                                         | P2       | Implemented | No            |
| WF-266 | Image lightbox                                                 | P2       | Implemented | No            |
| WF-267 | Media lab (generation UI)                                      | P1       | Implemented | No            |
| WF-268 | Chat loading state (skeleton)                                  | P0       | Implemented | No            |
| WF-269 | Auto-scroll to bottom on new messages                          | P0       | Implemented | No            |
| WF-270 | Drag and drop overlay                                          | P1       | Implemented | No            |
| WF-271 | Sidebar collapse/expand with persistence                       | P1       | Implemented | No            |
| WF-272 | Mobile sidebar (slide-in)                                      | P0       | Implemented | No            |
| WF-273 | Folder management (organize conversations)                     | P2       | Implemented | No            |
| WF-274 | Conversation list item (truncated preview, delete, rename)     | P0       | Implemented | No            |
| WF-275 | Skill-based chat entry (?skill= query param from marketplace)  | P1       | Implemented | Yes           |
| WF-276 | Multi-agent chat interface                                     | P1       | Implemented | No            |
| WF-277 | Agent participant panel                                        | P1       | Implemented | No            |
| WF-278 | Employee selector                                              | P1       | Implemented | No            |
| WF-279 | Employee thinking indicator                                    | P2       | Implemented | No            |
| WF-280 | Employee work stream                                           | P2       | Implemented | No            |

### 3.1.6 Artifacts & Rendering

| ID     | Feature                                           | Priority | Status      | Web-Exclusive |
| ------ | ------------------------------------------------- | -------- | ----------- | ------------- |
| WF-300 | Artifact panel (code, documents, presentations)   | P1       | Implemented | No            |
| WF-301 | Artifact renderer (code, HTML, React, SVG)        | P1       | Implemented | No            |
| WF-302 | Artifacts view (gallery of generated artifacts)   | P1       | Implemented | No            |
| WF-303 | Presentation artifact (slide rendering)           | P2       | Implemented | No            |
| WF-304 | Spreadsheet artifact                              | P2       | Implemented | No            |
| WF-305 | Artifact detection (automatic from chat messages) | P1       | Implemented | No            |
| WF-306 | Artifact preview                                  | P1       | Implemented | No            |
| WF-307 | Document actions (export, copy, download)         | P1       | Implemented | No            |
| WF-308 | Document message (inline document rendering)      | P1       | Implemented | No            |
| WF-309 | Image attachment preview                          | P1       | Implemented | No            |
| WF-310 | Artifact block (in-message artifact display)      | P1       | Implemented | No            |

### 3.1.7 Inline Tool Results

| ID     | Feature                                         | Priority | Status      | Web-Exclusive |
| ------ | ----------------------------------------------- | -------- | ----------- | ------------- |
| WF-350 | Inline API response viewer                      | P1       | Implemented | No            |
| WF-351 | Inline code diff viewer                         | P1       | Implemented | No            |
| WF-352 | Inline database results viewer                  | P2       | Implemented | No            |
| WF-353 | Inline directory listing                        | P2       | Implemented | No            |
| WF-354 | Inline document generation result               | P1       | Implemented | No            |
| WF-355 | Inline document read result                     | P1       | Implemented | No            |
| WF-356 | Inline document search result                   | P2       | Implemented | No            |
| WF-357 | Inline GitHub result viewer                     | P2       | Implemented | No            |
| WF-358 | Inline media generation result                  | P1       | Implemented | No            |
| WF-359 | Inline screenshot display                       | P2       | Implemented | No            |
| WF-360 | Inline search results                           | P1       | Implemented | No            |
| WF-361 | Inline terminal output viewer                   | P1       | Implemented | No            |
| WF-362 | Tool result registry (extensible plugin system) | P1       | Implemented | No            |

### 3.1.8 Inline Panels

| ID     | Feature                                         | Priority | Status      | Web-Exclusive |
| ------ | ----------------------------------------------- | -------- | ----------- | ------------- |
| WF-380 | Browser inline panel                            | P2       | Implemented | No            |
| WF-381 | Code inline panel                               | P1       | Implemented | No            |
| WF-382 | Database inline panel                           | P2       | Implemented | No            |
| WF-383 | Terminal inline panel                           | P1       | Implemented | No            |
| WF-384 | Inline panel renderer (dynamic panel selection) | P1       | Implemented | No            |
| WF-385 | Inline panel list (in message bubble)           | P1       | Implemented | No            |

### 3.1.9 Widgets

| ID     | Feature                                          | Priority | Status      | Web-Exclusive |
| ------ | ------------------------------------------------ | -------- | ----------- | ------------- |
| WF-400 | Chart widget (Recharts-based data visualization) | P2       | Implemented | No            |
| WF-401 | Confirmation widget                              | P1       | Implemented | No            |
| WF-402 | Data table widget                                | P2       | Implemented | No            |
| WF-403 | Diff widget                                      | P2       | Implemented | No            |
| WF-404 | Form widget                                      | P2       | Implemented | No            |
| WF-405 | Widget registry (extensible)                     | P1       | Implemented | No            |
| WF-406 | Widget renderer                                  | P1       | Implemented | No            |

### 3.1.10 Visualizations

| ID     | Feature                                      | Priority | Status      | Web-Exclusive |
| ------ | -------------------------------------------- | -------- | ----------- | ------------- |
| WF-420 | Code block with syntax highlighting and copy | P0       | Implemented | No            |
| WF-421 | Diff viewer (side-by-side code comparison)   | P1       | Implemented | No            |
| WF-422 | Terminal output viewer (ANSI color support)  | P1       | Implemented | No            |

### 3.1.11 Sidecar Panel

| ID     | Feature                                     | Priority | Status      | Web-Exclusive |
| ------ | ------------------------------------------- | -------- | ----------- | ------------- |
| WF-440 | Dynamic sidecar (context-aware right panel) | P1       | Implemented | No            |
| WF-441 | Sidecar diff viewer                         | P2       | Implemented | No            |

### 3.1.12 Vibe (Code Assistant)

| ID     | Feature                                               | Priority | Status      | Web-Exclusive |
| ------ | ----------------------------------------------------- | -------- | ----------- | ------------- |
| WF-500 | Vibe dashboard (project-based coding workspace)       | P1       | Implemented | Yes           |
| WF-501 | Vibe chat canvas                                      | P1       | Implemented | Yes           |
| WF-502 | Vibe message list                                     | P1       | Implemented | Yes           |
| WF-503 | Vibe message input (enhanced composer)                | P1       | Implemented | Yes           |
| WF-504 | Vibe status bar                                       | P1       | Implemented | Yes           |
| WF-505 | Vibe thinking indicator                               | P1       | Implemented | Yes           |
| WF-506 | Vibe agent avatar                                     | P2       | Implemented | Yes           |
| WF-507 | Code editor panel (Monaco)                            | P1       | Implemented | Yes           |
| WF-508 | File tree view                                        | P1       | Implemented | Yes           |
| WF-509 | Live preview panel                                    | P1       | Implemented | Yes           |
| WF-510 | Sandpack preview panel (live React rendering)         | P1       | Implemented | Yes           |
| WF-511 | Phase timeline                                        | P2       | Implemented | Yes           |
| WF-512 | Vibe empty state                                      | P1       | Implemented | Yes           |
| WF-513 | Vibe enhanced composer                                | P1       | Implemented | Yes           |
| WF-514 | Vibe template selector                                | P2       | Implemented | Yes           |
| WF-515 | Vibe keyboard shortcuts dialog                        | P2       | Implemented | Yes           |
| WF-516 | Vibe sidebar (session management)                     | P1       | Implemented | Yes           |
| WF-517 | Vibe split view layout                                | P1       | Implemented | Yes           |
| WF-518 | Vibe top navigation                                   | P1       | Implemented | Yes           |
| WF-519 | Agent panel (agent status, messages, working process) | P1       | Implemented | Yes           |
| WF-520 | Supervisor panel                                      | P2       | Implemented | Yes           |
| WF-521 | Task breakdown view                                   | P2       | Implemented | Yes           |
| WF-522 | File selector + file upload + file preview            | P1       | Implemented | Yes           |
| WF-523 | Token usage display (vibe-specific)                   | P1       | Implemented | Yes           |
| WF-524 | Agent selector                                        | P1       | Implemented | Yes           |
| WF-525 | Vibe SDK (client, session, protocol, streaming)       | P1       | Implemented | Yes           |

### 3.1.13 Workforce Management

| ID     | Feature                                  | Priority | Status      | Web-Exclusive |
| ------ | ---------------------------------------- | -------- | ----------- | ------------- |
| WF-550 | Employee chat interface                  | P1       | Implemented | Yes           |
| WF-551 | Employee management panel                | P1       | Implemented | Yes           |
| WF-552 | Employee marketplace (hire AI employees) | P1       | Implemented | Yes           |
| WF-553 | Team chat interface                      | P1       | Implemented | Yes           |
| WF-554 | Workforce API                            | P1       | Implemented | Yes           |

### 3.1.14 Memory & Context

| ID     | Feature                          | Priority | Status      | Web-Exclusive |
| ------ | -------------------------------- | -------- | ----------- | ------------- |
| WF-600 | Memory manager (CRUD operations) | P1       | Implemented | No            |
| WF-601 | Memory panel                     | P1       | Implemented | No            |
| WF-602 | Memory search                    | P1       | Implemented | No            |
| WF-603 | Memory sync (cross-device)       | P2       | Implemented | No            |
| WF-604 | Context display                  | P1       | Implemented | No            |

### 3.1.15 Agent Status & Background Tasks

| ID     | Feature                                  | Priority | Status      | Web-Exclusive |
| ------ | ---------------------------------------- | -------- | ----------- | ------------- |
| WF-650 | Agent status badge                       | P1       | Implemented | No            |
| WF-651 | Agent status card                        | P1       | Implemented | No            |
| WF-652 | Agent status panel                       | P1       | Implemented | No            |
| WF-653 | Background tasks panel                   | P1       | Implemented | No            |
| WF-654 | Scheduler store (manage scheduled tasks) | P2       | Implemented | No            |

### 3.1.16 Sharing & Collaboration

| ID     | Feature                                   | Priority | Status      | Web-Exclusive |
| ------ | ----------------------------------------- | -------- | ----------- | ------------- |
| WF-700 | Share conversation via token URL          | P1       | Implemented | Yes           |
| WF-701 | Shared session viewer (public, read-only) | P1       | Implemented | Yes           |
| WF-702 | Expired share banner                      | P2       | Implemented | Yes           |
| WF-703 | Share creation API                        | P1       | Implemented | Yes           |
| WF-704 | Share retrieval API                       | P1       | Implemented | Yes           |

### 3.1.17 Media Generation

| ID     | Feature                                 | Priority | Status      | Web-Exclusive |
| ------ | --------------------------------------- | -------- | ----------- | ------------- |
| WF-750 | Image generation (DALL-E, Flux, Imagen) | P1       | Implemented | No            |
| WF-751 | Video generation (Runway Gen-4)         | P2       | Implemented | No            |
| WF-752 | Video status polling                    | P2       | Implemented | No            |
| WF-753 | Media gallery                           | P1       | Implemented | No            |
| WF-754 | Media studio                            | P1       | Implemented | No            |

## 3.2 Feature Parity vs Competitors

| Feature                 | AGI Workforce Web         | claude.ai   | chatgpt.com      | perplexity.ai |
| ----------------------- | ------------------------- | ----------- | ---------------- | ------------- |
| Free tier available     | Yes (limited)             | Yes         | Yes              | Yes           |
| Multi-model access      | 12+ providers              | Claude only | GPT only         | Internal      |
| BYOK API keys           | Yes                       | No          | No               | No            |
| Streaming responses     | Yes                       | Yes         | Yes              | Yes           |
| Code execution          | Via API proxy             | Artifacts   | Code Interpreter | No            |
| Image generation        | DALL-E, Flux, Runway      | No          | DALL-E           | No            |
| Video generation        | Runway, Veo 3, Sora       | No          | Sora             | No            |
| File uploads            | Yes                       | Yes         | Yes              | Yes           |
| Voice input             | Yes (transcription)       | No          | Yes (advanced)   | No            |
| Search/citations        | Perplexity, deep research | No          | Yes              | Core feature  |
| Artifacts/canvas        | Yes (full)                | Yes         | Canvas           | No            |
| Conversation sharing    | Token-based URLs          | Yes         | Yes              | Yes           |
| Conversation branching  | Yes                       | No          | No               | No            |
| Command palette         | Yes (Cmd+K)               | No          | No               | No            |
| Slash commands          | Yes                       | No          | No               | No            |
| Folder organization     | Yes                       | Yes         | No               | No            |
| Custom instructions     | Yes                       | Yes         | Yes              | No            |
| Memory system           | Yes (explicit)            | No          | Memory           | No            |
| Desktop app link        | Deep link                 | No          | No               | No            |
| Mobile companion        | QR pairing                | Mobile app  | Mobile app       | Mobile app    |
| Keyboard shortcuts      | Comprehensive             | Basic       | Basic            | Basic         |
| Theme support           | Light/dark                | Light/dark  | Light/dark       | Light/dark    |
| i18n                    | en, es                    | Multi       | Multi            | Multi         |
| SSO/SAML                | Yes                       | Enterprise  | Enterprise       | No            |
| Team management         | Workforce dashboard       | Team plan   | Team plan        | Enterprise    |
| AI skill marketplace    | 169+ skills               | No          | GPTs store       | No            |
| Code editor (Monaco)    | Vibe feature              | No          | No               | No            |
| Live preview (Sandpack) | Vibe feature              | No          | No               | No            |
| Tool calling UI         | Inline cards + timeline   | Artifacts   | Plugins          | No            |

---

# 4. Screen-by-Screen UI Specification

## 4.1 Root Layout (`/`) -- `app/layout.tsx`

**Purpose**: Global HTML shell for all pages.

**Component**: React Server Component (RSC).

**Structure**:

```
<html lang="en">
  <head>
    JSON-LD: Organization schema
    JSON-LD: SoftwareApplication schema
    JSON-LD: WebSite schema with SearchAction
  </head>
  <body class="font-geist antialiased">
    <Providers>  <!-- Client-side providers wrapper -->
      <QueryProvider>
        <ThemeProvider>
          <I18nextProvider>
            {children}
            <CommandPaletteProvider />
            <Toaster position="top-center" richColors closeButton />
          </I18nextProvider>
        </ThemeProvider>
      </QueryProvider>
    </Providers>
    <GoogleAnalytics /> (conditional on NEXT_PUBLIC_GA_TRACKING_ID)
  </body>
</html>
```

**Fonts**: Geist Sans + Geist Mono (Google Fonts, `variable` mode for CSS custom properties).

**CSP Nonce**: Read from `x-nonce` response header (set by middleware). Applied to JSON-LD scripts.

**Metadata**:

- Title template: `%s | AGI Workforce` (default: `AGI Workforce | Your On-Demand AI Workforce`)
- Description: "Just tell the AI what you want done. No setup, no coding required..."
- OpenGraph: type=website, locale=en_US, image=/app-preview.png (1200x630)
- Twitter: card=summary_large_image, creator=@agiworkforce
- Robots: index=true, follow=true
- Authors: AGI Automation LLC

---

## 4.2 Marketing Homepage (`/`) -- `app/page.tsx`

**Route**: `/`
**Purpose**: Primary landing page. Convert visitors to downloads or signups.
**Component**: React Server Component.
**Layout**: Full-width, black background, white text. No sidebar.

### Layout Structure

```
<Header />                          <!-- Fixed, glass-blur navigation -->
<main>
  [Hero Section]                    <!-- py-20 to py-40 responsive -->
  [Features Grid Section]           <!-- 2x3 grid on desktop -->
  [Stats Section]                   <!-- 4-column grid -->
  [Security Section]                <!-- 2-column: copy + card -->
  <CtaSection />                    <!-- Final call-to-action -->
</main>
<MarketingFooter />                 <!-- Links grid + copyright -->
```

### Hero Section

**Badge**: Pill-shaped, blue glow: "Now in Public ALPHA"
**Headline**: `<h1>` "AGI WORKFORCE" -- gradient text (white to zinc-500), text-5xl to text-8xl responsive, bold, tracking-tight, whitespace-nowrap.
**Subheadline**: "A native desktop AI agent with chat, browser automation, multi-provider model support, and tool execution -- available on macOS, Windows, and Linux."
**Primary CTA**: Blue rounded-full button "Download Desktop App" with ArrowRight icon. Links to `/download`.
**Secondary CTA**: Outlined button "Read Documentation". Links to `/docs`.
**Trust indicators** (below CTAs):

- "Available on macOS, Windows, and Linux" (green check)
- "OpenAI, Anthropic, Google, xAI, DeepSeek, and Ollama" (green check)
- "Browser automation, file management, and terminal tools" (green check)
- "Your data never leaves your machine" (green check)

**Application Preview**: `<ApplicationPreview />` component below trust indicators.

### Features Grid Section

**Title**: "Everything You Need"
**Subtitle**: "AGI Workforce ships a complete set of AI automation tools out of the box."
**Grid**: 3 columns on desktop, 2 on tablet, 1 on mobile. 6 feature cards:

| Icon          | Title                 | Description                                                                                                          | Link                |
| ------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Users         | 169+ AI Skills        | Pre-built AI specialists across healthcare, legal, finance, creative, education, and more...                         | /features/ai-skills |
| Plug          | Unlimited MCP Plugins | Connect any MCP tool -- file systems, databases, APIs, browsers, and cloud services...                               | /features/plugins   |
| Wrench        | Desktop Automation    | Native computer use: browser control, terminal commands, file management, screen capture...                          | /features/tools     |
| Bot           | Parallel AI Agents    | Swarm orchestration decomposes tasks, spawns parallel agents, and aggregates results...                              | /features/agents    |
| MessageSquare | Agentic Chat          | Chat interface with real-time tool execution, inline results, reasoning traces...                                    | /features/ai-chat   |
| Lock          | Privacy-First Design  | All processing happens locally on your machine. Conversations, files, and API keys never pass through our servers... | /security           |

Each card: rounded-2xl border, hover:border-blue-500/50, "Learn more" link with ArrowRight icon.

### Stats Section

4-column grid (centered):
| Stat | Label | Detail |
|---|---|---|
| 169+ | AI Skills | Healthcare, legal, finance, creative, and more |
| 12+ | AI Providers | OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Ollama |
| (infinity) | MCP Tools | Unlimited plugins via Model Context Protocol |
| 3 | Platforms | macOS, Windows, and Linux desktop + mobile |

### Security Section

**Two-column layout**: Left (copy), Right (card).

Left column:

- Badge: "Privacy-First Architecture" (emerald)
- Headline: "Your Code Never Leaves Your Machine"
- 3 items with icons:
  1. Lock: "Local Processing Only" -- "Every conversation is processed on your machine using your own API keys..."
  2. Shield: "Bring Your Own Keys" -- "API keys are encrypted locally with AES-256..."
  3. CheckCircle2: "Run Fully Offline" -- "Connect Ollama or LM Studio for 100% offline operation..."

Right column: Card showing "Where Your Data Lives" table:
| Item | Location |
|---|---|
| Conversations | Your machine only |
| API Keys | Encrypted locally (AES-256) |
| Files & Documents | Your machine only |
| Model Calls | Direct to provider API |
| AGI Workforce servers | None (emerald highlight) |

### CTA Section (`<CtaSection />`)

**Headline**: "Start automating today"
**Body**: "Download the desktop app and connect your preferred AI provider in minutes. No infrastructure required."
**Button**: "Download Desktop App" -> `/download`

### Footer (`<MarketingFooter />`)

Links: AI Skills, Plugins, Tools, Agents, Pricing, Docs, About, Privacy, Terms.
Copyright: (year) AGI Automation LLC. All rights reserved.

---

## 4.3 Header Component (`components/layout/Header.tsx`)

**Type**: Client Component (checks auth state).
**Position**: Fixed top, z-50, glass blur (bg-black/50 backdrop-blur-xl).
**Height**: h-16 (64px).

**Logo**: Bot icon (blue-500) + "AGI Workforce" text. Links to `/`.

**Desktop Navigation** (hidden on mobile):

- Features dropdown (hover-triggered, 420px wide, 7 feature items with icon + name + description)
- Security, Pricing, About, FAQ, Contact (static links)
- Dashboard (shown when logged in)

**Right section** (desktop):

- Logged out: "Sign In" link + "Download ALPHA" button (white bg, rounded-full)
- Logged in: Email display + "Sign Out" button + "Dashboard" button (blue-600)

**Mobile navigation**:

- Hamburger/X toggle button
- Slide-down menu with all nav items
- Features sub-menu (expandable)

**State variations**:

- Anonymous: Sign In + Download ALPHA
- Authenticated: Email + Sign Out + Dashboard

---

## 4.4 Login Page (`/login`) -- `app/login/page.tsx`

**Route**: `/login`
**Purpose**: Authenticate existing users.
**Component**: Client Component (wrapped in Suspense).
**Layout**: Centered card on black background, max-w-md.

### Structure

```
<Logo: Bot + "AGI Workforce" />
<h2>Welcome back</h2>
<p>Sign in to your account to continue</p>

[OAuth Row: GitHub | Google]        <!-- 2-column grid -->
[Divider: "Or continue with email"]
<form>
  <Input: Email />
  [SSO Panel (conditional)]         <!-- Blue banner when SSO domain detected -->
  <Input: Password (hidden when SSO active) />
  <Button: "Sign in with Magic Link" (hidden when SSO active) />
  [Message display (error/success)]
  <Link: Forgot your password? />
  <Button: "Sign In" />
</form>
<p>Don't have an account? <Link: Sign up /></p>
```

### Interaction Flows

1. **Email + Password**: User enters email and password, clicks "Sign In". On success, redirects to `redirectTo` param (default: `/chat`). On failure, shows inline error message.
2. **GitHub OAuth**: Clicks GitHub button -> redirects to GitHub -> returns to `/auth/callback?next=<redirectTo>`.
3. **Google OAuth**: Same flow as GitHub.
4. **Magic Link**: User enters email, clicks "Sign in with Magic Link". Shows success message "Magic link sent! Check your email to sign in."
5. **SSO Auto-Detection**: When user types an email with a domain that has SSO configured (checked via `/api/auth/sso-check?domain=` with 400ms debounce), the password field hides and a blue SSO panel appears with "Continue with SSO" button. Clicking it redirects to the IdP.

### State Variations

| State                       | Display                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| Default                     | Email + Password fields, OAuth buttons                               |
| Loading (password)          | "Signing in..." on submit button, disabled                           |
| Loading (magic link)        | "Sending..." on magic link button, disabled                          |
| Loading (SSO)               | "Redirecting to your identity provider..."                           |
| Error (invalid credentials) | Red bordered message: "Invalid email or password. Please try again." |
| Error (email not confirmed) | Red message: "Please confirm your email address..."                  |
| SSO detected                | Blue panel with "Your organization uses single sign-on (SSO)."       |
| Magic link sent             | Green message: "Magic link sent! Check your email to sign in."       |

### Error Messages

- `Invalid email or password. Please try again.`
- `Please confirm your email address before signing in. Check your inbox for the confirmation link.`
- (Generic fallback): Raw Supabase error message

### Safe Redirect

The `redirectTo` query parameter is validated via `getSafeRedirectUrl()` to prevent open redirect attacks. Only relative paths and same-origin URLs are allowed. Default fallback: `/chat`.

---

## 4.5 Signup Page (`/signup`) -- `app/signup/page.tsx`

**Route**: `/signup`
**Purpose**: Register new users.
**Component**: Client Component.
**Layout**: Centered card on black background, max-w-md.

### Structure

```
<Logo: Bot + "AGI Workforce" />
<h2>Create an account</h2>
<p>Start building your AI workforce today</p>

[OAuth Row: GitHub | Google]
[Divider: "Or sign up with email"]
<form>
  <Input: Full name />
  <Input: Email />
  <Input: Password (with strength indicator) />
  <Input: Confirm Password />
  [Error display]
  <Button: "Sign Up" />
</form>
<p>Already have an account? <Link: Sign in /></p>
```

### Password Strength Validation

Real-time client-side validation via `validatePassword()` from `lib/password-validator.ts`. Shows:

- Green checkmark: "Password meets requirements" (when all rules pass)
- Amber warnings with AlertCircle icon for each failing rule
- Hint text when empty: "Requires: ..." (from `getPasswordRequirementsText()`)

### Signup Success State

After successful signup (when email confirmation is required), the page transitions to a success view:

```
<CheckCircle2 icon (green) />
<h2>Check your email</h2>
<p>We've sent a confirmation link to</p>
<p class="font-medium">{email}</p>
<Card>
  <Mail icon> Click the link in the email to verify your account
</Card>
<p>Didn't receive the email? Check your spam folder.</p>
<Button: "Resend Verification Email" /> (max 3 attempts)
<Button: "Back to Sign In" />
```

### Error Handling

- **Existing user**: Amber message "An account with this email already exists. Please sign in instead." with link to `/login`.
- **Password mismatch**: "Passwords do not match"
- **Generic error**: Raw Supabase error message

---

## 4.6 Forgot Password (`/forgot-password`) -- `app/forgot-password/page.tsx`

**Route**: `/forgot-password`
**Purpose**: Initiate password reset via email.
**Layout**: Has its own layout wrapper.

---

## 4.7 Update Password (`/auth/update-password`) -- `app/auth/update-password/page.tsx`

**Route**: `/auth/update-password`
**Purpose**: Set new password after reset link click.
**Layout**: Has its own layout wrapper.

---

## 4.8 Auth Callback (`/auth/callback`) -- `app/auth/callback/route.ts`

**Route**: `/auth/callback`
**Purpose**: Handle OAuth/magic link/SSO callback, exchange code for session, redirect to `next` param.
**Type**: Route handler (not a page).

---

## 4.9 Auth Error (`/auth/error`) -- `app/auth/error/page.tsx`

**Route**: `/auth/error`
**Purpose**: Display auth-related errors (invalid token, expired link, etc.).

---

## 4.10 Verify Email (`/verify`) -- `app/verify/page.tsx`

**Route**: `/verify`
**Purpose**: Email verification landing page.
**Component**: Server Component with client-side verify component.

---

## 4.11 Pricing Page (`/pricing`) -- `app/pricing/page.tsx`

**Route**: `/pricing`
**Purpose**: Display subscription tiers and convert to checkout.
**Component**: Client Component (wrapped in Suspense).
**Layout**: Full-width, black background, Header at top.

### Structure

```
<Header />
<main>
  <h1>Simple pricing for your AI workforce</h1>
  <p>Start free, upgrade when you're ready...</p>
  [Subscription Required Banner] (conditional, via ?reason=subscription_required)
  [Billing Interval Toggle: Monthly | Yearly (Save up to 50%)]
  [Pricing Cards: 3-column grid]
  [Feature Comparison Table]
</main>
```

### Pricing Cards

#### Hobby Card

- **Border**: emerald-500/50, glow shadow
- **Badges**: "Special Offer for First Time Users" (annual) / "Launch Offer" (monthly) + "Save 50%" (annual)
- **Title**: "Hobby"
- **Description**: "Perfect for getting started with AI automation during our public ALPHA."
- **Price**: $4.99/month (annual) or $10/month (monthly)
- **Billing note**: "$59.88 billed yearly" or "$10/month billed monthly"
- **Features**:
  - Local LLMs: Ollama (open-source models)
  - Economy Models: OpenAI, Google, DeepSeek
  - Code Execution: Terminal access included
  - Vision: Analyze uploaded images
  - Web Search: Search the web for information
- **Button**: "Subscribe" (emerald-600) or "Update to Hobby Yearly"/"Upgrade to Hobby"/"Manage Subscription" (context-dependent)

#### Pro Card

- **Border**: blue-500
- **Badge**: "Recommended" with Zap icon
- **Title**: "Pro"
- **Description**: "Unlimited automations and advanced tools."
- **Price**: $24.99/month (annual) or $29.99/month (monthly)
- **Billing note**: "Billed $299.88 yearly" or "Billed $29.99 monthly"
- **Features**:
  - Pro Models: Anthropic, OpenAI, Google
  - Web Search: Perplexity with citations
  - Browser Agent: Autonomous web automation
  - Media Generation: Images & videos (Runway)
  - Code Execution: Run code in terminal
  - Unlimited Workspaces: RAG & knowledge base
- **Note**: "\* Limits apply to prevent abuse"
- **Button**: "Join Waitlist" (or "Joined Waitlist" when already joined)

#### Max Card

- **Border**: purple-500
- **Badge**: "Power User" with Sparkles icon
- **Title**: "Max"
- **Description**: "For heavy workloads and complex workflows."
- **Price**: $249.99/month (annual) or $299.99/month (monthly)
- **Billing note**: "Billed $2,999.88 yearly" or "Billed $299.99 monthly"
- **Features**:
  - Flagship Models: Anthropic, OpenAI, Google
  - Computer Use: Full desktop automation
  - Premium Video: 4K with Veo 3 & Sora
  - Deep Research: Multi-source synthesis
  - 2M Context: Process long documents
  - Cross-App Workflows: Automate between apps
- **Note**: "\* Limits apply to prevent abuse"
- **Button**: "Join Waitlist" (or "Joined Waitlist")

### Feature Comparison Table

14-row table comparing Hobby, Pro, Max across: Data Privacy, Local LLMs, Cloud Models, Web Search, Image Generation, Video Generation, Browser Automation, Desktop Automation, Workspaces, Code Execution, Context Window, Vision & Screen, Audio & Music, Priority Support.

### Checkout Flow

1. User clicks "Subscribe" on Hobby card
2. POST `/api/checkout` with `{ plan: "hobby", billingInterval: "monthly"|"annual" }`
3. If 401: redirect to `/signup?next=/pricing`
4. If success: redirect to Stripe Checkout URL (`data.url`)
5. Stripe Checkout -> success callback -> `/dashboard?success=true`
6. Stripe Checkout -> cancel -> return to `/pricing`
7. On error: toast notification with error message

### Waitlist Flow

1. User clicks "Join Waitlist" on Pro or Max card
2. POST `/api/waitlist` with `{ plan, billingInterval, source: "pricing" }`
3. If 401: redirect to `/signup?next=/pricing`
4. On success: button changes to "Joined Waitlist" (disabled), toast "Joined!!"
5. State persisted via GET `/api/waitlist` on page load

---

## 4.12 Download Page (`/download`) -- `app/download/page.tsx`

**Route**: `/download`
**Purpose**: Provide desktop app download links for macOS, Windows, Linux.
**Component**: Client Component.
**Layout**: Has its own layout (custom header, no marketing Header component).

### Structure

```
<Custom header: Logo + Dashboard/Sign In + Back to Home>
<main>
  <h1>Download AGI Workforce</h1>
  <p>Just tell the AI what you want done. No setup required...</p>
  <DownloadSection />               <!-- Platform-specific download buttons -->
  <DirectDownloadButtons />         <!-- Direct .dmg/.exe/.AppImage links -->
  <p>By downloading, you agree to our Terms of Service and Privacy Policy.</p>
</main>
<footer>
  <copyright>
</footer>
```

### Download URLs

Configured via environment variables:

- `NEXT_PUBLIC_DOWNLOAD_URL_MAC` (fallback: `/downloads/agiworkforce.dmg`)
- `NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS` (fallback: `/api/download?platform=windows`)
- `NEXT_PUBLIC_DOWNLOAD_URL_LINUX` (fallback: `/api/download?platform=linux`)

### State Variations

- **Anonymous**: Shows "Sign In" link in header
- **Authenticated**: Shows "Dashboard" link in header

---

## 4.13 Dashboard (`/dashboard`) -- `app/dashboard/`

**Route**: `/dashboard`
**Purpose**: Authenticated user hub with usage stats, recent conversations, and quick actions.
**Component**: Client Component with DashboardLayout wrapper.
**Auth**: Required (redirects to `/login` if unauthenticated).

### Dashboard Layout (`app/dashboard/layout.tsx`)

```
<DashboardHeader onMenuClick />     <!-- Fixed top bar, h-14 -->
<div class="flex pt-14">
  <DashboardSidebar />              <!-- Fixed left, collapsible (60px / 240px) -->
  <main>{children}</main>           <!-- Flex-1, margin-left transitions -->
</div>
```

**Mobile**: Sidebar is hidden by default, slides in from left on menu click with overlay backdrop. Closes on Escape key or overlay click.

### Dashboard Home (`/dashboard`)

Renders `<DashboardHome />` from `features/pages/DashboardHome.tsx`. Contains:

- Welcome message
- Quick action cards (New Chat, Manage Subscription, etc.)
- Recent conversations list
- Usage summary widgets
- Credit monitor

### Dashboard Sub-Pages

| Route                            | Purpose                                    | Component               |
| -------------------------------- | ------------------------------------------ | ----------------------- |
| `/dashboard/agents`              | AI agent management                        | `features/pages/`       |
| `/dashboard/billing`             | Billing dashboard (subscription, invoices) | `features/billing/`     |
| `/dashboard/chat`                | Dashboard chat view                        | Chat redirect           |
| `/dashboard/connectors`          | Manage external connectors                 | `features/connectors/`  |
| `/dashboard/hire`                | Workforce marketplace                      | `features/marketplace/` |
| `/dashboard/integrations/github` | GitHub app installations                   | Custom                  |
| `/dashboard/media`               | Media studio (image/video gallery)         | `features/media/`       |
| `/dashboard/settings`            | Account settings                           | `features/settings/`    |
| `/dashboard/settings/ai`         | AI model configuration                     | `features/settings/`    |
| `/dashboard/support`             | Support tickets                            | `features/support/`     |
| `/dashboard/usage`               | Token usage analytics                      | Custom                  |
| `/dashboard/vibe`                | Vibe coding workspace                      | `features/vibe/`        |

Each sub-page has a dedicated `loading.tsx` for Suspense boundaries where applicable (billing, chat, settings, usage).

---

## 4.14 Chat Interface (`/chat`) -- `app/chat/page.tsx`

**Route**: `/chat` (new chat), `/chat/[sessionId]` (existing session)
**Purpose**: Full-featured web chat experience.
**Component**: Client Component.
**Layout**: Has its own layout (`app/chat/layout.tsx` + `ChatLayoutShell.tsx`).

### Structure

```
<div class="flex h-full">
  [Mobile sidebar overlay]
  [Mobile sidebar (slide-in, 280px)]
  <ChatSidebarNew />                <!-- Desktop sidebar (280px or 16px collapsed) -->
  <main class="flex-1">
    [Mobile header bar]             <!-- Hamburger + "AGI Workforce" -->
    [Empty State / Welcome]         <!-- Shown when no session active -->
    <ChatComposerNew />             <!-- Bottom-pinned input area -->
  </main>
</div>
```

### Empty State (No Active Session)

```
<Sparkles icon in teal gradient circle>
<h1>What can I help you with?</h1>
<p>Ask anything -- I can write, code, research, analyze, and more.</p>
[6 Suggested Prompt Cards, 2-column grid]
```

Suggested prompts:

1. "Explain a concept" -- "Explain quantum computing in simple terms"
2. "Write code" -- "Write a Python script to scrape a website"
3. "Research a topic" -- "What are the latest developments in AI agents?"
4. "Analyze data" -- "Help me analyze this CSV data and find trends"
5. "Draft content" -- "Write a professional email declining a meeting"
6. "Debug an issue" -- "My React component re-renders too many times, help me fix it"

Clicking a prompt: creates a new session, adds user message, navigates to `/chat/[sessionId]`.

### Chat Session View (`/chat/[sessionId]`)

Loads session messages from Supabase, displays message list with streaming support, renders tool calls inline.

### Sidebar (`ChatSidebarNew`)

- Session list (most recent first, truncated preview)
- "New Chat" button
- Select / Delete / Rename sessions
- Collapse toggle (Cmd+Shift+S keyboard shortcut)
- Persistence: collapse state saved to localStorage

### Skill Query Parameter

`/chat?skill=<skillId>` triggers automatic session creation with an assistant greeting message identifying the selected AI skill. Used when navigating from the marketplace.

---

## 4.15 Feature Landing Pages (`/features/*`)

7 feature pages, each a marketing landing page:

| Route                          | Title              | Component                         |
| ------------------------------ | ------------------ | --------------------------------- |
| `/features/agents`             | AI Agents          | Custom                            |
| `/features/ai-chat`            | AI Chat            | `features/pages/AIChatInterface`  |
| `/features/ai-dashboards`      | AI Dashboards      | `features/pages/AIDashboards`     |
| `/features/ai-project-manager` | AI Project Manager | `features/pages/AIProjectManager` |
| `/features/ai-skills`          | AI Skills          | Custom                            |
| `/features/plugins`            | Plugins & MCP      | Custom                            |
| `/features/tools`              | Desktop Tools      | Custom                            |

Each follows the marketing page pattern: Header, hero section, feature details, CTA, footer.

---

## 4.16 Shared Conversation Page (`/share/[token]`) -- `app/share/[token]/page.tsx`

**Route**: `/share/[token]`
**Purpose**: Public read-only view of a shared conversation.
**Auth**: Not required (public).
**Components**: `SharedSessionViewer`, `ExpiredShareBanner`.

---

## 4.17 Marketplace Page (`/marketplace`) -- `app/marketplace/page.tsx`

**Route**: `/marketplace`
**Purpose**: Browse AI employee skills, click to start chat.
**Component**: `features/pages/PublicMarketplace` or `features/marketplace/pages/EmployeeMarketplace`.

---

## 4.18 Workforce Pages

### Workforce Root

**Route**: `/workforce` (implied, via dashboard routing)
**Purpose**: Team/workforce management dashboard.

### Employee Chat

Accessible via workforce management panel. Uses `EmployeeChatInterface` from `features/workforce/components/`.

---

## 4.19 Blog Pages (`/blog`, `/blog/[slug]`)

**Route**: `/blog` -- Blog listing, `/blog/[slug]` -- Individual post
**Component**: `features/pages/BlogList`, `features/pages/BlogPost`
**Content**: Markdown with frontmatter (via gray-matter).

---

## 4.20 Legal Pages

| Route      | Purpose             |
| ---------- | ------------------- |
| `/terms`   | Terms of Service    |
| `/privacy` | Privacy Policy      |
| `/cookies` | Cookie Policy       |
| `/legal`   | Business legal page |

---

## 4.21 Support Pages

| Route            | Purpose                    |
| ---------------- | -------------------------- |
| `/help`          | Help center                |
| `/support`       | Support center             |
| `/contact`       | Contact form               |
| `/contact-sales` | Sales inquiry form         |
| `/faq`           | Frequently asked questions |

---

## 4.22 Diagnostic Pages

| Route          | Purpose                   | Auth          |
| -------------- | ------------------------- | ------------- |
| `/diagnose`    | System diagnostic page    | Admin         |
| `/device-auth` | Device authorization flow | Authenticated |

---

## 4.23 Error Pages

| Route              | Purpose                 |
| ------------------ | ----------------------- |
| `/not-found` (404) | Custom 404 page         |
| `/error`           | Global error boundary   |
| `/payment-failure` | Payment failure handler |

---

# 5. Component Architecture

## 5.1 Component Tree Overview

```
app/
  layout.tsx (RSC)
    providers.tsx (CC: QueryProvider, ThemeProvider, I18nextProvider, CommandPaletteProvider, Toaster)
      [Page Components]

components/
  layout/
    Header.tsx (CC: marketing nav, auth state)
    UserProfile.tsx (CC: avatar, dropdown)
  marketing/
    CtaSection.tsx (RSC: reusable CTA)
    MarketingFooter.tsx (RSC: footer links)
  dashboard/
    DashboardLayout.tsx (CC: sidebar + header + content)
    Sidebar.tsx (CC: nav items)
    CreditMonitor.tsx (CC: credit balance)
  ui/ (35+ primitive components)
    AccessibleDialog, Accordion, Alert, AlertDialog, Badge, Button, Card, Checkbox,
    Collapsible, ConfirmDialog, ContextMenu, Dialog, DropdownMenu, FormField,
    HoverCard, Input, Label, LoadingButton, Popover, Progress, PromptDialog,
    ResizeHandle, ResponsiveContainer, ScrollArea, SectionErrorBoundary, Select,
    Separator, Skeleton, Slider, Spinner, Switch, Table, Tabs, Textarea, Toast,
    Toaster, Tooltip
  UnifiedAgenticChat/ (80+ components)
    index.tsx (main orchestrator)
    AppLayout.tsx
    ChatInputArea.tsx, ChatInputToolbar.tsx, ChatMessageList.tsx, ChatStream.tsx
    MessageBubble/ (sub-components: MessageContent, MessageActions, MessageAvatar, etc.)
    Cards/ (ActiveToolStreams, ApprovalRequestCard, FileOperationCard, etc.)
    InlinePanels/ (Browser, Code, Database, Terminal)
    InlineToolResults/ (13 result type renderers)
    Widgets/ (Chart, Confirmation, DataTable, Diff, Form)
    Visualizations/ (CodeBlock, DiffViewer, TerminalOutputViewer)
    hooks/ (useAttachments, useAutoResize, useChatSubmit, etc.)
  Artifacts/ (ArtifactPanel)
  Auth/ (SignInToDesktop)
  BackgroundTasks/ (BackgroundTasksPanel)
  Browser/ (BrowserVisualization)
  CommandPalette/ (CommandPalette, CommandPaletteProvider)
  CustomInstructions/ (index)
  Editor/ (MonacoEditor)
  Errors/ (ErrorToast)
  Execution/ (TerminalPanel, TimeoutWarningDialog)
  Feedback/ (index)
  Media/ (MediaGallery, MediaStudio)
  Memory/ (MemoryManager)
  ROIDashboard/ (roiStore)
  ScreenCapture/ (ScreenCaptureButton)
  settings/ (AppearanceSettings, ChatSettings, CustomModelsSettings)
  share/ (ExpiredShareBanner, SharedSessionViewer)
  SimpleMode/ (SimpleModeToggle)
  stripe/ (ManageBillingButton)
  Subscription/ (SubscriptionGate, SubscriptionLockDialog, tiers)
  ToolCalling/ (DiffViewer, ImagePreview, JsonViewer, TableViewer, ToolApprovalDialog,
                ToolCallCard, ToolErrorDisplay, ToolExecutionTimeline, ToolResultCard)
  accessibility/ (SkipLinks)
```

## 5.2 Feature Modules

```
features/
  billing/
    hooks/ (use-billing-queries)
    pages/ (BillingDashboard)
    services/ (credit-tracking, stripe-payments, token-pack-purchase, usage-monitor)
  chat/
    components/
      agents/ (AgentParticipantPanel, EmployeeSelector, EmployeeThinkingIndicator, EmployeeWorkStream)
      artifacts/ (ArtifactPreview, ArtifactsPanel, DocumentActions, DocumentMessage, ImageAttachmentPreview)
      Composer/ (ChatComposer, ChatComposerNew, ComposerFooter, DragDropOverlay, FocusModeButtons, InputFooter, SendButton, SlashCommandMenu)
      dialogs/ (BookmarksDialog, CreateBranchDialog, CustomShortcutDialog, EnhancedExportDialog, GlobalSearchDialog, KeyboardShortcutsDialog, ShareDialog, TokenAnalyticsDialog, UsageWarningModal)
      Main/ (ChatHeader, ChatTopBar, MessageList, MultiAgentChatInterface)
      messages/ (AdvancedMessageList, AudioPlayer, AudioVisualizer, ChatInput, CollaborativeMessageDisplay, EnhancedMarkdownRenderer, EnhancedMessageInput, MessageActions, MessageBubble, MessageListNew, ReasoningAccordion, ToolTimeline, TypingIndicator)
      search/ (SearchResults)
      shortcuts/ (PromptShortcuts)
      Sidebar/ (ChatSidebar, ChatSidebarNew, ConversationListItem, FolderManagement)
      tokens/ (TokenAnalyticsDashboard, TokenBalanceDisplay, TokenUsageDisplay, UsageWarningBanner)
      Tools/ (ModeSelector)
      workflows/ (CollaborativeChatInterface, CollaborativeTaskView, ToolProgressIndicator, WorkflowDisplay, WorkingProcess)
    hooks/ (15 custom hooks)
    pages/ (ChatInterface)
    services/ (20+ service files)
    stores/ (chat-store, artifacts-store)
    types/ (index)
    utils/ (artifact-detector, retry-handler)
  connectors/
    pages/ (ConnectorsPage)
  marketplace/
    components/ (EmployeeCard, skeletons)
    hooks/ (use-marketplace-queries)
    pages/ (EmployeeMarketplace)
  media/
    pages/ (MediaStudio)
    services/ (media-api-service)
  mission-control/
    services/ (background-conversation-handler)
  pages/ (12 standalone page components)
  settings/
    hooks/ (use-settings-queries)
    pages/ (AIConfiguration, SettingsPage, UserSettings)
    schemas/ (settings-validation)
    services/ (totp-2fa, user-preferences)
  support/
    pages/ (SupportPage)
    services/ (support-service)
  vibe/ (full vibe coding feature)
    components/ (30+ components across 7 sub-directories)
    hooks/ (14 custom hooks)
    layouts/ (VibeLayout, VibeSplitView, VibeTopNav)
    pages/ (VibeDashboard)
    sdk/ (13 SDK modules: client, session, protocol, streaming, etc.)
    services/ (16 service files)
    stores/ (4 stores: vibe-agent, vibe-chat, vibe-file, vibe-view)
    types/ (4 type files)
    utils/ (code-parser, file-tree)
  workforce/
    components/ (EmployeeChatInterface, EmployeeManagementPanel, EmployeeMarketplace, TeamChatInterface)
    hooks/ (use-workforce-queries)
    pages/ (EmployeeManagement)
    services/ (employee-database)
```

## 5.3 State Management (Zustand Stores)

### Top-Level Stores (`stores/`)

| Store File            | Purpose                            | Persistence  |
| --------------------- | ---------------------------------- | ------------ |
| `agentStatusStore.ts` | Agent lifecycle status tracking    | No           |
| `artifactStore.ts`    | Generated artifact management      | No           |
| `chatStore.ts`        | Legacy chat state (being migrated) | No           |
| `mediaStore.ts`       | Media generation state             | No           |
| `memoryStore.ts`      | User memory/context storage        | No           |
| `schedulerStore.ts`   | Background task scheduling         | No           |
| `settingsStore.ts`    | App settings and preferences       | localStorage |
| `uiStore.ts`          | UI state (modals, panels, etc.)    | No           |

### Unified Stores (`stores/unified/`)

| Store File                   | Purpose                     | Persistence  |
| ---------------------------- | --------------------------- | ------------ |
| `accountStore.ts`            | User account state          | No           |
| `artifactStore.ts`           | Unified artifact management | No           |
| `auth.ts`                    | Authentication state        | No           |
| `automationStore.ts`         | Automation workflow state   | No           |
| `billingUsage.ts`            | Billing and usage tracking  | No           |
| `browserStore.ts`            | Browser automation state    | No           |
| `chat/chatStore.ts`          | Unified chat state          | No           |
| `chat/agentStore.ts`         | Agent state within chat     | No           |
| `chat/toolStore.ts`          | Tool execution tracking     | No           |
| `chat/types.ts`              | Chat type definitions       | N/A          |
| `cloudStore.ts`              | Cloud sync state            | No           |
| `codeStore.ts`               | Code editing state          | No           |
| `customInstructionsStore.ts` | Custom system prompts       | localStorage |
| `errorStore.ts`              | Error tracking              | No           |
| `executionStore.ts`          | Code execution state        | No           |
| `mcpStore.ts`                | MCP connection state        | No           |
| `mediaGenerationStore.ts`    | Media generation queue      | No           |
| `memoryStore.ts`             | Unified memory management   | No           |
| `modelStore.ts`              | Model selection and config  | localStorage |
| `projectStore.ts`            | Project/workspace state     | No           |
| `settingsStore.ts`           | Unified settings            | localStorage |
| `terminalStore.ts`           | Terminal output state       | No           |
| `ui.ts`                      | Unified UI state            | No           |
| `unifiedChatStore.ts`        | Primary chat state manager  | No           |
| `updaterStore.ts`            | App update state            | No           |
| `usageStore.ts`              | Token usage tracking        | No           |

### Feature-Specific Stores

| Store                 | Location                   | Purpose                  |
| --------------------- | -------------------------- | ------------------------ |
| `chat-store.ts`       | `features/chat/stores/`    | Feature-level chat state |
| `artifacts-store.ts`  | `features/chat/stores/`    | Chat artifacts           |
| `vibe-agent-store.ts` | `features/vibe/stores/`    | Vibe agent state         |
| `vibe-chat-store.ts`  | `features/vibe/stores/`    | Vibe chat state          |
| `vibe-file-store.ts`  | `features/vibe/stores/`    | Vibe file system state   |
| `vibe-view-store.ts`  | `features/vibe/stores/`    | Vibe UI view state       |
| `roiStore.tsx`        | `components/ROIDashboard/` | ROI calculation state    |

## 5.4 React Server Components vs Client Components

**Server Components** (default in Next.js App Router):

- `app/layout.tsx` -- root layout
- `app/page.tsx` -- marketing homepage
- `app/robots.ts`, `app/sitemap.ts` -- SEO files
- Marketing pages that can be statically rendered

**Client Components** (marked with `'use client'`):

- All interactive pages (login, signup, pricing, chat, dashboard)
- All components that use React hooks (useState, useEffect, useCallback)
- All components that access browser APIs (localStorage, window, navigator)
- All Zustand store consumers
- All Supabase client users

**Pattern**: Pages that need interactivity are Client Components. Pages that are purely informational may use RSC for initial render with Client Component children for interactive sections.

---

# 6. Data Flow & API Connections

## 6.1 API Route Inventory

The web application exposes 70+ API route handlers under `/api/`. All routes are Next.js Route Handlers (App Router).

### 6.1.1 Authentication Routes

| Method | Route                         | Purpose                                              | Auth | Rate Limit    |
| ------ | ----------------------------- | ---------------------------------------------------- | ---- | ------------- |
| GET    | `/auth/callback`              | OAuth/magic link callback, exchange code for session | No   | N/A           |
| POST   | `/api/auth/desktop-token`     | Generate token for desktop app login                 | Yes  | N/A           |
| GET    | `/api/auth/sso-check?domain=` | Check if domain has SSO configured                   | No   | N/A           |
| GET    | `/api/me`                     | Get current user profile                             | Yes  | `me` (60/min) |
| GET    | `/api/csrf`                   | Get CSRF token for current session                   | No   | N/A           |

### 6.1.2 Billing & Subscription Routes

| Method   | Route                         | Purpose                               | Auth          | Rate Limit                   |
| -------- | ----------------------------- | ------------------------------------- | ------------- | ---------------------------- |
| POST     | `/api/checkout`               | Create Stripe Checkout session        | Yes           | `checkout` (15/min)          |
| POST     | `/api/portal`                 | Create Stripe Customer Portal session | Yes           | `portal` (10/min)            |
| POST     | `/api/stripe-webhook`         | Handle Stripe webhook events          | No (verified) | `stripe-webhook` (100/min)   |
| POST     | `/api/sync-subscription`      | Sync subscription status from Stripe  | Yes           | `sync-subscription` (10/min) |
| POST     | `/api/credit-topup`           | Create credit top-up checkout         | Yes           | `credit-topup` (15/min)      |
| GET      | `/api/llm/v1/credits/balance` | Get credit balance                    | Yes           | `credits-balance` (60/min)   |
| POST     | `/api/claim-offer`            | Claim promotional offer               | Yes           | `claim-offer` (3/hr)         |
| POST     | `/api/cron/reset-credits`     | Cron: reset monthly credits           | Cron secret   | N/A                          |
| GET      | `/api/usage`                  | Get usage statistics                  | Yes           | N/A                          |
| GET/POST | `/api/waitlist`               | Join/check waitlist status            | Yes           | N/A                          |

### 6.1.3 Chat & Conversation Routes

| Method         | Route                                   | Purpose                        | Auth | Rate Limit                   |
| -------------- | --------------------------------------- | ------------------------------ | ---- | ---------------------------- |
| GET/POST       | `/api/chat/conversations`               | List/create conversations      | Yes  | `chat-conversation` (60/min) |
| GET/PUT/DELETE | `/api/chat/conversations/[id]`          | Get/update/delete conversation | Yes  | `chat-conversation` (60/min) |
| GET/POST       | `/api/chat/conversations/[id]/messages` | List/add messages              | Yes  | `chat-message` (20/min)      |
| POST           | `/api/completion`                       | Ghost-text prompt completion   | Yes  | `prompt-completion` (60/min) |

### 6.1.4 LLM Proxy Routes

| Method | Route                              | Purpose                           | Auth | Rate Limit                     |
| ------ | ---------------------------------- | --------------------------------- | ---- | ------------------------------ |
| POST   | `/api/llm/completion`              | LLM completion (legacy)           | Yes  | `llm-completion` (30/min)      |
| POST   | `/api/llm/v1/chat/completions`     | OpenAI-compatible chat completion | Yes  | `llm-streaming` (20/min)       |
| GET    | `/api/llm/v1/models`               | List available models             | Yes  | `model-catalog` (120/min)      |
| POST   | `/api/llm/v1/audio/transcriptions` | Audio transcription               | Yes  | `audio-transcription` (20/min) |
| POST   | `/api/llm/v2/chat`                 | V2 chat completion (AI SDK)       | Yes  | `llm-streaming` (20/min)       |

### 6.1.5 Model & Configuration Routes

| Method | Route                         | Purpose                        | Auth | Rate Limit                |
| ------ | ----------------------------- | ------------------------------ | ---- | ------------------------- |
| GET    | `/api/models`                 | Public model catalog           | No   | `model-catalog` (120/min) |
| POST   | `/api/settings/test-provider` | Test LLM provider connectivity | Yes  | N/A                       |

### 6.1.6 Media Generation Routes

| Method | Route                       | Purpose                       | Auth | Rate Limit                  |
| ------ | --------------------------- | ----------------------------- | ---- | --------------------------- |
| POST   | `/api/media/image/generate` | Generate image (DALL-E, etc.) | Yes  | `image-generation` (10/min) |
| POST   | `/api/media/video/generate` | Generate video (Runway, etc.) | Yes  | `video-generation` (5/min)  |
| GET    | `/api/media/video/status`   | Poll video generation status  | Yes  | `video-status` (30/min)     |

### 6.1.7 Voice Routes

| Method | Route                   | Purpose                    | Auth | Rate Limit                     |
| ------ | ----------------------- | -------------------------- | ---- | ------------------------------ |
| POST   | `/api/voice/transcribe` | Transcribe audio to text   | Yes  | `audio-transcription` (20/min) |
| GET    | `/api/voice/health`     | Voice service health check | No   | N/A                            |

### 6.1.8 Memory Routes

| Method         | Route                | Purpose                      | Auth | Rate Limit |
| -------------- | -------------------- | ---------------------------- | ---- | ---------- |
| GET/POST       | `/api/memory`        | List/create memories         | Yes  | N/A        |
| GET/PUT/DELETE | `/api/memory/[id]`   | Get/update/delete memory     | Yes  | N/A        |
| POST           | `/api/memory/search` | Search memories              | Yes  | N/A        |
| POST           | `/api/memory/sync`   | Sync memories across devices | Yes  | N/A        |

### 6.1.9 Agent Routes

| Method         | Route                            | Purpose                     | Auth | Rate Limit |
| -------------- | -------------------------------- | --------------------------- | ---- | ---------- |
| POST           | `/api/agents/execute`            | Execute agent action        | Yes  | N/A        |
| POST           | `/api/agents/session`            | Create/manage agent session | Yes  | N/A        |
| POST           | `/api/agents/collaboration`      | Multi-agent collaboration   | Yes  | N/A        |
| GET/POST       | `/api/agents/communication`      | Agent communication channel | Yes  | N/A        |
| GET/PUT/DELETE | `/api/agents/communication/[id]` | Specific agent channel      | Yes  | N/A        |

### 6.1.10 Share Routes

| Method | Route                | Purpose                         | Auth | Rate Limit             |
| ------ | -------------------- | ------------------------------- | ---- | ---------------------- |
| POST   | `/api/share`         | Create shared conversation link | Yes  | `share-create` (5/min) |
| GET    | `/api/share/[token]` | Get shared conversation data    | No   | `share-view` (60/min)  |

### 6.1.11 Device Linking Routes

| Method | Route                 | Purpose                      | Auth | Rate Limit             |
| ------ | --------------------- | ---------------------------- | ---- | ---------------------- |
| POST   | `/api/device/link`    | Generate device pairing code | Yes  | `device-link` (10/min) |
| POST   | `/api/device/approve` | Approve device pairing       | Yes  | N/A                    |
| GET    | `/api/device/poll`    | Poll for device approval     | Yes  | `device-poll` (10/s)   |

### 6.1.12 Download & Release Routes

| Method | Route                              | Purpose                           | Auth | Rate Limit                |
| ------ | ---------------------------------- | --------------------------------- | ---- | ------------------------- |
| GET    | `/api/download`                    | Get download URL for platform     | No   | `download` (30/min)       |
| GET    | `/api/download-beta`               | Get beta download URL             | No   | `download-beta` (10/min)  |
| GET    | `/api/releases/check`              | Check for updates (Tauri updater) | No   | `release-check` (60/min)  |
| GET    | `/api/releases/latest/[platform]`  | Get latest release manifest       | No   | `release-latest` (60/min) |
| GET    | `/api/releases/[target]/[version]` | Get specific release artifact     | No   | N/A                       |

### 6.1.13 Marketplace & Workforce Routes

| Method   | Route              | Purpose                 | Auth | Rate Limit |
| -------- | ------------------ | ----------------------- | ---- | ---------- |
| GET      | `/api/marketplace` | List marketplace skills | No   | N/A        |
| GET/POST | `/api/workforce`   | Workforce management    | Yes  | N/A        |

### 6.1.14 Autotag Routes

| Method | Route                        | Purpose                      | Auth | Rate Limit |
| ------ | ---------------------------- | ---------------------------- | ---- | ---------- |
| POST   | `/api/autotag/classify`      | Classify conversation topic  | Yes  | N/A        |
| POST   | `/api/autotag/batch`         | Batch classify conversations | Yes  | N/A        |
| GET    | `/api/autotag/conversations` | Get tagged conversations     | Yes  | N/A        |

### 6.1.15 Schedule Routes

| Method         | Route                      | Purpose                        | Auth | Rate Limit |
| -------------- | -------------------------- | ------------------------------ | ---- | ---------- |
| GET/POST       | `/api/schedules`           | List/create schedules          | Yes  | N/A        |
| GET/PUT/DELETE | `/api/schedules/[id]`      | Manage specific schedule       | Yes  | N/A        |
| GET            | `/api/schedules/[id]/runs` | Get schedule execution history | Yes  | N/A        |

### 6.1.16 Admin Routes

| Method   | Route                       | Purpose                   | Auth  | Rate Limit                |
| -------- | --------------------------- | ------------------------- | ----- | ------------------------- |
| GET/POST | `/api/admin/security`       | Security audit operations | Admin | `admin-security` (10/min) |
| GET/POST | `/api/admin/sso`            | SSO configuration         | Admin | N/A                       |
| POST     | `/api/admin/directory-sync` | SCIM directory sync       | Admin | N/A                       |

### 6.1.17 Messaging Routes

| Method   | Route                              | Purpose                          | Auth | Rate Limit |
| -------- | ---------------------------------- | -------------------------------- | ---- | ---------- |
| GET/POST | `/api/messaging/config`            | Messaging platform configuration | Yes  | N/A        |
| GET/PUT  | `/api/messaging/config/[platform]` | Platform-specific config         | Yes  | N/A        |
| GET      | `/api/messaging/stats/[platform]`  | Messaging statistics             | Yes  | N/A        |
| POST     | `/api/messaging/test/[platform]`   | Test messaging integration       | Yes  | N/A        |

### 6.1.18 GitHub Integration Routes

| Method | Route                       | Purpose                      | Auth          | Rate Limit                 |
| ------ | --------------------------- | ---------------------------- | ------------- | -------------------------- |
| GET    | `/api/github/install`       | GitHub App installation link | Yes           | N/A                        |
| GET    | `/api/github/installations` | List GitHub installations    | Yes           | N/A                        |
| POST   | `/api/github/webhook`       | GitHub webhook handler       | No (verified) | `github-webhook` (200/min) |

### 6.1.19 User Data Routes

| Method | Route              | Purpose                 | Auth | Rate Limit                |
| ------ | ------------------ | ----------------------- | ---- | ------------------------- |
| DELETE | `/api/user/data`   | Delete user data (GDPR) | Yes  | `user-data-delete` (3/hr) |
| GET    | `/api/user/export` | Export user data (GDPR) | Yes  | `user-data-export` (5/hr) |

### 6.1.20 Miscellaneous Routes

| Method | Route                          | Purpose                     | Auth          | Rate Limit              |
| ------ | ------------------------------ | --------------------------- | ------------- | ----------------------- |
| GET    | `/api/health`                  | Health check                | No            | `health-check` (30/min) |
| GET    | `/api/connectors`              | List available connectors   | Yes           | N/A                     |
| POST   | `/api/mission`                 | Mission/task creation       | Yes           | N/A                     |
| GET    | `/api/debug/llm-status`        | LLM provider status (debug) | Admin         | N/A                     |
| POST   | `/api/validate-webhook`        | Validate webhook signature  | No            | N/A                     |
| GET    | `/api/webhook-diagnostic`      | Webhook diagnostic info     | Admin         | N/A                     |
| POST   | `/api/webhooks/directory-sync` | Directory sync webhook      | No (verified) | N/A                     |

## 6.2 Auth & Session Management

### 6.2.1 Supabase Auth Flow

```
[Signup]
  User fills form -> supabase.auth.signUp({ email, password, options: { data: { full_name } } })
  -> Supabase sends verification email
  -> User clicks link -> /auth/callback -> exchange code for session -> redirect to /chat

[Login (password)]
  User fills form -> supabase.auth.signInWithPassword({ email, password })
  -> On success: redirect to redirectTo (default: /chat)
  -> On failure: show error message

[Login (OAuth)]
  User clicks GitHub/Google button -> supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
  -> Browser redirects to provider -> returns to /auth/callback -> exchange code -> redirect

[Login (magic link)]
  User enters email -> supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })
  -> Email sent -> user clicks link -> /auth/callback -> exchange code -> redirect

[Login (SSO/SAML)]
  User enters work email -> domain check via /api/auth/sso-check
  -> If SSO enabled: supabase.auth.signInWithSSO({ domain, options: { redirectTo } })
  -> Browser redirects to IdP -> returns to /auth/callback -> exchange code -> redirect

[Session refresh]
  Middleware: On each request, refresh Supabase session cookie if nearing expiry
  Client: getSupabaseClient() uses @supabase/ssr for cookie-based session management
```

### 6.2.2 CSRF Token Flow

```
[Token generation]
  Client: GET /api/csrf -> Response includes CSRF token
  Token format: {sessionId}:{timestamp}:{HMAC-SHA256 signature}

[Token validation]
  Client: Sends x-csrf-token header on POST/PUT/PATCH/DELETE requests
  Server: requireCsrfToken(request) validates:
    1. Token format (3 colon-separated parts)
    2. Session ID matches current user/anonymous session
    3. Timestamp within 1 hour (maxAge: 3600000ms)
    4. HMAC signature (constant-time comparison via timingSafeEqual)

[Exemptions]
  - GET requests (no CSRF needed)
  - Bearer token requests (not vulnerable to CSRF)
  - Stripe webhooks (use webhook signature verification instead)
  - GitHub webhooks (use webhook signature verification instead)
```

### 6.2.3 Client-Side Auth State

The `useAuthStore` Zustand store manages client-side auth state:

- `user` -- current Supabase user object
- Subscription status loaded from Supabase `subscriptions` table
- Plan tier detection via `getPlanLevel()` utility

---

# 7. Platform-Specific Capabilities

## 7.1 Server-Side Rendering (SSR) / Static Site Generation (SSG)

| Page Type                                    | Rendering Strategy    | Cache      |
| -------------------------------------------- | --------------------- | ---------- |
| Marketing pages (/, /about, /security, etc.) | SSR with CDN cache    | Vercel CDN |
| Feature pages (/features/\*)                 | SSR with CDN cache    | Vercel CDN |
| Legal pages (/terms, /privacy, /cookies)     | SSR with CDN cache    | Vercel CDN |
| Auth pages (/login, /signup)                 | Client-side rendering | No cache   |
| Dashboard pages                              | Client-side rendering | No cache   |
| Chat pages                                   | Client-side rendering | No cache   |
| API routes                                   | Serverless functions  | Per-route  |
| sitemap.xml                                  | Static generation     | Build time |
| robots.txt                                   | Static generation     | Build time |

## 7.2 Edge Functions (Middleware)

The application uses Next.js middleware (expected at `middleware.ts` in the project root or `apps/web/middleware.ts`) for:

1. **CSP nonce injection** -- Generate per-request nonce, set `x-nonce` header, inject into CSP header
2. **Supabase session refresh** -- Refresh JWT tokens transparently
3. **Auth redirect guards** -- Redirect unauthenticated users from protected routes
4. **Security headers** -- X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-XSS-Protection

## 7.3 Deep Linking to Desktop App

The web app supports deep linking to the desktop application via:

1. **Desktop token generation** (`/api/auth/desktop-token`) -- Creates a signed token that the desktop app can exchange for a session
2. **Sign in to Desktop** component (`components/Auth/SignInToDesktop.tsx`) -- UI for initiating desktop sign-in from web
3. **Custom URL scheme** -- `agiworkforce://` protocol handler for opening specific views in the desktop app

## 7.4 Device Pairing (Mobile Companion)

1. Web dashboard generates QR code (via `qrcode` package)
2. Mobile app scans QR code, which contains a device linking code
3. POST `/api/device/link` creates pairing request
4. User approves on web via POST `/api/device/approve`
5. Mobile polls via GET `/api/device/poll` until approved

## 7.5 Real-Time Capabilities

- **Supabase Realtime** -- WebSocket subscriptions for live data updates (conversations, agent status)
- **SSE Streaming** -- Server-Sent Events for LLM response streaming
- **Conversation realtime hook** (`hooks/useConversationRealtime.ts`) -- Live message updates

## 7.6 i18n / Localization

- Framework: i18next + react-i18next
- Supported languages: English (en), Spanish (es)
- Detection: i18next-browser-languagedetector
- Initialization: `app/i18n/index.ts`

## 7.7 Theme Support

- Framework: next-themes
- Modes: Light, Dark, System (follows OS preference)
- Provider: `ThemeProvider` wraps all pages
- CSS: Tailwind dark mode via `dark:` prefix
- Persistence: localStorage (via next-themes)

## 7.8 Command Palette

- Framework: cmdk (from shadcn/ui)
- Trigger: Cmd+K (macOS) / Ctrl+K (Windows/Linux)
- Provider: `CommandPaletteProvider` mounted globally
- Actions: Navigate, search conversations, create new chat, open settings, etc.

## 7.9 Keyboard Shortcuts

| Shortcut                   | Action                         | Scope         |
| -------------------------- | ------------------------------ | ------------- |
| Cmd+K / Ctrl+K             | Open command palette           | Global        |
| Cmd+Shift+S / Ctrl+Shift+S | Toggle sidebar                 | Chat          |
| Cmd+Enter / Ctrl+Enter     | Send message                   | Chat composer |
| Cmd+N / Ctrl+N             | New chat                       | Chat          |
| Escape                     | Close modal/dialog/dropdown    | Global        |
| Tab                        | Move focus forward             | Global        |
| Shift+Tab                  | Move focus backward            | Global        |
| Cmd+/ / Ctrl+/             | Open keyboard shortcuts dialog | Chat          |
| Cmd+B / Ctrl+B             | Bold text (in composer)        | Chat composer |
| Up Arrow (in empty input)  | Edit last message              | Chat composer |
| Cmd+Shift+E / Ctrl+Shift+E | Export conversation            | Chat          |

## 7.10 Error Handling and Recovery

### Client-Side Error Boundaries

Every major page section is wrapped in an `ErrorBoundary` component that:

1. Catches React rendering errors
2. Displays a user-friendly fallback with "Retry" button
3. Reports errors to analytics service
4. Never crashes the entire application

```
<ErrorBoundary fallback={<ErrorFallback />}>
  <ChatComposer />
</ErrorBoundary>
```

### API Error Handling

All API route handlers follow a consistent error response format:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_ERROR_CODE",
  "details": {
    /* optional structured error data */
  }
}
```

Standard error codes:
| Code | HTTP Status | Description |
|---|---|---|
| `CSRF_VALIDATION_FAILED` | 403 | CSRF token missing or invalid |
| `RATE_LIMIT_EXCEEDED` | 429 | Request rate limit hit |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Not authorized for this action |
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Upstream service down |
| `PAYMENT_REQUIRED` | 402 | Subscription/credits required |

### Offline Detection

The web app detects offline status via `navigator.onLine` and the `online`/`offline` events:

1. When offline, a banner appears: "You are offline. Some features may be unavailable."
2. Chat messages queue locally and send when connection restores
3. API calls retry with exponential backoff (3 attempts, 1s/2s/4s delays)

### Toast Notification System

Sonner toast library provides user feedback:
| Type | Duration | Position | Use Case |
|---|---|---|---|
| Success | 3s | Top center | Action completed |
| Error | 5s | Top center | Operation failed |
| Warning | 4s | Top center | Approaching limit |
| Info | 3s | Top center | Informational |
| Loading | Until resolved | Top center | Async operation |
| Promise | Until resolved | Top center | Chained async (pending/success/error) |

## 7.11 SEO Architecture

### Static SEO Assets

| File                     | Purpose                            | Generation       |
| ------------------------ | ---------------------------------- | ---------------- |
| `app/sitemap.ts`         | Dynamic XML sitemap                | Build-time + ISR |
| `app/robots.ts`          | Robots.txt directives              | Static           |
| `app/manifest.json`      | PWA manifest                       | Static           |
| `public/app-preview.png` | OpenGraph preview image (1200x630) | Static asset     |
| `public/favicon.ico`     | Browser favicon                    | Static asset     |
| `public/icon-192.png`    | PWA icon                           | Static asset     |
| `public/icon-512.png`    | PWA icon large                     | Static asset     |

### Structured Data (JSON-LD)

Three JSON-LD schemas are injected in the root layout:

1. **Organization schema**: Company name, URL, logo, social profiles, contact point
2. **SoftwareApplication schema**: Application name, operating system, offers (pricing tiers), review aggregate
3. **WebSite schema**: Search action for Sitelinks searchbox

Additional per-page schemas:

- **Pricing page**: Product schema with multiple offers (Hobby/Pro/Max plans)
- **FAQ page**: FAQPage schema with question/answer pairs
- **Blog posts**: Article schema with author, datePublished, dateModified

### Meta Tag Strategy

Each page exports a `generateMetadata()` function (Next.js 16 Metadata API):

- `title`: Page-specific, using template `%s | AGI Workforce`
- `description`: Unique per page, 120-160 characters
- `openGraph`: Title, description, image, type per page
- `twitter`: card=summary_large_image, site=@agiworkforce
- `robots`: index/noindex per page (auth pages are noindex)
- `alternates.canonical`: Full URL for canonical link

## 7.12 Analytics and Telemetry

| Event Category | Events Tracked                                       | Tool               |
| -------------- | ---------------------------------------------------- | ------------------ |
| Page views     | All route navigations                                | Google Analytics 4 |
| Auth events    | Login, signup, logout, OAuth provider used           | GA4 + Supabase     |
| Chat events    | Message sent, model selected, session created        | GA4                |
| Billing events | Checkout started, subscription created, plan changed | GA4 + Stripe       |
| Feature usage  | Vibe sessions, media generation, deep research       | GA4                |
| Errors         | Client-side errors, API errors, rate limit hits      | GA4 + Pino         |
| Performance    | Core Web Vitals (LCP, INP, CLS, FCP, TTFB)           | Vercel Analytics   |

### Privacy Compliance

- GA4 tracking is opt-in (respects cookie preferences)
- No PII in analytics events
- IP anonymization enabled
- Data retention: 14 months (GA4 default)
- Cookie consent banner on first visit (if GDPR regions detected)

## 7.13 Logging Architecture

Structured logging via Pino (`lib/logger.ts`):

```typescript
// Logger configuration
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
```

Log levels:
| Level | Usage | Examples |
|---|---|---|
| `fatal` | Unrecoverable errors | Missing critical env vars, DB connection failure |
| `error` | Operation failures | API errors, upstream failures, unhandled exceptions |
| `warn` | Degraded operations | Missing optional env vars, rate limit near threshold |
| `info` | Normal operations | Request received, response sent, webhook processed |
| `debug` | Development detail | Request body, response body, query params |
| `trace` | Fine-grained debugging | SSE chunk received, token count, cache hit/miss |

### Security Audit Logging

Security-sensitive operations are logged to the Supabase `security_audit_log` table:

- Authentication attempts (success/failure)
- CSRF validation failures
- Rate limit violations
- Permission denials
- Admin actions
- Device link/unlink operations

---

# 8. Build, Deploy & Distribution

## 8.1 Build Pipeline

```bash
# Development
cd apps/web && pnpm dev           # Next.js dev server (Turbopack)

# Production build
cd apps/web && pnpm build         # next build

# Type checking
cd apps/web && pnpm typecheck     # tsc --noEmit

# Linting
cd apps/web && pnpm lint          # ESLint

# Tests
cd apps/web && pnpm test          # Vitest
cd apps/web && pnpm test:e2e      # Playwright
```

## 8.2 Environment Variables

### Critical (Required)

| Variable                             | Purpose                                          |
| ------------------------------------ | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`           | Supabase project URL                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Supabase anonymous key                           |
| `SUPABASE_SERVICE_ROLE_KEY`          | Supabase service role key (server-side only)     |
| `STRIPE_SECRET_KEY`                  | Stripe API secret key                            |
| `STRIPE_WEBHOOK_SECRET`              | Stripe webhook signing secret                    |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (client-side)             |
| `NEXT_PUBLIC_APP_URL`                | Application URL (e.g., https://agiworkforce.com) |

### Important (Feature-Specific)

| Variable                      | Purpose                                |
| ----------------------------- | -------------------------------------- |
| `CSRF_SECRET`                 | HMAC secret for CSRF token generation  |
| `CRON_SECRET`                 | Secret for protected cron endpoints    |
| `DESKTOP_GITHUB_OWNER`        | GitHub owner for desktop release check |
| `DESKTOP_GITHUB_REPO`         | GitHub repo for desktop release check  |
| `UPSTASH_REDIS_REST_URL`      | Upstash Redis URL for rate limiting    |
| `UPSTASH_REDIS_REST_TOKEN`    | Upstash Redis token                    |
| `DEVICE_TOKEN_ENCRYPTION_KEY` | Device token encryption                |
| `TOTP_ENCRYPTION_KEY`         | TOTP secret encryption (2FA)           |
| `NEXT_PUBLIC_API_URL`         | API gateway base URL                   |

### Stripe Price IDs

| Variable                     | Purpose                     |
| ---------------------------- | --------------------------- |
| `STRIPE_PRICE_HOBBY_MONTHLY` | Hobby plan monthly price ID |
| `STRIPE_PRICE_HOBBY_YEARLY`  | Hobby plan yearly price ID  |
| `STRIPE_PRICE_PRO_MONTHLY`   | Pro plan monthly price ID   |
| `STRIPE_PRICE_PRO_YEARLY`    | Pro plan yearly price ID    |
| `STRIPE_PRICE_MAX_MONTHLY`   | Max plan monthly price ID   |
| `STRIPE_PRICE_MAX_YEARLY`    | Max plan yearly price ID    |

### Optional

| Variable                           | Purpose                                  |
| ---------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_GA_TRACKING_ID`       | Google Analytics 4 tracking ID           |
| `OPENAI_API_KEY`                   | OpenAI API key for server-side LLM calls |
| `ANTHROPIC_API_KEY`                | Anthropic API key                        |
| `GOOGLE_API_KEY`                   | Google AI API key                        |
| `ALLOWED_ORIGINS`                  | Comma-separated CORS origins             |
| `NEXT_PUBLIC_DOWNLOAD_URL_MAC`     | macOS download URL                       |
| `NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS` | Windows download URL                     |
| `NEXT_PUBLIC_DOWNLOAD_URL_LINUX`   | Linux download URL                       |

## 8.3 Vercel Configuration

- **Framework**: Next.js (auto-detected)
- **Build command**: `pnpm build` (from monorepo root: `pnpm --filter @agiworkforce/web build`)
- **Output directory**: `.next`
- **Node.js version**: 22.x
- **Root directory**: `apps/web`
- **Install command**: `pnpm install`

## 8.4 Preview Deployments

Every pull request automatically generates a preview deployment on Vercel with:

- Unique URL: `<branch>-<project>.vercel.app`
- Full environment variable access (preview secrets)
- Shareable link for review

## 8.5 Environment Validation

At startup, `lib/validate-env.ts` runs validation:

- Checks all critical environment variables
- Validates Supabase URL format
- Validates APP_URL format (HTTPS in production, no trailing slash)
- Validates Stripe price ID consistency
- Logs warnings for missing optional variables
- Throws on critical missing variables (build-time check)

---

# 9. Testing Strategy

## 9.1 Unit Tests

**Framework**: Vitest 4.0.18
**Runner**: `cd apps/web && pnpm test`
**Coverage**: `cd apps/web && pnpm test:coverage` (v8 provider)

### Test Targets

| Module               | Tests                       | Key Files                                                                    |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| Chat store           | Store actions, selectors    | `features/chat/stores/__tests__/chat-store.test.ts`                          |
| Chat AI service      | LLM routing, streaming      | `features/chat/services/chat-ai-service.test.ts`                             |
| Code execution       | Sandbox execution           | `features/chat/services/code-execution-service.test.ts`                      |
| Tool execution       | Tool handler routing        | `features/chat/services/tool-execution-handler.test.ts`                      |
| Voice recording      | Audio capture flow          | `features/chat/hooks/use-voice-recording.test.ts`                            |
| Settings validation  | Zod schema validation       | `features/settings/schemas/settings-validation.test.ts`                      |
| Settings page        | Component rendering         | `features/settings/pages/SettingsPage.test.ts`                               |
| TOTP 2FA             | Token generation/validation | `features/settings/services/totp-2fa.test.ts`                                |
| Connectors           | Page rendering              | `features/connectors/pages/ConnectorsPage.test.tsx`                          |
| Media studio         | Generation flow             | `features/media/pages/MediaStudio.test.tsx`                                  |
| Support page         | Component rendering         | `features/support/pages/SupportPage.test.tsx`                                |
| Dynamic sidecar      | Panel switching             | `components/UnifiedAgenticChat/DynamicSidecar.test.tsx`                      |
| Folder selector      | File/folder picking         | `components/UnifiedAgenticChat/FolderSelector.test.tsx`                      |
| Tool result registry | Registry lookup             | `components/UnifiedAgenticChat/InlineToolResults/__tests__/registry.test.ts` |
| Vibe code editor     | Editor rendering            | `features/vibe/components/redesign/__tests__/CodeEditorPanel.test.tsx`       |
| Vibe file sync       | File synchronization        | `features/vibe/services/vibe-file-sync.test.ts`                              |
| Vibe file system     | File operations             | `features/vibe/services/vibe-file-system.test.ts`                            |
| Vibe message service | Message handling            | `features/vibe/services/vibe-message-service.test.ts`                        |
| Vibe view store      | View state management       | `features/vibe/stores/vibe-view-store.test.ts`                               |

### Test Libraries

- `@testing-library/react` 16.3.2 -- Component rendering
- `@testing-library/jest-dom` 6.9.1 -- DOM assertions
- `@testing-library/user-event` 14.6.1 -- User interaction simulation
- `msw` 2.12.10 -- API mocking
- `jsdom` 20.0.3 -- DOM environment

## 9.2 End-to-End Tests

**Framework**: Playwright 1.58.2
**Runner**: `cd apps/web && pnpm test:e2e`
**UI mode**: `cd apps/web && pnpm test:e2e:ui`

### E2E Test Scenarios

| Scenario             | Priority | Description                                    |
| -------------------- | -------- | ---------------------------------------------- |
| Marketing page load  | P0       | Homepage loads, CTA buttons visible            |
| Login flow           | P0       | Email login, OAuth redirect, error states      |
| Signup flow          | P0       | Registration, email verification prompt        |
| Pricing page         | P0       | Plans display, checkout redirect               |
| Chat new session     | P0       | Create session, send message, receive response |
| Chat streaming       | P0       | SSE streaming renders progressively            |
| Chat sidebar         | P1       | Create/select/delete/rename sessions           |
| Chat attachments     | P1       | File upload, preview, send with message        |
| Dashboard navigation | P1       | Sidebar nav, page transitions                  |
| Settings update      | P1       | Change theme, model, preferences               |
| Share conversation   | P2       | Create share, view shared link                 |
| Keyboard shortcuts   | P2       | Cmd+K, Cmd+Shift+S, Cmd+Enter                  |
| Mobile responsive    | P1       | Sidebar toggle, layout adaptation              |

### Browser Matrix

| Browser       | Versions         | Priority |
| ------------- | ---------------- | -------- |
| Chrome        | Latest, latest-1 | P0       |
| Firefox       | Latest           | P1       |
| Safari        | Latest           | P1       |
| Edge          | Latest           | P2       |
| Mobile Chrome | Latest           | P1       |
| Mobile Safari | Latest           | P1       |

## 9.3 Integration Tests

| Test                   | Description                                                 | Priority |
| ---------------------- | ----------------------------------------------------------- | -------- |
| Supabase auth flow     | Signup -> verify -> login -> session refresh -> logout      | P0       |
| Stripe checkout        | Create checkout -> webhook -> subscription active           | P0       |
| LLM completion         | Send chat -> proxy to provider -> stream response -> render | P0       |
| CSRF validation        | Generate token -> send with request -> verify               | P0       |
| Rate limiting          | Send requests -> hit limit -> verify 429 response           | P0       |
| Device linking         | Generate QR -> scan -> poll -> approve -> linked            | P1       |
| Conversation branching | Create branch -> switch -> merge                            | P1       |
| File attachment        | Upload file -> validate -> attach to message -> send        | P1       |
| Connector OAuth        | Initiate OAuth -> callback -> store credentials -> verify   | P1       |
| Share conversation     | Create share link -> public access -> view shared           | P2       |
| Credit topup           | Select pack -> Stripe checkout -> credits added             | P1       |
| Voice transcription    | Record audio -> send blob -> receive transcript -> insert   | P2       |
| Deep research          | Start research -> poll progress -> display results          | P2       |
| Multi-agent chat       | Select employees -> send message -> parallel responses      | P2       |

## 9.4 Visual Regression Tests

**Tool**: Playwright visual comparison

| Page      | Viewports               | States                                         |
| --------- | ----------------------- | ---------------------------------------------- |
| Homepage  | Desktop, Tablet, Mobile | Light, Dark                                    |
| Pricing   | Desktop, Tablet, Mobile | Light, Dark, Monthly toggle, Yearly toggle     |
| Login     | Desktop, Mobile         | Empty, Error, Loading                          |
| Dashboard | Desktop, Tablet         | Sidebar open, Sidebar collapsed                |
| Chat      | Desktop, Tablet, Mobile | Empty, With messages, Streaming, Tool timeline |
| Settings  | Desktop                 | Each tab                                       |

Visual regression tests run on CI and produce diff images for review. A 1% pixel-difference threshold flags regressions.

## 9.5 Accessibility Tests

| Tool                         | Scope                 | Frequency   |
| ---------------------------- | --------------------- | ----------- |
| axe-core (Playwright)        | All pages             | CI per PR   |
| Lighthouse a11y audit        | Marketing pages       | Weekly cron |
| Manual VoiceOver testing     | Chat, Settings        | Per release |
| Manual keyboard-only testing | All interactive flows | Per release |

### Automated a11y checks

```typescript
// E2E test example with axe-core
import AxeBuilder from '@axe-core/playwright';

test('homepage has no a11y violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
```

## 9.6 Performance Tests

| Test                  | Tool                     | Target                      | Frequency |
| --------------------- | ------------------------ | --------------------------- | --------- |
| Lighthouse CI         | lighthouse-ci            | Score > 90                  | CI per PR |
| Bundle size check     | size-limit               | < 200KB initial JS          | CI per PR |
| SSR response time     | Custom script            | < 800ms TTFB                | Nightly   |
| API response time     | k6 load test             | < 500ms p95                 | Weekly    |
| Memory leak detection | Chrome DevTools Protocol | No leaks after 100 sessions | Monthly   |

## 9.7 Test Data Management

| Data Type          | Source                             | Lifecycle                             |
| ------------------ | ---------------------------------- | ------------------------------------- |
| Test users         | Supabase seed script               | Created per test suite, cleaned after |
| Test subscriptions | Stripe test mode                   | Created per test, canceled after      |
| Test conversations | In-memory fixtures                 | Per test                              |
| Test attachments   | Static fixtures in `__fixtures__/` | Committed to repo                     |
| API mocks          | MSW handlers                       | Per test suite                        |

### MSW Mock Setup

```typescript
// Mock setup for Supabase auth
const handlers = [
  http.post('*/auth/v1/token', () => {
    return HttpResponse.json({
      access_token: 'test-access-token',
      user: { id: 'test-user-id', email: 'test@example.com' },
    });
  }),
  // ... additional handlers
];
```

## 9.8 Test Coverage Targets

| Module                       | Target | Rationale                      |
| ---------------------------- | ------ | ------------------------------ |
| `lib/csrf.ts`                | 100%   | Security-critical              |
| `lib/rate-limit.ts`          | 100%   | Security-critical              |
| `lib/cors.ts`                | 100%   | Security-critical              |
| `lib/validate-env.ts`        | 90%    | Configuration validation       |
| `features/chat/stores/`      | 85%    | Core state management          |
| `features/chat/services/`    | 80%    | Business logic                 |
| `features/billing/services/` | 80%    | Payment-critical               |
| `features/vibe/services/`    | 75%    | Complex feature logic          |
| Components (UI)              | 60%    | Interaction and rendering      |
| Pages                        | 50%    | Smoke tests + key interactions |

Overall target: **75% line coverage** across the web app.

---

# 10. Performance Requirements

## 10.1 Core Web Vitals Targets

| Metric                          | Marketing Pages | Dashboard/Chat | Measurement      |
| ------------------------------- | --------------- | -------------- | ---------------- |
| LCP (Largest Contentful Paint)  | < 2.5s (good)   | < 3.0s         | Lighthouse, CrUX |
| INP (Interaction to Next Paint) | < 200ms         | < 200ms        | Lighthouse, CrUX |
| CLS (Cumulative Layout Shift)   | < 0.1           | < 0.1          | Lighthouse       |
| FCP (First Contentful Paint)    | < 1.8s          | < 2.5s         | Lighthouse       |
| TTFB (Time to First Byte)       | < 600ms         | < 800ms        | Vercel analytics |

## 10.2 Bundle Size Budget

| Bundle               | Target (gzipped) | Current Estimate     |
| -------------------- | ---------------- | -------------------- |
| Initial JS (shared)  | < 200KB          | ~180KB               |
| Chat page JS         | < 300KB          | ~250KB               |
| Dashboard page JS    | < 250KB          | ~200KB               |
| Marketing page JS    | < 100KB          | ~80KB                |
| Monaco Editor (lazy) | < 500KB          | ~450KB (lazy loaded) |
| Mermaid (lazy)       | < 300KB          | ~280KB (lazy loaded) |
| Total CSS            | < 50KB           | ~40KB                |

## 10.3 Network Performance

| Operation                     | Target p95 | Notes               |
| ----------------------------- | ---------- | ------------------- |
| API route response (cached)   | < 50ms     | Vercel Edge Cache   |
| API route response (uncached) | < 500ms    | Cold function start |
| LLM completion first token    | < 2s       | Provider-dependent  |
| Supabase query                | < 200ms    | Indexed queries     |
| Stripe checkout redirect      | < 3s       | Stripe API latency  |

## 10.4 Runtime Performance

| Metric                              | Target                    |
| ----------------------------------- | ------------------------- |
| Chat message render (single)        | < 16ms (60fps)            |
| Conversation load (100 messages)    | < 500ms                   |
| Sidebar session list (200 sessions) | < 100ms (virtualized)     |
| Search results (fuzzy, 1000 items)  | < 50ms (Fuse.js)          |
| Theme switch                        | < 100ms (no layout shift) |

## 10.5 Optimization Strategies

1. **Code splitting** -- Dynamic imports for heavy components (Monaco, Mermaid, Sandpack)
2. **React.lazy + Suspense** -- Lazy-load non-critical UI components
3. **Image optimization** -- Next.js Image component with automatic WebP/AVIF
4. **Font optimization** -- Geist fonts via `next/font/google` (variable, subsets: latin)
5. **Route prefetching** -- Next.js Link prefetch for navigation
6. **Virtualization** -- react-window for long message lists and session lists
7. **Debouncing** -- Search inputs, SSO domain check (400ms), voice transcription
8. **Memoization** -- useMemo/useCallback for expensive computations
9. **TanStack Query** -- Automatic caching and stale-while-revalidate for server data

## 10.6 Lazy-Loaded Components

Heavy third-party libraries are loaded only when needed:

| Component          | Library                                  | Trigger                             | Estimated Size |
| ------------------ | ---------------------------------------- | ----------------------------------- | -------------- |
| Code editor (Vibe) | Monaco Editor (`@monaco-editor/react`)   | Navigate to Vibe page               | ~450KB gzipped |
| Diagram rendering  | Mermaid (`mermaid`)                      | Message contains mermaid code block | ~280KB gzipped |
| Code sandbox       | Sandpack (`@codesandbox/sandpack-react`) | Vibe code preview                   | ~200KB gzipped |
| Math rendering     | KaTeX (`katex`, `rehype-katex`)          | Message contains LaTeX syntax       | ~120KB gzipped |
| Charts             | Recharts (`recharts`)                    | Dashboard analytics page            | ~100KB gzipped |
| QR code            | qrcode (`qrcode`)                        | Device pairing page                 | ~30KB gzipped  |
| PDF export         | jsPDF (`jspdf`)                          | User exports conversation as PDF    | ~80KB gzipped  |
| Diff viewer        | react-diff-viewer-continued              | Conversation diff display           | ~40KB gzipped  |

### Loading Pattern

```typescript
// Dynamic import with loading fallback
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react'),
  {
    loading: () => <Skeleton className="h-96 w-full" />,
    ssr: false, // Monaco requires browser APIs
  }
);
```

## 10.7 Caching Strategy

### Client-Side Caching

| Data              | Cache Strategy                 | TTL            | Invalidation        |
| ----------------- | ------------------------------ | -------------- | ------------------- |
| User session      | Supabase SSR cookie            | Until expiry   | Auth state change   |
| Conversation list | TanStack Query                 | 30s staleTime  | New message, delete |
| Model catalog     | TanStack Query                 | 5min staleTime | Manual refresh      |
| Settings          | Zustand persist (localStorage) | Indefinite     | User update         |
| Connector list    | TanStack Query                 | 2min staleTime | Connect/disconnect  |
| Usage data        | TanStack Query                 | 1min staleTime | Automatic           |
| Theme             | next-themes (localStorage)     | Indefinite     | User toggle         |

### Server-Side Caching

| Route             | Cache      | TTL       | Headers                                                |
| ----------------- | ---------- | --------- | ------------------------------------------------------ |
| Marketing pages   | Vercel CDN | ISR (1hr) | `Cache-Control: s-maxage=3600, stale-while-revalidate` |
| Feature pages     | Vercel CDN | ISR (1hr) | `Cache-Control: s-maxage=3600, stale-while-revalidate` |
| Static assets     | Vercel CDN | Immutable | `Cache-Control: public, max-age=31536000, immutable`   |
| API routes        | No cache   | N/A       | `Cache-Control: no-store`                              |
| Model catalog API | Edge cache | 5min      | `Cache-Control: s-maxage=300`                          |
| Health check      | No cache   | N/A       | `Cache-Control: no-store`                              |

### TanStack Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s before refetch
      gcTime: 5 * 60_000, // 5min garbage collection
      retry: 2, // 2 retries on failure
      refetchOnWindowFocus: true, // Refetch on tab focus
    },
  },
});
```

## 10.8 Memory Management

| Concern                             | Mitigation                                                             |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Long chat sessions (1000+ messages) | Virtual scrolling via react-window; only DOM-visible messages rendered |
| SSE stream buffers                  | Streams consumed and emitted; no accumulation in memory                |
| Zustand store growth                | Periodic cleanup of stale sessions in `chatStore`                      |
| Image attachments                   | URL.revokeObjectURL() called on unmount                                |
| WebSocket connections               | Single Supabase Realtime connection, multiplexed channels              |
| AbortControllers                    | All streaming requests use AbortController; cleaned up on unmount      |
| Event listeners                     | Cleanup in useEffect return functions                                  |

## 10.9 Lighthouse Budgets

Enforced via `lighthouse-ci` in CI pipeline:

```json
{
  "ci": {
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.9 }],
        "categories:seo": ["error", { "minScore": 0.95 }],
        "resource-summary:script:size": ["warning", { "maxNumericValue": 500000 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 1800 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "interactive": ["error", { "maxNumericValue": 3500 }]
      }
    }
  }
}
```

---

# 11. Security

## 11.1 Threat Model

| Threat                            | Mitigation                                                            | Status      |
| --------------------------------- | --------------------------------------------------------------------- | ----------- |
| Cross-Site Scripting (XSS)        | DOMPurify sanitization, CSP with nonces, React auto-escaping          | Implemented |
| Cross-Site Request Forgery (CSRF) | HMAC-SHA256 tokens (session-bound, 1hr TTL, timing-safe comparison)   | Implemented |
| Open Redirect                     | `getSafeRedirectUrl()` validates redirect targets against allowlist   | Implemented |
| Session Hijacking                 | HttpOnly, Secure, SameSite=Lax cookies via Supabase SSR               | Implemented |
| Brute Force (auth)                | Rate limiting: 5 logins/15min, 3 signups/hr per IP                    | Implemented |
| API Abuse                         | Per-endpoint rate limiting via Upstash Redis (30+ configs)            | Implemented |
| SQL Injection                     | Supabase parameterized queries, Zod input validation                  | Implemented |
| Stripe Webhook Forgery            | Webhook signature verification via `stripe.webhooks.constructEvent()` | Implemented |
| GitHub Webhook Forgery            | Webhook signature verification                                        | Implemented |
| CORS Bypass                       | Origin allowlist, Tauri scheme validation, no wildcard origins        | Implemented |
| Credential Exposure               | Server-only env vars, no secrets in client bundles                    | Implemented |
| Rate Limit Bypass (IP rotation)   | JWT-based rate limiting for authenticated users                       | Implemented |
| Timing Attack (CSRF)              | `timingSafeEqual()` for signature comparison                          | Implemented |

## 11.2 CSRF Protection Details

- **Token format**: `{sessionId}:{timestamp}:{HMAC-SHA256(sessionId:timestamp, CSRF_SECRET)}`
- **Session binding**: Tokens are bound to the Supabase user ID (authenticated) or anonymous session cookie (unauthenticated)
- **TTL**: 1 hour (3600000ms)
- **Validation**: `requireCsrfToken()` returns 403 with `CSRF_VALIDATION_FAILED` code on failure
- **Exemptions**: GET requests, Bearer token requests (not vulnerable to CSRF)
- **Client-side**: `lib/client/csrf.ts` provides `addCsrfHeaders()` utility

## 11.3 CORS Policy

- **Allowed origins**: Configured via `ALLOWED_ORIGINS` env var + `NEXT_PUBLIC_APP_URL`
- **Tauri origins**: `tauri://<alphanum>` and `https://tauri.localhost` (strict regex)
- **Development**: All localhost origins (3000, 3001, 5173-5175)
- **Credentials**: `Access-Control-Allow-Credentials: true` (only with specific origin)
- **No wildcard**: Never uses `Access-Control-Allow-Origin: *`
- **Preflight**: 24-hour cache (`Access-Control-Max-Age: 86400`)

## 11.4 Security Headers

Applied to all API responses via `getSecurityHeaders()`:

- `X-Content-Type-Options: nosniff` -- Prevent MIME type sniffing
- `X-Frame-Options: DENY` -- Prevent clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin` -- Limit referrer exposure
- `X-XSS-Protection: 1; mode=block` -- Legacy XSS protection

## 11.5 Content Security Policy

Configured in middleware with per-request nonces:

- `script-src 'nonce-{nonce}' 'strict-dynamic'` -- Only nonce-tagged scripts execute
- `style-src 'self' 'unsafe-inline'` -- Tailwind requires inline styles
- `img-src 'self' data: blob: https:` -- Allow images from various sources
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com` -- API connections

## 11.6 Rate Limiting Architecture

### Configuration (31 endpoint categories)

Security-critical endpoints fail closed (block requests when Redis unavailable):

- `auth-login` (5/15min), `auth-signup` (3/hr), `auth-password-reset` (3/hr)
- `device-link` (10/min), `claim-offer` (3/hr)
- `llm-completion` (30/min), `llm-streaming` (20/min)
- `image-generation` (10/min), `video-generation` (5/min)
- `audio-transcription` (20/min)
- `user-data-delete` (3/hr), `user-data-export` (5/hr)
- `admin-security` (10/min)

Business-critical endpoints fail open (allow requests when Redis unavailable):

- `checkout` (15/min), `credit-topup` (15/min)
- `stripe-webhook` (100/min), `github-webhook` (200/min)
- `download` (30/min), `health-check` (30/min)

### Implementation

- **Production**: Upstash Redis with sliding window algorithm
- **Development/fallback**: In-memory rate limiter (per-process, not distributed)
- **Memory safety**: In-memory store capped at 10,000 entries with periodic cleanup (60s)
- **Identifier priority**: JWT `sub` claim > `x-real-ip` header > rightmost `x-forwarded-for` IP > "unknown"
- **Response headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
- **Audit logging**: Rate limit violations logged to security audit table with user ID enrichment

## 11.7 Input Validation

- **Zod schemas** in `lib/validations/` for: chat, checkout, claim-offer, device, LLM, path
- **Server-side validation** on all API route handlers
- **Path traversal prevention** in `lib/validations/path.ts`
- **DOMPurify** for user-generated HTML content before rendering

## 11.8 Password Security

- Client-side strength validation via `lib/password-validator.ts`
- Server-side enforcement via Supabase Auth policies
- No password stored in web application -- delegated to Supabase

## 11.9 Secrets Management

- All API keys stored in Vercel environment variables (encrypted at rest)
- `NEXT_PUBLIC_*` prefix for client-safe values only
- Server-only secrets never exposed to client bundles
- `lib/security/secrets-audit.ts` for automated secret scanning
- `lib/leak-detector.ts` for runtime leak detection

### Server-Only Module Pattern

All server-side utility files import `'server-only'` to prevent accidental inclusion in client bundles:

```typescript
import 'server-only'; // Next.js build error if imported from client component
```

Files using this pattern:

- `lib/cors.ts`
- `lib/csrf.ts`
- `lib/rate-limit.ts`
- `utils/supabase/server.ts`
- All API route handlers

## 11.10 Authentication Security

### Session Management

| Property            | Value                                      | Rationale                  |
| ------------------- | ------------------------------------------ | -------------------------- |
| Session storage     | HttpOnly cookie (Supabase SSR)             | Prevents XSS token theft   |
| Cookie flags        | `Secure; SameSite=Lax; HttpOnly`           | CSRF + transport security  |
| Session duration    | Configurable via Supabase (default 1 week) | Balance security/UX        |
| Refresh tokens      | Automatic refresh via middleware           | Transparent token rotation |
| Concurrent sessions | Unlimited (per Supabase default)           | Multi-device support       |
| Session revocation  | Via Supabase dashboard or API              | Admin capability           |

### OAuth Security

| Provider | Flow               | State Parameter | PKCE |
| -------- | ------------------ | --------------- | ---- |
| GitHub   | Authorization Code | Yes             | Yes  |
| Google   | Authorization Code | Yes             | Yes  |
| SSO/SAML | SAML 2.0 Response  | N/A             | N/A  |

### Safe Redirect Validation

The `getSafeRedirectUrl()` function in `app/login/page.tsx` validates redirect targets:

1. Parse the `redirect` query parameter
2. Verify the URL is relative (starts with `/`) or matches the app domain
3. Reject absolute URLs to external domains
4. Reject `javascript:`, `data:`, `vbscript:` URI schemes
5. Default to `/dashboard` if redirect is invalid or missing

### Two-Factor Authentication (2FA)

- TOTP-based 2FA via `features/settings/services/totp-2fa.ts`
- QR code generation for authenticator app setup
- TOTP secrets encrypted with `TOTP_ENCRYPTION_KEY` before storage
- Backup codes provided during setup
- Rate limited: 5 verification attempts per 15 minutes

## 11.11 Data Protection

### Data at Rest

| Data Type                | Storage                | Encryption                                   |
| ------------------------ | ---------------------- | -------------------------------------------- |
| User credentials         | Supabase Auth (Argon2) | Supabase-managed                             |
| API keys (user-provided) | Vercel env vars        | Vercel-managed AES                           |
| Conversation messages    | Supabase PostgreSQL    | Supabase-managed (AES-256)                   |
| File attachments         | Supabase Storage       | Supabase-managed                             |
| Payment data             | Stripe                 | PCI DSS Level 1                              |
| Device tokens            | Supabase               | Encrypted with `DEVICE_TOKEN_ENCRYPTION_KEY` |
| TOTP secrets             | Supabase               | Encrypted with `TOTP_ENCRYPTION_KEY`         |

### Data in Transit

| Connection                  | Protocol         | Certificate      |
| --------------------------- | ---------------- | ---------------- |
| Client -> Vercel            | HTTPS (TLS 1.3)  | Vercel-managed   |
| Vercel -> Supabase          | HTTPS (TLS 1.2+) | Supabase-managed |
| Vercel -> Stripe            | HTTPS (TLS 1.2+) | Stripe-managed   |
| Vercel -> LLM providers     | HTTPS (TLS 1.2+) | Provider-managed |
| Client -> Supabase Realtime | WSS (TLS 1.2+)   | Supabase-managed |

### Data Deletion

Users can request data deletion via:

1. Settings page "Delete Account" button
2. API endpoint: `DELETE /api/user/data`
3. Rate limited: 3 requests per hour
4. Cascading delete: user record -> conversations -> messages -> attachments -> subscriptions
5. Stripe customer data: Deleted via Stripe API
6. Analytics data: Anonymized (GA4 user deletion API)

## 11.12 Webhook Security

### Stripe Webhooks

```typescript
// Webhook signature verification
const event = stripe.webhooks.constructEvent(
  rawBody,
  request.headers.get('stripe-signature')!,
  process.env.STRIPE_WEBHOOK_SECRET!,
);
```

Verified events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

### GitHub Webhooks

- Signature verification via `X-Hub-Signature-256` header
- HMAC-SHA256 comparison with `GITHUB_WEBHOOK_SECRET`
- Used for: release notifications (desktop app auto-update)

## 11.13 Supply Chain Security

| Measure               | Implementation                                                      |
| --------------------- | ------------------------------------------------------------------- |
| Dependency lockfile   | `pnpm-lock.yaml` committed and enforced (`--frozen-lockfile` in CI) |
| Dependency audit      | `pnpm audit` run in CI pipeline                                     |
| Known vulnerabilities | GitHub Dependabot alerts enabled                                    |
| License compliance    | All dependencies are MIT, Apache-2.0, or ISC compatible             |
| Build reproducibility | Deterministic builds via pnpm strict mode                           |
| CodeQL analysis       | `.github/workflows/codeql.yml` for automated security scanning      |

---

# 12. Accessibility

## 12.1 WCAG AA Compliance Targets

| Criterion                    | Level | Status                                      |
| ---------------------------- | ----- | ------------------------------------------- |
| 1.1.1 Non-text Content       | A     | Implemented (alt text, aria-labels)         |
| 1.3.1 Info and Relationships | A     | Implemented (semantic HTML)                 |
| 1.4.1 Use of Color           | A     | Implemented (icons + text, not color alone) |
| 1.4.3 Contrast (Minimum)     | AA    | Implemented (Tailwind color system)         |
| 1.4.4 Resize Text            | AA    | Implemented (rem-based sizing)              |
| 2.1.1 Keyboard               | A     | Implemented                                 |
| 2.1.2 No Keyboard Trap       | A     | Implemented                                 |
| 2.4.1 Bypass Blocks          | A     | Implemented (SkipLinks)                     |
| 2.4.2 Page Titled            | A     | Implemented (Next.js Metadata)              |
| 2.4.3 Focus Order            | A     | Implemented                                 |
| 2.4.4 Link Purpose           | A     | Implemented                                 |
| 2.4.7 Focus Visible          | AA    | Implemented (focus:ring-\*)                 |
| 3.1.1 Language of Page       | A     | Implemented (lang="en")                     |
| 3.3.1 Error Identification   | A     | Implemented (inline errors)                 |
| 3.3.2 Labels or Instructions | A     | Implemented (labels, placeholders)          |
| 4.1.1 Parsing                | A     | Implemented (valid HTML)                    |
| 4.1.2 Name, Role, Value      | A     | Implemented (ARIA attributes)               |

## 12.2 Skip Links

`components/accessibility/SkipLinks.tsx` provides "Skip to main content" link, visible on focus, positioned above all other content.

## 12.3 Keyboard Navigation

### Global

| Key            | Action                      |
| -------------- | --------------------------- |
| Tab            | Move focus forward          |
| Shift+Tab      | Move focus backward         |
| Escape         | Close modal/dialog/dropdown |
| Cmd+K / Ctrl+K | Open command palette        |

### Chat Interface

| Key                       | Action            |
| ------------------------- | ----------------- |
| Cmd+Enter                 | Send message      |
| Cmd+Shift+S               | Toggle sidebar    |
| Up arrow (in empty input) | Edit last message |

### Modals and Dialogs

- Focus trapped within modal when open
- Escape closes modal
- Focus returned to trigger element on close

## 12.4 Screen Reader Support

- **ARIA labels**: All interactive elements have descriptive `aria-label` or `aria-labelledby`
- **ARIA roles**: `role="menu"`, `role="menuitem"`, `role="button"`, `role="dialog"`
- **ARIA states**: `aria-expanded`, `aria-hidden`, `aria-haspopup`, `aria-controls`
- **Live regions**: Toast notifications use `role="alert"` (via Sonner)
- **Semantic HTML**: `<header>`, `<main>`, `<nav>`, `<aside>`, `<footer>`, `<section>`
- **Form labels**: All inputs have associated `<label>` elements (sr-only when visually hidden)

## 12.5 Color and Contrast

- **Dark theme**: White text on black/zinc backgrounds (contrast ratio > 4.5:1)
- **Light theme**: Dark text on light backgrounds
- **Status indicators**: Always use icon + text, never color alone
  - Success: Green checkmark + text
  - Error: Red AlertCircle + text
  - Warning: Amber AlertCircle + text
  - Info: Blue info icon + text
- **Focus indicators**: Blue ring (ring-2 ring-blue-400) on focused elements
- **Link distinction**: Underline on hover, distinct color from body text

## 12.6 Responsive Design

| Breakpoint | Width           | Layout                                       |
| ---------- | --------------- | -------------------------------------------- |
| Mobile     | < 640px (sm)    | Single column, hamburger menu, bottom sheets |
| Tablet     | 640-1023px (md) | Two columns where appropriate                |
| Desktop    | >= 1024px (lg)  | Full layout with sidebar                     |
| Wide       | >= 1280px (xl)  | Maximum content width containers             |

## 12.7 Motion and Animation

- **Reduced motion**: Respect `prefers-reduced-motion` media query
- **Transitions**: Short duration (150-200ms) for UI state changes
- **Framer Motion**: Used for page transitions and complex animations (respects reduced motion)

---

# 13. Competitive Analysis

## 13.1 claude.ai

### What claude.ai Does Well

- **Clean, minimal interface** -- Focused on the conversation with no visual clutter
- **Artifacts** -- Inline rendering of code, SVG, React components, and documents in a side panel
- **Projects** -- Organize conversations by project with shared context and custom instructions
- **Extended thinking** -- Visible reasoning chain with expandable thinking blocks
- **Message editing** -- Click any message to edit and fork the conversation
- **Streaming quality** -- Smooth, fast token-by-token rendering
- **Mobile app** -- Native iOS and Android apps with full feature parity

### Where AGI Workforce Leads

- **Multi-model access** -- claude.ai is Claude-only; AGI Workforce supports 12+ providers including local models
- **BYOK** -- claude.ai requires Anthropic subscription; AGI Workforce uses user-owned API keys
- **AI skill marketplace** -- 169+ specialized skills vs. no marketplace on claude.ai
- **Media generation** -- Image and video generation built-in; claude.ai has no media capabilities
- **Deep research with citations** -- Perplexity-backed search with source attribution
- **Conversation sharing** -- Token-based public URLs; claude.ai sharing is limited
- **Conversation branching** -- Create named branches from any message point
- **Tool execution visualization** -- Inline tool cards with progress, timeline, and result rendering
- **Desktop app integration** -- Deep linking between web and desktop; claude.ai has no desktop companion
- **Voice input** -- Transcription-based voice input; claude.ai has no voice features on web
- **Code editor (Vibe)** -- Full Monaco editor with Sandpack live preview; claude.ai has basic artifacts

### Where Parity Is Needed

- **Streaming polish** -- claude.ai streaming feels more responsive; match their first-token latency
- **Mobile experience** -- claude.ai has native mobile apps; AGI Workforce has QR pairing
- **Conversation search** -- claude.ai has built-in conversation search; AGI Workforce has global search dialog but needs polish
- **Model context caching** -- claude.ai uses prompt caching for faster responses; implement similar for web chat

## 13.2 chatgpt.com

### What chatgpt.com Does Well

- **Canvas** -- Side-by-side editing workspace for documents and code with AI suggestions
- **Code Interpreter** -- Python execution sandbox with file I/O and visualization
- **Voice mode** -- Advanced real-time voice conversation (GPT-4o voice)
- **GPTs store** -- Marketplace of community-created custom GPTs
- **Memory** -- Automatic memory of user preferences across conversations
- **Image generation** -- DALL-E integration directly in chat
- **SearchGPT** -- Web search with citations integrated into responses
- **Plugins (legacy)** -- Extensive third-party integrations
- **Mobile apps** -- Native iOS and Android with offline support

### Where AGI Workforce Leads

- **Multi-model** -- chatgpt.com is OpenAI-only; AGI Workforce offers Claude, Gemini, Mistral, local models
- **BYOK** -- chatgpt.com requires OpenAI subscription; AGI Workforce uses user keys
- **Desktop automation** -- chatgpt.com has no desktop control; AGI Workforce has full desktop agent (via desktop app)
- **MCP tools** -- Unlimited MCP tools vs. limited plugin ecosystem
- **AI skills breadth** -- 169+ non-coding skills vs. GPTs (mostly coding/writing focused)
- **Video generation** -- Runway, Veo 3, Sora vs. limited Sora access on chatgpt.com
- **Privacy** -- Local processing with BYOK vs. all data flows through OpenAI
- **Conversation branching** -- Named branches vs. linear conversation only

### Where Parity Is Needed

- **Code execution** -- chatgpt.com Code Interpreter runs Python in a sandbox; AGI Workforce needs web-based code execution
- **Real-time voice** -- chatgpt.com advanced voice mode is superior; AGI Workforce has transcription-only
- **Memory system** -- chatgpt.com automatic memory is seamless; AGI Workforce memory is more manual
- **Mobile native** -- chatgpt.com has polished native apps; AGI Workforce relies on QR pairing

## 13.3 perplexity.ai

### What perplexity.ai Does Well

- **Search-first design** -- Every response includes citations and source links
- **Focus modes** -- Writing, Academic, Math, Code, Video modes
- **Pro Search** -- Multi-step research with clarifying questions
- **Discover feed** -- Trending topics and curated content
- **Clean citation UI** -- Numbered inline citations with source previews
- **Speed** -- Very fast response times for search queries
- **Spaces** -- Shared knowledge spaces for team research

### Where AGI Workforce Leads

- **Multi-model** -- perplexity.ai uses internal models; AGI Workforce supports 12+ providers
- **BYOK** -- No key management in perplexity.ai; full BYOK in AGI Workforce
- **Tool execution** -- perplexity.ai is read-only; AGI Workforce executes tools, generates code, automates
- **Desktop integration** -- No desktop app; AGI Workforce has full desktop agent
- **AI skills** -- No skill marketplace; 169+ specialized skills in AGI Workforce
- **Media generation** -- No media generation; full image/video pipeline in AGI Workforce
- **Artifacts** -- No artifact system; full artifact rendering in AGI Workforce
- **Privacy** -- perplexity.ai processes all queries; AGI Workforce supports local models

### Where Parity Is Needed

- **Citation quality** -- perplexity.ai citations are best-in-class; AGI Workforce deep research needs polish
- **Search speed** -- perplexity.ai is optimized for search latency; match their sub-second results
- **Discovery/trending** -- perplexity.ai Discover feed has no equivalent in AGI Workforce

## 13.4 Strategic Gaps to Own

1. **Multi-model web chat with BYOK** -- No competitor offers web-based chat with 12+ providers and user-owned API keys. This is the primary differentiator.
2. **AI skill marketplace for non-coders** -- 169+ skills across healthcare, legal, finance, education, creative, and trades. Every competitor is code/writing focused.
3. **Web + Desktop integration** -- Seamless handoff between web chat and desktop app (deep linking, auth pairing, session sync). No competitor offers this bridge.
4. **Vibe coding workspace** -- Full Monaco editor + Sandpack live preview + multi-agent collaboration in the browser. Competes with Bolt, Lovable, and Replit rather than claude.ai.
5. **Comprehensive media generation** -- Image (DALL-E, Flux, Imagen) + video (Runway, Veo 3, Sora) in a single chat interface. No competitor combines all media types.
6. **Workforce management** -- Hire, manage, and deploy AI employees from a web dashboard. No competitor has this paradigm.

## 13.5 UI/UX Pattern Comparison

### Chat Interface Patterns

| Pattern           | AGI Workforce              | claude.ai                  | chatgpt.com                | perplexity.ai          |
| ----------------- | -------------------------- | -------------------------- | -------------------------- | ---------------------- |
| Message bubbles   | Full-width, alternating bg | Full-width, alternating bg | Full-width, alternating bg | Full-width, card-based |
| User avatar       | Initials badge             | No avatar                  | Circle avatar              | No avatar              |
| AI avatar         | Brand icon + model badge   | Anthropic logo             | OpenAI logo                | Perplexity logo        |
| Composer style    | Pill-shaped glassmorphic   | Minimal text area          | Rounded text area          | Search bar style       |
| Toolbar position  | Below textarea             | Below textarea             | Below textarea             | Below search bar       |
| Sidebar style     | Collapsible, 240px         | Collapsible, 260px         | Always visible, 260px      | Collapsible, library   |
| Theme support     | Light/Dark/System          | Light/Dark                 | Light/Dark                 | Light/Dark             |
| Code block style  | Syntax + copy + language   | Syntax + copy + run        | Syntax + copy              | Syntax + copy          |
| Loading indicator | Typing dots + skeleton     | Typing cursor              | Typing dots                | Shimmer line           |
| Error display     | Toast + inline retry       | Inline error message       | Toast notification         | Inline error           |

### Navigation Patterns

| Pattern         | AGI Workforce                      | claude.ai         | chatgpt.com       | perplexity.ai     |
| --------------- | ---------------------------------- | ----------------- | ----------------- | ----------------- |
| Primary nav     | Header (marketing) / Sidebar (app) | Sidebar only      | Sidebar only      | Top bar + sidebar |
| Mobile nav      | Hamburger + bottom sheet           | Bottom tab bar    | Hamburger menu    | Bottom tab bar    |
| Breadcrumbs     | Dashboard pages                    | No                | No                | No                |
| Command palette | Cmd+K (cmdk)                       | No                | No                | No                |
| Search          | Global search dialog               | In-sidebar search | In-sidebar search | Top-level search  |

### Onboarding Patterns

| Step               | AGI Workforce              | claude.ai            | chatgpt.com           | perplexity.ai      |
| ------------------ | -------------------------- | -------------------- | --------------------- | ------------------ |
| Sign up            | Email + OAuth + Magic Link | Email + OAuth        | Email + OAuth + Phone | Email + OAuth      |
| Email verification | Required                   | Optional             | Required (phone)      | Optional           |
| First-run tutorial | Suggested prompts          | Suggested prompts    | Suggested prompts     | Topic cards        |
| API key setup      | Settings > API Keys        | N/A (subscription)   | N/A (subscription)    | N/A (subscription) |
| Model selection    | During onboarding          | Auto (latest Claude) | Auto (GPT-4o)         | Auto (internal)    |

## 13.6 Feature-by-Feature Comparison Table

| Feature                | AGI Workforce       | claude.ai      | chatgpt.com      | perplexity.ai |
| ---------------------- | ------------------- | -------------- | ---------------- | ------------- |
| **Pricing**            |                     |                |                  |               |
| Free tier              | Yes (limited)       | Yes            | Yes              | Yes           |
| Cheapest paid          | $4.99/mo (Hobby)    | $20/mo (Pro)   | $20/mo (Plus)    | $20/mo (Pro)  |
| Premium tier           | $249.99/mo (Max)    | $200/mo (Max)  | $200/mo (Pro)    | $20/mo        |
| BYOK (no subscription) | Yes                 | No             | No               | No            |
| **Models**             |                     |                |                  |               |
| Multi-provider         | 12+ providers        | Anthropic only | OpenAI only      | Internal      |
| Local models           | Via desktop         | No             | No               | No            |
| Model switching        | In-chat toggle      | No             | Model selector   | No            |
| **Chat**               |                     |                |                  |               |
| Streaming              | SSE                 | SSE            | SSE              | SSE           |
| Markdown/LaTeX         | Full GFM + KaTeX    | Yes            | Yes              | Yes           |
| Code blocks            | Syntax + copy       | Syntax + copy  | Syntax + copy    | Syntax + copy |
| Message editing        | Yes                 | Yes            | Yes              | No            |
| Conversation branches  | Yes                 | No             | No               | No            |
| Search conversations   | Global search       | Project search | Search           | Search        |
| Share conversations    | Token URLs          | Share links    | Share links      | Share links   |
| Voice input            | Transcription       | No             | Advanced voice   | No            |
| File attachments       | Upload + preview    | Yes            | Yes              | Yes           |
| **Tools & Actions**    |                     |                |                  |               |
| Tool execution         | Inline cards        | Artifacts      | Code Interpreter | No            |
| Web search             | Deep research       | No             | SearchGPT        | Core          |
| Image generation       | DALL-E, Flux        | No             | DALL-E           | No            |
| Video generation       | Runway, Veo 3, Sora | No             | Sora             | No            |
| Code execution         | Via API proxy       | Artifacts      | Sandbox          | No            |
| **Organization**       |                     |                |                  |               |
| Folders                | Yes                 | Projects       | No               | Spaces        |
| Custom instructions    | Yes                 | Yes            | Yes              | No            |
| Memory                 | Explicit            | No             | Automatic        | No            |
| Command palette        | Cmd+K               | No             | No               | No            |
| Keyboard shortcuts     | Comprehensive       | Basic          | Basic            | Basic         |
| **Platform**           |                     |                |                  |               |
| Web app                | Yes                 | Yes            | Yes              | Yes           |
| Desktop app            | Yes (Tauri)         | Yes (Electron) | Yes (Electron)   | No            |
| Mobile app             | QR companion        | iOS, Android   | iOS, Android     | iOS, Android  |
| Browser extension      | Chrome MV3          | No             | No               | Chrome        |
| VS Code extension      | Yes                 | Claude Code    | No               | No            |
| **Enterprise**         |                     |                |                  |               |
| SSO/SAML               | Yes                 | Enterprise     | Enterprise       | No            |
| Team management        | Workforce           | Team plan      | Team plan        | Enterprise    |
| Audit logging          | Yes                 | Enterprise     | Enterprise       | No            |
| GDPR compliance        | Export + delete     | Yes            | Yes              | Yes           |

---

# Appendix A: File Index

## A.1 Key Source Files

| File                                     | Purpose                                                        |
| ---------------------------------------- | -------------------------------------------------------------- |
| `apps/web/app/layout.tsx`                | Root layout (RSC, metadata, providers)                         |
| `apps/web/app/page.tsx`                  | Marketing homepage                                             |
| `apps/web/app/providers.tsx`             | Client providers (Query, Theme, i18n, CommandPalette, Toaster) |
| `apps/web/app/login/page.tsx`            | Login page                                                     |
| `apps/web/app/signup/page.tsx`           | Signup page                                                    |
| `apps/web/app/pricing/page.tsx`          | Pricing page with Stripe checkout                              |
| `apps/web/app/download/page.tsx`         | Download page                                                  |
| `apps/web/app/chat/page.tsx`             | Chat interface (empty state)                                   |
| `apps/web/app/chat/[sessionId]/page.tsx` | Chat session view                                              |
| `apps/web/app/dashboard/layout.tsx`      | Dashboard layout (sidebar + header)                            |
| `apps/web/app/dashboard/page.tsx`        | Dashboard home                                                 |
| `apps/web/components/layout/Header.tsx`  | Marketing header with navigation                               |
| `apps/web/lib/csrf.ts`                   | CSRF token generation and validation                           |
| `apps/web/lib/cors.ts`                   | CORS configuration and helpers                                 |
| `apps/web/lib/rate-limit.ts`             | Rate limiting (Upstash Redis + fallback)                       |
| `apps/web/lib/validate-env.ts`           | Environment variable validation                                |
| `apps/web/lib/supabase.ts`               | Supabase client initialization                                 |
| `apps/web/lib/modelRouter.ts`            | LLM model routing logic                                        |
| `apps/web/lib/pricing.ts`                | Stripe price ID constants                                      |
| `apps/web/lib/safe-redirect.ts`          | Safe redirect URL validation                                   |
| `apps/web/lib/password-validator.ts`     | Password strength validation                                   |
| `apps/web/lib/constants.ts`              | Shared constants (plan levels, etc.)                           |
| `apps/web/package.json`                  | Dependencies and scripts                                       |

## A.2 API Route Index

See Section 6.1 for the complete API route inventory (70+ routes across 20 categories).

---

# Appendix B: Data Models

## B.1 Supabase Tables (Web-Relevant)

| Table                  | Purpose                            | RLS                    |
| ---------------------- | ---------------------------------- | ---------------------- |
| `users` (auth.users)   | User accounts                      | Supabase managed       |
| `subscriptions`        | Stripe subscription records        | Yes (user_id)          |
| `conversations`        | Chat conversation metadata         | Yes (user_id)          |
| `messages`             | Chat messages within conversations | Yes (via conversation) |
| `memories`             | User memory/context storage        | Yes (user_id)          |
| `shared_sessions`      | Shared conversation tokens         | Yes (creator_id)       |
| `schedules`            | Scheduled task definitions         | Yes (user_id)          |
| `schedule_runs`        | Schedule execution history         | Yes (via schedule)     |
| `user_waitlist`        | Waitlist entries (Pro/Max)         | Yes (user_id)          |
| `credits`              | User credit balance                | Yes (user_id)          |
| `vibe_agent_actions`   | Vibe agent action log              | Yes (user_id)          |
| `vibe_agent_messages`  | Vibe agent messages                | Yes (user_id)          |
| `workforce_tasks`      | Workforce task queue               | Yes (user_id)          |
| `workforce_executions` | Workforce execution history        | Yes (user_id)          |

## B.2 Key TypeScript Interfaces

### Chat Message

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  model?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}
```

### Chat Session

```typescript
interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  userId?: string;
  model?: string;
  folderId?: string;
  tags?: string[];
}
```

### Subscription

```typescript
interface Subscription {
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  stripe_price_id: string;
  plan_tier: 'hobby' | 'pro' | 'max' | 'team' | 'enterprise';
  current_period_end: string;
}
```

### Tool Call

```typescript
interface ToolCall {
  id: string;
  name: string;
  displayName?: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: ToolResult;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}
```

### Tool Result

```typescript
interface ToolResult {
  toolCallId: string;
  content: string | object;
  isError: boolean;
  preview?: string;
}
```

### Attachment

```typescript
interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'document' | 'audio' | 'video' | 'code';
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
}
```

### Connector

```typescript
interface Connector {
  id: string;
  name: string;
  description: string;
  category:
    | 'Productivity'
    | 'Developer'
    | 'CRM'
    | 'Marketing'
    | 'Finance'
    | 'Social'
    | 'AI'
    | 'Exclusive';
  authType: 'oauth' | 'api_key' | 'connection_string' | 'pat';
  actionCount: number;
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  exclusive?: boolean;
}
```

### AI Employee

```typescript
interface AIEmployeeBasic {
  id: string;
  name: string;
  description: string;
}

interface AIEmployee extends AIEmployeeBasic {
  color: string;
  avatar?: string;
  skills?: string[];
  model?: string;
  systemPrompt?: string;
  status?: 'idle' | 'working' | 'offline';
}
```

### Stream Update

```typescript
interface StreamingUpdate {
  type: 'content' | 'tool_call' | 'thinking' | 'error' | 'done';
  content?: string;
  toolCall?: ToolCall;
  thinking?: string;
  error?: string;
  tokenCount?: {
    input: number;
    output: number;
  };
}
```

### Rate Limit Config

```typescript
interface RateLimitConfig {
  id: string;
  tokens: number;
  window: string;
  failMode: 'open' | 'closed';
  identifier: 'ip' | 'jwt' | 'ip-or-jwt';
}
```

## B.3 Feature Module Index

| Feature Module  | Directory                   | Components | Hooks | Services | Stores |
| --------------- | --------------------------- | ---------- | ----- | -------- | ------ |
| Chat            | `features/chat/`            | 60+        | 17    | 30+      | 3      |
| Vibe            | `features/vibe/`            | 25+        | 14    | 22       | 5      |
| Billing         | `features/billing/`         | 1          | 2     | 4        | 0      |
| Workforce       | `features/workforce/`       | 4          | 2     | 1        | 0      |
| Media           | `features/media/`           | 1          | 0     | 1        | 0      |
| Connectors      | `features/connectors/`      | 1          | 0     | 0        | 0      |
| Settings        | `features/settings/`        | 1+         | 0     | 2+       | 0      |
| Support         | `features/support/`         | 1          | 0     | 0        | 0      |
| Marketplace     | `features/marketplace/`     | 0          | 2+    | 0        | 0      |
| Mission Control | `features/mission-control/` | 0          | 0     | 1+       | 0      |
| Pages           | `features/pages/`           | 5+         | 0     | 0        | 0      |

## B.4 Zustand Store Index

### Top-Level Stores (`stores/`)

| Store        | File                  | Persistence  | Key State                      |
| ------------ | --------------------- | ------------ | ------------------------------ |
| Chat         | `chatStore.ts`        | No           | Active sessions, message cache |
| Settings     | `settingsStore.ts`    | localStorage | Theme, preferences             |
| UI           | `uiStore.ts`          | No           | Sidebar state, modals          |
| Artifacts    | `artifactStore.ts`    | No           | Active artifacts               |
| Media        | `mediaStore.ts`       | No           | Media generation queue         |
| Memory       | `memoryStore.ts`      | No           | User memory entries            |
| Agent Status | `agentStatusStore.ts` | No           | Agent lifecycle states         |
| Scheduler    | `schedulerStore.ts`   | No           | Scheduled tasks                |

### Unified Stores (`stores/unified/`)

| Store               | File                         | Persistence  | Key State                        |
| ------------------- | ---------------------------- | ------------ | -------------------------------- |
| Unified Chat        | `unifiedChatStore.ts`        | localStorage | Full chat state (desktop-parity) |
| Auth                | `auth.ts`                    | No           | User session, subscription       |
| UI                  | `ui.ts`                      | No           | Extended UI state                |
| Model               | `modelStore.ts`              | localStorage | Selected model, provider         |
| Settings            | `settingsStore.ts`           | localStorage | User preferences                 |
| Account             | `accountStore.ts`            | No           | Profile data                     |
| Billing Usage       | `billingUsage.ts`            | No           | Token usage, billing             |
| Project             | `projectStore.ts`            | localStorage | Active project                   |
| Artifact            | `artifactStore.ts`           | No           | Code artifacts                   |
| Browser             | `browserStore.ts`            | No           | Browser state                    |
| Cloud               | `cloudStore.ts`              | No           | Cloud sync state                 |
| Code                | `codeStore.ts`               | No           | Code execution                   |
| Custom Instructions | `customInstructionsStore.ts` | localStorage | Per-agent instructions           |
| Error               | `errorStore.ts`              | No           | Error tracking                   |
| Execution           | `executionStore.ts`          | No           | Task execution state             |
| MCP                 | `mcpStore.ts`                | No           | MCP server connections           |
| Media Generation    | `mediaGenerationStore.ts`    | No           | Media generation state           |
| Memory              | `memoryStore.ts`             | No           | Agent memories                   |
| Terminal            | `terminalStore.ts`           | No           | Terminal sessions                |
| Updater             | `updaterStore.ts`            | No           | App update state                 |
| Usage               | `usageStore.ts`              | No           | API usage tracking               |
| Automation          | `automationStore.ts`         | No           | Automation state                 |

### Feature Stores

| Store               | File                                       | Persistence | Key State             |
| ------------------- | ------------------------------------------ | ----------- | --------------------- |
| Chat (feature)      | `features/chat/stores/chat-store.ts`       | No          | Feature-specific chat |
| Artifacts (feature) | `features/chat/stores/artifacts-store.ts`  | No          | Artifact rendering    |
| Vibe Agent          | `features/vibe/stores/vibe-agent-store.ts` | No          | Vibe agent state      |
| Vibe Chat           | `features/vibe/stores/vibe-chat-store.ts`  | No          | Vibe chat messages    |
| Vibe File           | `features/vibe/stores/vibe-file-store.ts`  | No          | Vibe file tree        |
| Vibe View           | `features/vibe/stores/vibe-view-store.ts`  | No          | Vibe panel layout     |

---

# Appendix C: Full API Route Inventory

## C.1 Authentication Routes

| Method | Path                      | Purpose                        | Auth | Rate Limit           |
| ------ | ------------------------- | ------------------------------ | ---- | -------------------- |
| POST   | `/api/auth/callback`      | OAuth callback handler         | No   | auth-login (5/15min) |
| GET    | `/api/auth/desktop-token` | Generate desktop linking token | Yes  | device-link (10/min) |
| POST   | `/api/auth/confirm`       | Email confirmation callback    | No   | auth-signup (3/hr)   |

## C.2 Chat Routes

| Method | Path                            | Purpose             | Auth | Rate Limit              |
| ------ | ------------------------------- | ------------------- | ---- | ----------------------- |
| POST   | `/api/chat/send`                | Send chat message   | Yes  | llm-completion (30/min) |
| GET    | `/api/chat/sessions`            | List user sessions  | Yes  | standard (60/min)       |
| GET    | `/api/chat/sessions/[id]`       | Get session details | Yes  | standard (60/min)       |
| DELETE | `/api/chat/sessions/[id]`       | Delete session      | Yes  | standard (60/min)       |
| POST   | `/api/chat/sessions/[id]/share` | Create share link   | Yes  | standard (60/min)       |

## C.3 LLM Routes

| Method | Path               | Purpose                         | Auth | Rate Limit              |
| ------ | ------------------ | ------------------------------- | ---- | ----------------------- |
| POST   | `/api/llm/v2/chat` | LLM chat completion (streaming) | Yes  | llm-streaming (20/min)  |
| POST   | `/api/completion`  | Ghost-text prompt completion    | Yes  | llm-completion (30/min) |

## C.4 Billing Routes

| Method | Path                     | Purpose                               | Auth | Rate Limit               |
| ------ | ------------------------ | ------------------------------------- | ---- | ------------------------ |
| POST   | `/api/checkout`          | Create Stripe checkout session        | Yes  | checkout (15/min)        |
| POST   | `/api/credit-topup`      | Purchase credit pack                  | Yes  | credit-topup (15/min)    |
| POST   | `/api/portal`            | Create Stripe customer portal session | Yes  | standard (60/min)        |
| POST   | `/api/stripe-webhook`    | Stripe event webhook                  | No   | stripe-webhook (100/min) |
| GET    | `/api/sync-subscription` | Sync subscription from Stripe         | Yes  | standard (60/min)        |

## C.5 Media Routes

| Method | Path               | Purpose        | Auth | Rate Limit                |
| ------ | ------------------ | -------------- | ---- | ------------------------- |
| POST   | `/api/media/image` | Generate image | Yes  | image-generation (10/min) |
| POST   | `/api/media/video` | Generate video | Yes  | video-generation (5/min)  |

## C.6 Voice Routes

| Method | Path                    | Purpose             | Auth | Rate Limit                   |
| ------ | ----------------------- | ------------------- | ---- | ---------------------------- |
| POST   | `/api/voice/transcribe` | Audio transcription | Yes  | audio-transcription (20/min) |
| POST   | `/api/voice/tts`        | Text-to-speech      | Yes  | audio-transcription (20/min) |

## C.7 Device Routes

| Method | Path                  | Purpose                 | Auth | Rate Limit           |
| ------ | --------------------- | ----------------------- | ---- | -------------------- |
| POST   | `/api/device/link`    | Initiate device pairing | Yes  | device-link (10/min) |
| POST   | `/api/device/approve` | Approve device link     | Yes  | device-link (10/min) |
| GET    | `/api/device/poll`    | Poll for link status    | Yes  | device-link (10/min) |

## C.8 User Routes

| Method | Path               | Purpose                  | Auth | Rate Limit              |
| ------ | ------------------ | ------------------------ | ---- | ----------------------- |
| GET    | `/api/me`          | Get current user profile | Yes  | standard (60/min)       |
| PATCH  | `/api/settings`    | Update user settings     | Yes  | standard (60/min)       |
| DELETE | `/api/user/data`   | Delete user data (GDPR)  | Yes  | user-data-delete (3/hr) |
| GET    | `/api/user/export` | Export user data (GDPR)  | Yes  | user-data-export (5/hr) |

## C.9 Marketplace Routes

| Method | Path                                   | Purpose                 | Auth | Rate Limit        |
| ------ | -------------------------------------- | ----------------------- | ---- | ----------------- |
| GET    | `/api/marketplace/skills`              | List marketplace skills | No   | standard (60/min) |
| GET    | `/api/marketplace/skills/[id]`         | Get skill details       | No   | standard (60/min) |
| POST   | `/api/marketplace/skills/[id]/install` | Install skill           | Yes  | standard (60/min) |

## C.10 Utility Routes

| Method | Path                   | Purpose                    | Auth | Rate Limit            |
| ------ | ---------------------- | -------------------------- | ---- | --------------------- |
| GET    | `/api/health`          | Health check endpoint      | No   | health-check (30/min) |
| GET    | `/api/csrf`            | Generate CSRF token        | No   | standard (60/min)     |
| GET    | `/api/models`          | List available models      | Yes  | standard (60/min)     |
| GET    | `/api/releases/latest` | Get latest desktop release | No   | download (30/min)     |
| POST   | `/api/waitlist`        | Join plan waitlist         | Yes  | standard (60/min)     |
| POST   | `/api/claim-offer`     | Claim promotional offer    | Yes  | claim-offer (3/hr)    |

## C.11 Workforce Routes

| Method | Path                        | Purpose               | Auth | Rate Limit        |
| ------ | --------------------------- | --------------------- | ---- | ----------------- |
| GET    | `/api/workforce/employees`  | List AI employees     | Yes  | standard (60/min) |
| POST   | `/api/workforce/tasks`      | Create workforce task | Yes  | standard (60/min) |
| GET    | `/api/workforce/tasks/[id]` | Get task status       | Yes  | standard (60/min) |

## C.12 Admin and Diagnostic Routes

| Method | Path                      | Purpose                 | Auth        | Rate Limit              |
| ------ | ------------------------- | ----------------------- | ----------- | ----------------------- |
| GET    | `/api/debug/rate-limit`   | Rate limit diagnostics  | Admin       | admin-security (10/min) |
| POST   | `/api/admin/security`     | Security administration | Admin       | admin-security (10/min) |
| GET    | `/api/webhook-diagnostic` | Webhook health check    | Admin       | admin-security (10/min) |
| POST   | `/api/cron/*`             | Cron job endpoints      | Cron secret | cron (30/min)           |

---

# Appendix D: Vibe Feature Architecture

## D.1 Overview

Vibe is a web-based coding workspace feature modeled after Bolt and Lovable. It provides a full development environment in the browser with AI-assisted coding.

## D.2 Component Architecture

```
features/vibe/
  layouts/
    VibeLayout.tsx           -- Full-screen layout (no main sidebar)
    VibeTopNav.tsx           -- Top navigation bar
    VibeSplitView.tsx        -- Resizable panel layout
  components/
    redesign/
      CodeEditorPanel.tsx    -- Monaco editor wrapper
      FileTreeView.tsx       -- File explorer sidebar
      LivePreviewPanel.tsx   -- Live browser preview
      SandpackPreviewPanel.tsx -- Sandpack-powered preview
      SimpleChatPanel.tsx    -- Chat panel within Vibe
      VibeEmptyState.tsx     -- Empty workspace state
      VibeEnhancedComposer.tsx -- Enhanced message input
      PhaseTimeline.tsx      -- Build phase progress
    chat/
      VibeChatCanvas.tsx     -- Chat message canvas
      VibeMessage.tsx        -- Single message component
      VibeMessageList.tsx    -- Message list
      VibeStatusBar.tsx      -- Status bar with metrics
      VibeThinkingIndicator.tsx -- AI thinking state
      VibeAgentAvatar.tsx    -- Agent avatar display
    agent-panel/
      AgentPanel.tsx         -- Agent selection/status panel
      AgentStatusCard.tsx    -- Individual agent status
      AgentMessageList.tsx   -- Agent communication log
      WorkingProcessSection.tsx -- Agent work visualization
    collaboration/
      SupervisorPanel.tsx    -- Multi-agent supervisor UI
      TaskBreakdown.tsx      -- Task decomposition view
    files/
      FilePreview.tsx        -- File content preview
      FileSelector.tsx       -- File picker dialog
      FileUpload.tsx         -- File upload handler
    input/
      VibeMessageInput.tsx   -- Message input for Vibe
    layout/
      VibeSidebar.tsx        -- Vibe-specific sidebar
```

## D.3 Vibe SDK

The Vibe SDK (`features/vibe/sdk/`) provides the client-side runtime:

| Module         | Purpose                                       |
| -------------- | --------------------------------------------- |
| `client.ts`    | WebSocket/HTTP client for Vibe backend        |
| `session.ts`   | Session management (create, restore, destroy) |
| `state.ts`     | Reactive state management for Vibe workspace  |
| `protocol.ts`  | Message protocol definitions                  |
| `blueprint.ts` | Project template/blueprint system             |
| `workspace.ts` | Workspace file operations                     |
| `emitter.ts`   | Event emitter for state changes               |
| `http.ts`      | HTTP transport layer                          |
| `ws.ts`        | WebSocket transport layer                     |
| `ndjson.ts`    | NDJSON streaming parser                       |
| `retry.ts`     | Retry logic for transient failures            |
| `types.ts`     | TypeScript type definitions                   |
| `utils.ts`     | Utility functions                             |

## D.4 Vibe Services

| Service                          | Purpose                                        |
| -------------------------------- | ---------------------------------------------- |
| `vibe-agent-router.ts`           | Route messages to appropriate agent            |
| `vibe-agent-tools.ts`            | Tool definitions for Vibe agents               |
| `vibe-complexity-analyzer.ts`    | Analyze task complexity for agent selection    |
| `vibe-execution-coordinator.ts`  | Coordinate multi-step executions               |
| `vibe-file-manager.ts`           | Manage workspace files                         |
| `vibe-file-sync.ts`              | Sync files between editor and preview          |
| `vibe-file-system.ts`            | Virtual file system for workspace              |
| `vibe-message-handler.ts`        | Process incoming messages                      |
| `vibe-message-pool.ts`           | Message queue and buffering                    |
| `vibe-message-service.ts`        | Message CRUD operations                        |
| `vibe-phase-orchestrator.ts`     | Manage build phases (plan, code, test, deploy) |
| `vibe-sandbox-manager.ts`        | Sandpack sandbox lifecycle                     |
| `vibe-templates.ts`              | Project starter templates                      |
| `vibe-token-tracker.ts`          | Track token usage per session                  |
| `vibe-tool-orchestrator.ts`      | Orchestrate tool execution within Vibe         |
| `vibe-deployment-manager.ts`     | Deploy Vibe projects                           |
| `vibe-collaboration-protocol.ts` | Multi-user collaboration protocol              |

---

# Appendix E: Chat Feature Architecture

## E.1 Component Inventory

### Composer Components

| Component        | File                            | Purpose                                     |
| ---------------- | ------------------------------- | ------------------------------------------- |
| ChatComposer     | `Composer/ChatComposer.tsx`     | Main chat input (pill-shaped, glassmorphic) |
| ChatComposerNew  | `Composer/ChatComposerNew.tsx`  | Redesigned composer variant                 |
| ActiveModeTags   | `Composer/ActiveModeTags.tsx`   | Display active chat modes                   |
| ComposerFooter   | `Composer/ComposerFooter.tsx`   | Below-composer information                  |
| DragDropOverlay  | `Composer/DragDropOverlay.tsx`  | File drag-and-drop zone                     |
| FocusModeButtons | `Composer/FocusModeButtons.tsx` | Focus mode toggle buttons                   |
| InputFooter      | `Composer/InputFooter.tsx`      | Character count and hints                   |
| SendButton       | `Composer/SendButton.tsx`       | Send message button (ArrowUp icon)          |
| SlashCommandMenu | `Composer/SlashCommandMenu.tsx` | Slash command autocomplete                  |

### Message Components

| Component                   | File                                       | Purpose                             |
| --------------------------- | ------------------------------------------ | ----------------------------------- |
| MessageBubble               | `messages/MessageBubble.tsx`               | Single message bubble with avatar   |
| AdvancedMessageList         | `messages/AdvancedMessageList.tsx`         | Virtualized message list            |
| MessageListNew              | `messages/MessageListNew.tsx`              | Redesigned message list             |
| MessageActions              | `messages/MessageActions.tsx`              | Copy, edit, delete, branch actions  |
| EnhancedMarkdownRenderer    | `messages/EnhancedMarkdownRenderer.tsx`    | Rich markdown with LaTeX, mermaid   |
| ReasoningAccordion          | `messages/ReasoningAccordion.tsx`          | Expandable thinking/reasoning       |
| ToolTimeline                | `messages/ToolTimeline.tsx`                | Collapsible tool execution timeline |
| TypingIndicator             | `messages/TypingIndicator.tsx`             | AI typing animation                 |
| AudioPlayer                 | `messages/AudioPlayer.tsx`                 | Audio message playback              |
| AudioVisualizer             | `messages/AudioVisualizer.tsx`             | Audio waveform display              |
| ChatInput                   | `messages/ChatInput.tsx`                   | Legacy message input                |
| CollaborativeMessageDisplay | `messages/CollaborativeMessageDisplay.tsx` | Multi-agent messages                |
| EnhancedMessageInput        | `messages/EnhancedMessageInput.tsx`        | Enhanced input with tools           |

### Sidebar Components

| Component            | File                               | Purpose                   |
| -------------------- | ---------------------------------- | ------------------------- |
| ChatSidebar          | `Sidebar/ChatSidebar.tsx`          | Main chat sidebar         |
| ChatSidebarNew       | `Sidebar/ChatSidebarNew.tsx`       | Redesigned sidebar        |
| ConversationListItem | `Sidebar/ConversationListItem.tsx` | Single session entry      |
| FolderManagement     | `Sidebar/FolderManagement.tsx`     | Folder create/edit/delete |

### Dialog Components

| Component               | File                                  | Purpose                                   |
| ----------------------- | ------------------------------------- | ----------------------------------------- |
| BookmarksDialog         | `dialogs/BookmarksDialog.tsx`         | View bookmarked messages                  |
| CreateBranchDialog      | `dialogs/CreateBranchDialog.tsx`      | Create conversation branch                |
| CustomShortcutDialog    | `dialogs/CustomShortcutDialog.tsx`    | Manage prompt shortcuts                   |
| EnhancedExportDialog    | `dialogs/EnhancedExportDialog.tsx`    | Export conversation (PDF, DOCX, JSON, MD) |
| GlobalSearchDialog      | `dialogs/GlobalSearchDialog.tsx`      | Search all conversations                  |
| KeyboardShortcutsDialog | `dialogs/KeyboardShortcutsDialog.tsx` | View keyboard shortcuts                   |
| ShareDialog             | `dialogs/ShareDialog.tsx`             | Share conversation via link               |
| TokenAnalyticsDialog    | `dialogs/TokenAnalyticsDialog.tsx`    | Token usage analytics                     |
| UsageWarningModal       | `dialogs/UsageWarningModal.tsx`       | Usage limit warning                       |

### Tool Components

| Component             | File                                  | Purpose                       |
| --------------------- | ------------------------------------- | ----------------------------- |
| ToolCallCard          | `ToolCallCard.tsx`                    | Single tool execution card    |
| ToolTimeline          | `messages/ToolTimeline.tsx`           | Timeline of tool executions   |
| ToolProgressIndicator | `workflows/ToolProgressIndicator.tsx` | Tool progress bar             |
| WorkflowDisplay       | `workflows/WorkflowDisplay.tsx`       | Multi-step workflow view      |
| WorkingProcess        | `workflows/WorkingProcess.tsx`        | Agent working process display |

## E.2 Chat Hooks

| Hook                           | Purpose                                   |
| ------------------------------ | ----------------------------------------- |
| `use-chat-interface.ts`        | Main chat interface controller            |
| `use-chat-persistence.ts`      | Save/load conversations from Supabase     |
| `use-chat-queries.ts`          | TanStack Query hooks for chat data        |
| `use-conversation-branches.ts` | Branch management (create, switch, merge) |
| `use-conversation-history.ts`  | Navigate conversation history             |
| `use-export-conversation.ts`   | Export to PDF, DOCX, Markdown, JSON       |
| `use-keyboard-shortcuts.ts`    | Register chat keyboard shortcuts          |
| `use-message-reactions.ts`     | Message reaction management               |
| `use-multi-agent-chat.ts`      | Multi-agent chat orchestration            |
| `use-search-history.ts`        | Search conversation history               |
| `use-session-tokens.ts`        | Token usage tracking per session          |
| `use-tool-integration.ts`      | Tool execution handling                   |
| `use-voice-recording.ts`       | Voice input recording and transcription   |
| `use-ai-preferences.ts`        | AI model and behavior preferences         |
| `use-agent-collaboration.ts`   | Multi-agent collaboration flows           |

## E.3 Chat Services

| Service                                    | Purpose                               |
| ------------------------------------------ | ------------------------------------- |
| `chat-ai-service.ts`                       | LLM routing and invocation            |
| `streaming-response-handler.ts`            | SSE stream parsing and buffering      |
| `chat-tool-router.ts`                      | Route tool calls to handlers          |
| `tool-execution-handler.ts`                | Execute individual tools              |
| `conversation-storage.ts`                  | Supabase conversation CRUD            |
| `conversation-branching.ts`                | Branch creation and navigation        |
| `conversation-export.ts`                   | Export conversation to formats        |
| `document-export-service.ts`               | PDF/DOCX document generation          |
| `document-generation-service.ts`           | Generate documents from chat          |
| `attachment-handler.ts`                    | File attachment processing            |
| `folder-management-service.ts`             | Folder CRUD for organizing sessions   |
| `global-search-service.ts`                 | Full-text search across conversations |
| `message-bookmarks-service.ts`             | Bookmark management                   |
| `message-reactions-service.ts`             | Reaction management                   |
| `message-routing-service.ts`               | Route messages to correct agent       |
| `message-delivery-service.ts`              | Reliable message delivery             |
| `multi-agent-collaboration-service.ts`     | Multi-agent coordination              |
| `realtime-collaboration-service.ts`        | Real-time collaboration               |
| `web-search-integration.ts`                | Web search tool integration           |
| `employee-chat-service.ts`                 | AI employee chat handling             |
| `enhanced-chat-synchronization-service.ts` | Cross-tab sync                        |
| `user-shortcuts.ts`                        | Custom prompt shortcuts               |
| `code-execution-service.ts`                | Code sandbox execution                |

---

# Appendix F: Environment Variable Reference (Complete)

## F.1 Critical Variables (Build Fails Without)

| Variable                             | Type   | Example                        | Validation                             |
| ------------------------------------ | ------ | ------------------------------ | -------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`           | URL    | `https://xxx.supabase.co`      | Must be valid HTTPS URL                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | String | `eyJhbGciOiJIUzI1NiIs...`      | Non-empty                              |
| `SUPABASE_SERVICE_ROLE_KEY`          | String | `eyJhbGciOiJIUzI1NiIs...`      | Non-empty, server-only                 |
| `STRIPE_SECRET_KEY`                  | String | `sk_live_...` or `sk_test_...` | Starts with `sk_`                      |
| `STRIPE_WEBHOOK_SECRET`              | String | `whsec_...`                    | Starts with `whsec_`                   |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | String | `pk_live_...` or `pk_test_...` | Starts with `pk_`                      |
| `NEXT_PUBLIC_APP_URL`                | URL    | `https://agiworkforce.com`     | HTTPS in production, no trailing slash |

## F.2 Important Variables (Features Degraded Without)

| Variable                      | Type   | Example                        | Default                      |
| ----------------------------- | ------ | ------------------------------ | ---------------------------- |
| `CSRF_SECRET`                 | String | Random 32+ chars               | Required for CSRF protection |
| `CRON_SECRET`                 | String | Random 32+ chars               | Required for cron endpoints  |
| `UPSTASH_REDIS_REST_URL`      | URL    | `https://xxx.upstash.io`       | Falls back to in-memory      |
| `UPSTASH_REDIS_REST_TOKEN`    | String | `AXxx...`                      | Falls back to in-memory      |
| `DEVICE_TOKEN_ENCRYPTION_KEY` | String | Random 32+ chars               | Required for device linking  |
| `TOTP_ENCRYPTION_KEY`         | String | Random 32+ chars               | Required for 2FA             |
| `NEXT_PUBLIC_API_URL`         | URL    | `https://api.agiworkforce.com` | Required for API gateway     |
| `DESKTOP_GITHUB_OWNER`        | String | `agiworkforce`                 | Required for release checks  |
| `DESKTOP_GITHUB_REPO`         | String | `desktop`                      | Required for release checks  |

## F.3 Stripe Price IDs (Required for Billing)

| Variable                     | Plan              | Interval |
| ---------------------------- | ----------------- | -------- |
| `STRIPE_PRICE_HOBBY_MONTHLY` | Hobby ($4.99/mo)  | Monthly  |
| `STRIPE_PRICE_HOBBY_YEARLY`  | Hobby ($49.99/yr) | Yearly   |
| `STRIPE_PRICE_PRO_MONTHLY`   | Pro ($19.99/mo)   | Monthly  |
| `STRIPE_PRICE_PRO_YEARLY`    | Pro ($199.99/yr)  | Yearly   |
| `STRIPE_PRICE_MAX_MONTHLY`   | Max ($249.99/mo)  | Monthly  |
| `STRIPE_PRICE_MAX_YEARLY`    | Max ($2499.99/yr) | Yearly   |

**Consistency validation**: `validate-env.ts` checks that all 6 price IDs are present when any one is set. Missing price IDs produce a warning at build time.

## F.4 Optional Variables

| Variable                           | Type    | Purpose                     | Default Behavior            |
| ---------------------------------- | ------- | --------------------------- | --------------------------- |
| `NEXT_PUBLIC_GA_TRACKING_ID`       | String  | Google Analytics 4          | No analytics                |
| `OPENAI_API_KEY`                   | String  | OpenAI server-side calls    | OpenAI features disabled    |
| `ANTHROPIC_API_KEY`                | String  | Anthropic server-side calls | Anthropic features disabled |
| `GOOGLE_API_KEY`                   | String  | Google AI server-side calls | Google features disabled    |
| `ALLOWED_ORIGINS`                  | CSV     | Additional CORS origins     | APP_URL only                |
| `NEXT_PUBLIC_DOWNLOAD_URL_MAC`     | URL     | macOS download link         | Empty download page         |
| `NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS` | URL     | Windows download link       | Empty download page         |
| `NEXT_PUBLIC_DOWNLOAD_URL_LINUX`   | URL     | Linux download link         | Empty download page         |
| `LOG_LEVEL`                        | String  | Pino log level              | `info`                      |
| `NEXT_PUBLIC_ENABLE_WAITLIST`      | Boolean | Show waitlist for Pro/Max   | `false`                     |

---

# Appendix G: Glossary

| Term    | Definition                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------- |
| BYOK    | Bring Your Own Keys -- users provide their own LLM API keys instead of using a subscription              |
| CC      | Client Component -- React component rendered on the client (uses `'use client'` directive)               |
| CDN     | Content Delivery Network -- edge caching layer provided by Vercel                                        |
| CLS     | Cumulative Layout Shift -- Core Web Vital measuring visual stability                                     |
| CTA     | Call To Action -- button or link prompting user action (e.g., "Get Started Free")                        |
| CSP     | Content Security Policy -- HTTP header controlling which resources can load on a page                    |
| CSRF    | Cross-Site Request Forgery -- attack where a malicious site tricks a user's browser into making requests |
| FCP     | First Contentful Paint -- time until first text or image renders                                         |
| GFM     | GitHub Flavored Markdown -- extended Markdown syntax with tables, task lists, etc.                       |
| HMAC    | Hash-based Message Authentication Code -- cryptographic signature algorithm                              |
| INP     | Interaction to Next Paint -- Core Web Vital measuring input responsiveness                               |
| ISR     | Incremental Static Regeneration -- Next.js feature for updating static pages without rebuild             |
| JSON-LD | JSON for Linked Data -- structured data format for SEO (used in schema.org markup)                       |
| LCP     | Largest Contentful Paint -- Core Web Vital measuring when main content is visible                        |
| LLM     | Large Language Model -- AI model that generates text (GPT, Claude, Gemini, etc.)                         |
| MCP     | Model Context Protocol -- Anthropic's extensibility standard for connecting tools to AI models           |
| MSW     | Mock Service Worker -- API mocking library for testing                                                   |
| PKCE    | Proof Key for Code Exchange -- OAuth security extension preventing authorization code interception       |
| RLS     | Row Level Security -- PostgreSQL feature ensuring users can only access their own data                   |
| RSC     | React Server Component -- component rendered on the server (no client-side JavaScript)                   |
| SAML    | Security Assertion Markup Language -- enterprise SSO protocol                                            |
| SSE     | Server-Sent Events -- HTTP-based one-way streaming protocol (server to client)                           |
| SSO     | Single Sign-On -- authentication mechanism allowing users to log in once for multiple services           |
| SSR     | Server-Side Rendering -- HTML generated on the server per request                                        |
| TOTP    | Time-based One-Time Password -- 2FA mechanism using authenticator apps                                   |
| TTFB    | Time to First Byte -- time until the server sends the first byte of response                             |
| Vibe    | AGI Workforce's web-based AI coding workspace (web equivalent of Bolt/Lovable)                           |
| WCAG    | Web Content Accessibility Guidelines -- W3C standard for web accessibility                               |
| WSS     | WebSocket Secure -- encrypted WebSocket protocol for real-time communication                             |

---

_End of PRD-WEB.md_
_Document version 1.1.0 -- Last updated 2026-03-15_
_Total sections: 13 + 7 appendices_
