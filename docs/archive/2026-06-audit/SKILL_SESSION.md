# SKILL_SESSION.md

Status: Active
Owner: VC-demo production push (ultracode workflow)
Last updated: 2026-06-13
Session goal: AGI Workforce Web (`apps/web`) → ChatGPT/Claude.ai parity for active VC demo.

This file records the skills and MCP capabilities loaded for this session per Phase 0 of the
workflow. Skills were enumerated from the session skill manifest + the `mcp__skills__*` registry.
Only skills relevant to Next.js / React / UI / design systems / chat interfaces / auth /
deployment / Vercel / Tailwind / testing / web performance / security / API integration are
loaded as active references.

## Loaded skills (relevant to this session)

### Engineering (code quality, architecture, verification)
- `engineering:code-review` — bug/security/perf/maintainability review of touched files.
- `engineering:review` — review code changes for security, performance, correctness.
- `engineering:system-design` — API design, data modeling, service boundaries (chat sync, providers).
- `engineering:testing-strategy` — test plans/coverage for changed surfaces.
- `engineering:tech-debt` — categorize/prioritize refactors (ties into existing AUDIT_FINDINGS).
- `engineering:debug` — reproduce → isolate → diagnose → fix for streaming/render bugs.
- `engineering:documentation` — READMEs/runbooks/handoff docs.
- `security-review` / `review` / `init` — security-focused review + repo bootstrap conventions.

### Design (visual fidelity, UX, accessibility)
- `design:design-system-management` — design tokens, component library, pattern docs (packages/design-tokens).
- `design:design-critique` — usability, visual hierarchy, consistency vs reference.
- `design:accessibility-review` — WCAG 2.1 AA on chat + public pages.
- `design:ux-writing` — microcopy, error/empty/loading states (no lorem ipsum).
- `design:design-handoff` — design→implementation specs.
- `design:user-research` — only if synthesizing power-user expectations.

### Artifact / theming helpers
- `anthropic-skills:web-artifacts-builder` — complex React + Tailwind + shadcn/ui artifacts.
- `anthropic-skills:theme-factory` — theme tokens (colors/fonts) for artifacts/pages.
- `anthropic-skills:brand-guidelines` — applying a consistent look-and-feel.
- `anthropic-skills:canvas-design` — static visual design (posters/og images) if needed.
- `anthropic-skills:humanizer` — strip AI-tells from any user-facing copy.

### Product / spec (for PRD-style change docs)
- `product-management:feature-spec` / `product-management:write-spec` — PRDs/acceptance criteria.

### Data viz (only if building dashboards/status pages)
- `data:data-visualization`, `data:interactive-dashboard-builder`.

## Loaded MCP capabilities (tools, not skills)
- **Context7** (`mcp__Context7__*`) — live docs for Next.js 16, Tailwind v4, shadcn/ui, Radix,
  Lucide, Framer Motion. Mandatory before touching any fast-moving library API.
- **Vercel** (`mcp__1c6dd3a0…__*`) — project/deployment/runtime-log/env inspection for
  `prj_vDA7A5nZakjYscIsc47JyGqek3Ea` (team `team_QAqU2q6NTV4xxn971rfTy1F4`). Source of truth for
  which provider API keys are configured (Phase 3 "working models").
- **Playwright** (`mcp__plugin_playwright_playwright__*`) — headless browser for screenshot
  verification of the running dev server (Phase 5 visual gate).
- **Claude in Chrome** (`mcp__Claude_in_Chrome__*`) — live-site inspection of chat.openai.com /
  claude.ai when JS-rendered content is needed for fact-checking.
- **Apify / web_fetch / WebSearch** — current-UI fact-checking and changelog lookups.

## Not loaded (out of scope this session)
Sales/marketing/finance/legal/CRM/Slack/data-warehouse skills, `mcp-builder`, `skill-creator`,
`slack-gif-creator`, `algorithmic-art` — not relevant to the web-app production push.

## Verification tooling for this session
- Visual: sandbox `pnpm --filter @agiworkforce/web dev` + headless Playwright screenshot, compared
  against `~/Desktop/reference/` images.
- Type/build: `pnpm --filter @agiworkforce/web typecheck`, `pnpm --filter @agiworkforce/web test`,
  `pnpm lint`.
- Guardrails: `pnpm check:llm-failures`, `pnpm check:model-catalog`, `pnpm check:agent-context`.
